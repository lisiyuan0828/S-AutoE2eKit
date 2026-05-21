/**
 * @tencent/e2e-kit/reporters/quantified-summary-reporter
 *
 * 🅵 方案落地：quantified-summary 作为**唯一报告入口**，右侧详情 tab 化。
 *
 * ─── 设计目标 ──────────────────────────────────────────────────────
 *   作为 Playwright E2E 报告的唯一入口（取代用户在 PW 内置 HTML reporter 与
 *   quantified-summary 之间切换的体验）。右侧详情面板按数据语义分 tab：
 *
 *     📝 业务详情      — quantified-reporter 渲染的 step.detail markdown
 *     📷 截图          — 该 step 关联的 success/error 截图墙
 *     ⚠️ 错误          — fail step 的 actual + 时间窗口内的 pageErrors
 *     📋 运行期信号    — 时间窗口内的 console / networkFailures
 *     📦 Trace & PW    — 跳到同目录 PW 原生报告 + `npx playwright show-trace`
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ Tests (左侧树)         │  Step 详情 (右侧)   │
 *   │  ▼ TC-MAIN-02 · I18N   │  [📝][📷][⚠️][📋][📦]│
 *   │    ▶ S01.1 PASS       │  ─────────────────  │
 *   │    ■ S02.3 FAIL       │  # 🔴 FAIL · ...   │
 *   │    …                  │  （markdown 渲染）  │
 *   └──────────────────────────────────────────────┘
 *
 * ─── 数据流 ──────────────────────────────────────────────────────
 *   阶段 1（spec 运行期）：
 *     quantified-reporter.finalize() → 每个 case JSON 落盘（含 shotsByStep）
 *     PW runtime → 对失败 test 写 trace.zip / test-failed-N.png 到 PW 内部目录
 *
 *   阶段 2（本 reporter 运行期）：
 *     onTestEnd(test, result) → 累积 PW result.attachments，按 caseId 索引
 *       （caseId 通过 testInfo.annotations { type: 'qd:caseId' } 反查）
 *     onEnd() → 扫 testResultsDir → 合并 PW attachments 进 case payload
 *             → 把所有引用到的本地图片复制到 <outputDir>/_assets/<caseId>/
 *             → 改写 JSON 里的绝对路径为相对路径（HTML 同目录可寻址）
 *             → 内嵌全部数据 + marked.umd.js → 写 quantified-summary.html
 *
 * ─── 自完备约束 ──────────────────────────────────────────────────
 *   - 不依赖 fetch（file:// 协议下被 CORS 阻塞）
 *   - 不依赖 CDN（公司内网 jsdelivr / unpkg 可能不通）
 *   - 不依赖 Playwright 内部 API（仅用公开的 Reporter 接口）
 *
 * ─── 配置 ────────────────────────────────────────────────────────
 *   reporter: [
 *     ['list'],
 *     reporters.html.resolveHtmlReporter({ ... }),     // 仍保留 PW 原生增强报告，作为 trace viewer 入口
 *     reporters.quantifiedSummary.resolve({
 *       outputFile: 'playwright-report-enhanced/<runStamp>/quantified-summary.html',
 *       testResultsDir: 'test-results/<runStamp>',
 *       title: '企点 E2E 量化报告',
 *     }),
 *   ]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TEMPLATE_DIR = path.join(__dirname, '_summary-template');

/**
 * 从 testResultsDir 递归扫描所有 quantified JSON。
 * 仅认形如 `<sceneName>/<caseId>.json` 且包含 caseId 字段的文件。
 *
 * @param {string} rootDir
 * @returns {Array<{ scene: string, file: string, jsonPath: string, payload: object }>}
 */
function scanQuantifiedJsons(rootDir) {
  const out = [];
  if (!fs.existsSync(rootDir)) return out;
  const sceneDirs = fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  for (const scene of sceneDirs) {
    const sceneDir = path.join(rootDir, scene);
    const files = fs.readdirSync(sceneDir).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      const fp = path.join(sceneDir, f);
      try {
        const payload = JSON.parse(fs.readFileSync(fp, 'utf-8'));
        if (payload && typeof payload === 'object' && payload.caseId) {
          out.push({ scene, file: f, jsonPath: fp, payload });
        }
      } catch (_e) {
        /* skip 非 quantified JSON */
      }
    }
  }
  return out;
}

/**
 * 读取 marked UMD 源码（用 require.resolve 跨工作区找 marked 安装位置）。
 * 失败时返回 null，调用方降级为"未渲染纯文本"模式。
 */
function loadMarkedUmd() {
  try {
    const pkgPath = require.resolve('marked/package.json');
    const umdPath = path.join(path.dirname(pkgPath), 'lib', 'marked.umd.js');
    if (fs.existsSync(umdPath)) return fs.readFileSync(umdPath, 'utf-8');
  } catch (_e) {
    /* fall through */
  }
  return null;
}

/**
 * 把所有 case 引用到的本地图片复制到 `<outputDir>/_assets/<caseId>/...`，
 * 并将 JSON 里的绝对路径改写为「相对 outputFile 所在目录」的路径。
 *
 * 改写覆盖：
 *   - steps[i].screenshot
 *   - shotIndex.success[i].file / shotIndex.error[i].file
 *   - shotsByStep[stepId][i].file
 *   - pwAttachments[i].path（trace.zip / test-failed-N.png / video.webm）
 *
 * @param {Array<{scene, file, jsonPath, payload}>} cases
 * @param {string} outputFile  HTML 写盘路径
 * @returns {void}  原地修改 cases[i].payload
 */
function copyAssetsAndRewritePaths(cases, outputFile) {
  const outDir = path.dirname(path.resolve(outputFile));
  const assetsRoot = path.join(outDir, '_assets');

  // 同一文件可能被多处引用，缓存避免重复复制
  const copiedMap = new Map(); // absSrc -> relPath (POSIX, from outDir)

  /**
   * 复制单个文件，返回 outDir 视角的相对路径（POSIX 风格，HTML 内部可直接当 src 用）。
   * 找不到源文件时返回原始字符串（不打断主流程）。
   */
  function copyOne(absSrc, caseId, subdir /* 'shots' | 'pw' */) {
    if (!absSrc || typeof absSrc !== 'string') return absSrc;
    if (copiedMap.has(absSrc)) return copiedMap.get(absSrc);
    if (!fs.existsSync(absSrc)) {
      // 文件不存在（被清理了）— 保留原值，前端做 onerror 容错
      return absSrc;
    }
    const safeCase = (caseId || '_unknown').replace(/[^\w.-]+/g, '_');
    const baseName = path.basename(absSrc);
    // 用文件 mtime 做去重短哈希前缀，避免不同 step 同名（如 snapshot.png）冲突
    let stamp = '';
    try {
      const st = fs.statSync(absSrc);
      stamp = `${st.size}-${Math.floor(st.mtimeMs)}`;
    } catch (_e) { stamp = String(Date.now()); }
    const hashed = `${stamp.slice(-12)}-${baseName}`;
    const relDir = path.join('_assets', safeCase, subdir);
    const relPath = path.join(relDir, hashed);
    const absDst = path.join(outDir, relPath);
    try {
      fs.mkdirSync(path.dirname(absDst), { recursive: true });
      fs.copyFileSync(absSrc, absDst);
    } catch (_e) {
      return absSrc; // 复制失败也不打断主流程
    }
    const posixRel = relPath.split(path.sep).join('/');
    copiedMap.set(absSrc, posixRel);
    return posixRel;
  }

  for (const c of cases) {
    const p = c.payload || {};
    const caseId = p.caseId || c.file.replace(/\.json$/, '');

    // 1) steps[i].screenshot
    if (Array.isArray(p.steps)) {
      for (const s of p.steps) {
        if (s.screenshot) s.screenshot = copyOne(s.screenshot, caseId, 'shots');
      }
    }

    // 2) shotIndex.{success,error}[i].file
    if (p.shotIndex && typeof p.shotIndex === 'object') {
      for (const kind of ['success', 'error']) {
        const list = p.shotIndex[kind] || [];
        for (const it of list) {
          if (it && it.file) it.file = copyOne(it.file, caseId, 'shots');
        }
      }
    }

    // 3) shotsByStep[stepId][i].file
    if (p.shotsByStep && typeof p.shotsByStep === 'object') {
      for (const stepId of Object.keys(p.shotsByStep)) {
        const list = p.shotsByStep[stepId] || [];
        for (const it of list) {
          if (it && it.file) it.file = copyOne(it.file, caseId, 'shots');
        }
      }
    }

    // 4) pwAttachments[i].path  —— trace.zip / test-failed-N.png / video.webm
    if (Array.isArray(p.pwAttachments)) {
      for (const a of p.pwAttachments) {
        if (a && a.path) a.path = copyOne(a.path, caseId, 'pw');
      }
    }
  }
}

/**
 * 渲染 summary HTML。
 *
 * @param {object} args
 * @param {string} args.title
 * @param {Array<object>} args.cases   每个 case = { scene, file, payload }
 * @param {string|null} args.markedUmd  可选：marked UMD 源码
 * @param {string} args.runStamp
 * @param {string} args.pwReportRel    PW 原生 HTML 报告的相对路径（一般为 'index.html'）
 * @returns {string} HTML 全文
 */
function renderSummaryHtml({ title, cases, markedUmd, runStamp, pwReportRel }) {
  const tplPath = path.join(TEMPLATE_DIR, 'summary.html');
  const cssPath = path.join(TEMPLATE_DIR, 'summary.css');
  const jsPath = path.join(TEMPLATE_DIR, 'summary.js');
  const tpl = fs.readFileSync(tplPath, 'utf-8');
  const css = fs.readFileSync(cssPath, 'utf-8');
  const js = fs.readFileSync(jsPath, 'utf-8');

  const dataBlock = JSON.stringify({
    title,
    runStamp,
    generatedAt: new Date().toISOString(),
    pwReportRel: pwReportRel || 'index.html',
    cases,
  })
    // 防止 </script> 关闭脚本标签
    .replace(/<\/script>/gi, '<\\/script>');

  return tpl
    .replace('/*__INJECT_CSS__*/', css)
    .replace('/*__INJECT_MARKED__*/', markedUmd || '/* marked not available; markdown will display as plain text */')
    .replace('/*__INJECT_DATA__*/', dataBlock)
    .replace('/*__INJECT_JS__*/', js)
    .replace(/__INJECT_TITLE__/g, escapeHtml(title));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Playwright Reporter。
 *
 * @typedef {Object} QuantifiedSummaryOptions
 * @property {string} [outputFile]       生成路径，默认 playwright-report-enhanced/quantified-summary.html
 * @property {string} [testResultsDir]   扫描 quantified JSON 的根目录，默认 test-results
 * @property {string} [title]            HTML 标题
 * @property {string} [pwReportRel]      PW 原生报告相对路径，默认 'index.html'（同目录）
 */
class QuantifiedSummaryReporter {
  /**
   * @param {QuantifiedSummaryOptions} [opts]
   */
  constructor(opts = {}) {
    this._outputFile = opts.outputFile || 'playwright-report-enhanced/quantified-summary.html';
    this._testResultsDir = opts.testResultsDir || 'test-results';
    this._title = opts.title || 'Quantified E2E Summary';
    this._pwReportRel = opts.pwReportRel || 'index.html';

    // caseId -> Array<{ name, contentType, path }>
    // 在 onTestEnd 累积 PW result.attachments，onEnd 时合到 case.payload.pwAttachments
    this._pwAttachmentsByCase = new Map();
  }

  // PW Reporter API
  onBegin() {}
  onError() {}

  /**
   * 收集 PW 原生 attachment（trace.zip / test-failed-N.png / video.webm 等）。
   * 通过 testInfo.annotations 里的 'qd:caseId' 反查 caseId（由 quantified-reporter 注入）。
   *
   * @param {import('@playwright/test/reporter').TestCase} test
   * @param {import('@playwright/test/reporter').TestResult} result
   */
  onTestEnd(test, result) {
    try {
      const ann = (test.annotations || []).find((a) => a && a.type === 'qd:caseId');
      const caseId = ann && ann.description;
      if (!caseId) return;
      const list = this._pwAttachmentsByCase.get(caseId) || [];
      for (const a of (result.attachments || [])) {
        if (!a || !a.path) continue;
        // 仅收 PW 自动产物（reporter 通过 testInfo.attach 挂的 quantified.json / step md 不算）
        // 通过 contentType / 文件名启发式分类
        const baseName = path.basename(a.path);
        const ext = path.extname(baseName).toLowerCase();
        let category = 'other';
        if (baseName === 'trace.zip' || ext === '.zip') category = 'trace';
        else if (/^test-failed-\d+\.(png|jpg|jpeg)$/i.test(baseName)) category = 'failedShot';
        else if (ext === '.webm' || ext === '.mp4') category = 'video';
        else if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') category = 'screenshot';

        list.push({
          name: a.name || baseName,
          contentType: a.contentType || '',
          path: a.path,
          originalPath: a.path, // 保留 PW 原始绝对路径，给 `npx playwright show-trace` 命令行用
          category,
        });
      }
      if (list.length) this._pwAttachmentsByCase.set(caseId, list);
    } catch (_e) {
      /* PW reporter hook 失败不能打断主流程 */
    }
  }

  async onEnd() {
    try {
      const cases = scanQuantifiedJsons(this._testResultsDir);
      if (!cases.length) {
        // eslint-disable-next-line no-console
        console.warn(
          `[@tencent/e2e-kit/quantified-summary] 未在 ${this._testResultsDir} 下找到任何 quantified JSON，跳过 summary HTML 生成。`,
        );
        return;
      }

      // 合并 PW attachment 到对应 case payload
      for (const c of cases) {
        const cid = (c.payload && c.payload.caseId) || '';
        const pw = this._pwAttachmentsByCase.get(cid);
        if (pw && pw.length) {
          c.payload.pwAttachments = pw;
        }
      }

      // 复制截图 / PW 产物到 _assets，改写路径为相对路径（HTML 同目录可直接寻址）
      copyAssetsAndRewritePaths(cases, this._outputFile);

      const markedUmd = loadMarkedUmd();
      const runStamp = path.basename(this._testResultsDir);
      const html = renderSummaryHtml({
        title: this._title,
        cases,
        markedUmd,
        runStamp,
        pwReportRel: this._pwReportRel,
      });
      const outDir = path.dirname(this._outputFile);
      if (outDir && !fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(this._outputFile, html, 'utf-8');
      // eslint-disable-next-line no-console
      console.log(
        `[@tencent/e2e-kit/quantified-summary] ✅ 生成 quantified summary: ${this._outputFile}（${cases.length} 个 case）`,
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[@tencent/e2e-kit/quantified-summary] 生成失败：', e);
    }
  }
}

/**
 * Playwright reporter resolver。
 *
 * @param {QuantifiedSummaryOptions} [opts]
 * @returns {[string, QuantifiedSummaryOptions]}
 */
function resolve(opts = {}) {
  return [path.join(__dirname, 'quantified-summary-reporter-bridge.js'), opts];
}

module.exports = {
  QuantifiedSummaryReporter,
  resolve,
  // 供高级用法 / 单测使用
  scanQuantifiedJsons,
  renderSummaryHtml,
  loadMarkedUmd,
  copyAssetsAndRewritePaths,
};
