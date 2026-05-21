/**
 * @tencent/e2e-kit/reporters/html · 自建 HTML Reporter（方案 F）
 *
 * 设计目标：
 *   1. 复用 Playwright 内置 HtmlReporter 的全部 UI / 数据契约 / 交互
 *      （runtime 通过 require('playwright/lib/runner').html 取得，跟随用户安装的版本）
 *   2. 在每个测试 finalize 前，把 quantified-reporter 已生成的业务 JSON
 *      作为 attachment 注入到 testInfo，让用户在 HTML UI 里能直接下载查看
 *   3. 0 依赖任何项目专属常量（铁律 1/2 必守）
 *   4. require playwright/lib/runner 失败时降级为"打印警告 + 仅产 markdown"，
 *      不抛错破坏整个测试流程（铁律 4：向后兼容）
 *
 * 使用方式（消费方 playwright.config.js）：
 *   const { resolveHtmlReporter } = require('@tencent/e2e-kit/reporters/html-reporter');
 *   module.exports = {
 *     reporter: [
 *       ['list'],
 *       resolveHtmlReporter({
 *         outputFolder: 'playwright-report',
 *         open: 'never',
 *         title: '我的项目 E2E 报告',
 *         attachQuantifiedJson: true,     // 自动 attach 同名 quantified JSON（默认 true）
 *         resultsRoot: 'test-results',    // quantified JSON 根目录（默认 test-results）
 *       }),
 *     ],
 *   };
 *
 * 为何返回的是 [reporterPath, opts] 而不是 class？
 *   Playwright reporter 接收的是 ["路径或包名", opts] 数组。我们让消费方
 *   通过 resolveHtmlReporter() 得到形如 ['/.../html-reporter-bridge.js', opts]
 *   的接入数组，运行时由 Playwright 自己 new 起来，行为与内置 reporter 一致。
 *
 * 数据契约（attach 注入）：
 *   每个 testCase 在 onTestEnd 时，从 <projectRoot>/<resultsRoot>/<runStamp>/<sceneName>/<caseId>.json
 *   读取（如果存在）quantified payload，作为 'application/json' attachment
 *   附加到 testInfo.attachments，名字为 'quantified.json'。
 *   sceneName 与 caseId 从 testInfo.title / testInfo.titlePath / 或 spec 文件路径推导，
 *   推导失败时跳过 attach（不影响主流程）。
 */

'use strict';

const fs = require('fs');
const path = require('path');

// 注意：本文件由 Playwright 在 reporter 进程里 require 起来运行。
// 任何 import 都必须保证消费方的 node_modules 里有对应包；否则降级处理。

/**
 * 尝试 require Playwright runner bundle 的 html 命名空间。
 * 失败时返回 null，调用方决定降级行为。
 *
 * 为什么这样写：
 *   - playwright/package.json 在 1.60+ 把 "./lib/runner" 加入 exports 白名单
 *     （而不是私有 internal），所以这是 *官方支持* 的访问路径
 *   - 但 "playwright" 顶级包只在 dev 环境会被装上（@playwright/test 的依赖）
 *   - 极端环境（如裁剪过的 CI 镜像）可能没有，我们要优雅降级
 *
 * @returns {{ HtmlReporter: Function, showHTMLReport: Function }|null}
 */
function tryLoadPlaywrightHtml() {
  try {
    // eslint-disable-next-line global-require, import/no-unresolved
    const runner = require('playwright/lib/runner');
    if (!runner || !runner.html || !runner.html.default) return null;
    return {
      HtmlReporter: runner.html.default,
      showHTMLReport: runner.html.showHTMLReport,
    };
  } catch (_e) {
    return null;
  }
}

/**
 * 从 testInfo 推导 quantified JSON 路径。
 *
 * 推导规则（约定优于配置）：
 *   1. 用例 ID（caseId）= test title 中匹配 /TC-[A-Z0-9-]+/ 的第一个 token
 *   2. 场景名（sceneName）= spec 文件相对路径中位于 'tests/e2e/' 之后的第一段目录名
 *      e.g. tests/e2e/<scene>/<case>.spec.js → sceneName=<scene>
 *      （以 _ 开头的目录视为非场景目录，如 _shared / _utils / _reporters）
 *   3. runStamp 由 quantified-reporter 写入时已固定为 <YYYYMMDD>_<branch>
 *      我们读 <resultsRoot>/<runStamp>/<sceneName>/<caseId>.json
 *      —— 但 reporter 进程 attach 时还不知道 runStamp，所以扫一下：
 *      找 <resultsRoot> 下最新（mtime 最大）的 runStamp 子目录
 *
 * @param {import('@playwright/test/reporter').TestCase} test
 * @param {string} projectRoot
 * @param {string} resultsRoot
 * @returns {string|null}  quantified JSON 绝对路径（不存在或推导失败返回 null）
 */
function resolveQuantifiedJsonPath(test, projectRoot, resultsRoot) {
  // 1. caseId
  const fullTitle = (test.titlePath && test.titlePath().join(' · ')) || test.title || '';
  const caseIdMatch = fullTitle.match(/TC-[A-Z0-9-]+/i);
  if (!caseIdMatch) return null;
  const caseId = caseIdMatch[0];

  // 2. sceneName（从 spec 路径推导）
  const specFile = test.location && test.location.file;
  if (!specFile) return null;
  const norm = specFile.replace(/\\/g, '/');
  // 匹配 tests/e2e/<scene>/...
  const sceneMatch = norm.match(/tests\/e2e\/([^/]+)\//);
  if (!sceneMatch) return null;
  const sceneName = sceneMatch[1];
  // 排除 _shared / _utils / _reporters 这种以 _ 开头的非场景目录
  if (sceneName.startsWith('_')) return null;

  // 3. 找最新的 runStamp
  const resultsAbsRoot = path.isAbsolute(resultsRoot)
    ? resultsRoot
    : path.join(projectRoot, resultsRoot);
  if (!fs.existsSync(resultsAbsRoot)) return null;

  let latestStamp = null;
  let latestMtime = 0;
  try {
    const entries = fs.readdirSync(resultsAbsRoot, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      // runStamp 形如 20260518_master / 20260518_feature-x
      if (!/^\d{8}_/.test(ent.name)) continue;
      const stat = fs.statSync(path.join(resultsAbsRoot, ent.name));
      if (stat.mtimeMs > latestMtime) {
        latestMtime = stat.mtimeMs;
        latestStamp = ent.name;
      }
    }
  } catch (_e) {
    return null;
  }
  if (!latestStamp) return null;

  // 4. 拼最终路径
  const candidate = path.join(resultsAbsRoot, latestStamp, sceneName, `${caseId}.json`);
  return fs.existsSync(candidate) ? candidate : null;
}

/**
 * 读取 quantified JSON 并转换为 attachment 描述符。
 *
 * @param {string} jsonPath
 * @returns {{name: string, contentType: string, body: Buffer}|null}
 */
function readQuantifiedAttachment(jsonPath) {
  try {
    const buf = fs.readFileSync(jsonPath);
    return {
      name: 'quantified.json',
      contentType: 'application/json',
      body: buf,
    };
  } catch (_e) {
    return null;
  }
}

/**
 * 创建增强版 HtmlReporter class。
 *
 * 工厂模式：必须在运行时（require 起来后）创建，因为父类 HtmlReporter
 * 是从 require('playwright/lib/runner').html.default 拿到的，
 * 顶层 require 时机不一定能拿到（取决于消费方环境）。
 *
 * @param {Function} BaseHtmlReporter Playwright 内置 HtmlReporter class
 * @returns {Function} 增强版 reporter class
 */
function createEnhancedHtmlReporter(BaseHtmlReporter) {
  return class EnhancedHtmlReporter extends BaseHtmlReporter {
    constructor(options = {}) {
      super(options);
      // 业务专属选项（不传给父类的 super，避免污染父类 _options）
      this._e2eKitAttachQuantifiedJson =
        options.attachQuantifiedJson !== false; // 默认 true
      this._e2eKitResultsRoot = options.resultsRoot || 'test-results';
      this._e2eKitProjectRoot = null; // onConfigure 时填充
      this._e2eKitWarned = { resolveFail: false, attachFail: false };
    }

    onConfigure(config) {
      super.onConfigure(config);
      // config.rootDir 是 Playwright 解析后的项目根（playwright.config.js 所在目录）
      this._e2eKitProjectRoot = config.rootDir || process.cwd();
    }

    onTestEnd(test, result) {
      // 关键钩子：在 super.onTestEnd 把 result 序列化进 zip 之前，
      // 把 quantified attachment 塞进 result.attachments。
      // Playwright HtmlReporter 在 build 时直接读 result.attachments，
      // 所以我们这里 push 后下游会自动收录。
      try {
        if (this._e2eKitAttachQuantifiedJson && this._e2eKitProjectRoot) {
          this._injectQuantifiedAttachment(test, result);
        }
      } catch (e) {
        if (!this._e2eKitWarned.attachFail) {
          this._e2eKitWarned.attachFail = true;
          // eslint-disable-next-line no-console
          console.warn(
            `[@tencent/e2e-kit/html] attach quantified.json 失败（仅警告一次）：${
              e && e.message ? e.message : e
            }`,
          );
        }
      }
      // 父类签名：onTestEnd(test, result) → undefined
      if (typeof super.onTestEnd === 'function') {
        return super.onTestEnd(test, result);
      }
      return undefined;
    }

    _injectQuantifiedAttachment(test, result) {
      const jsonPath = resolveQuantifiedJsonPath(
        test,
        this._e2eKitProjectRoot,
        this._e2eKitResultsRoot,
      );
      if (!jsonPath) {
        if (!this._e2eKitWarned.resolveFail) {
          this._e2eKitWarned.resolveFail = true;
          // eslint-disable-next-line no-console
          console.warn(
            `[@tencent/e2e-kit/html] 无法定位 quantified JSON（test="${test.title}"），后续同类警告已抑制。如不需要可设 attachQuantifiedJson:false。`,
          );
        }
        return;
      }
      const att = readQuantifiedAttachment(jsonPath);
      if (!att) return;
      // 防重：如果已经 attach 过同名 quantified.json，不重复加
      if (
        Array.isArray(result.attachments) &&
        result.attachments.some((a) => a && a.name === att.name)
      ) {
        return;
      }
      result.attachments = result.attachments || [];
      result.attachments.push(att);
    }
  };
}

/**
 * 桥接文件路径（运行时由 Playwright 起的 reporter 进程加载）。
 *
 * Playwright reporter 接受 [reporterPath, opts]，其中 reporterPath 必须是
 * "可被 Node require 的字符串"。我们这里把它指向 ./html-reporter-bridge.js，
 * 该桥接文件的唯一职责：在 reporter 进程里实时取出 BaseHtmlReporter 并 export 增强版。
 *
 * 为什么不能直接让 playwright.config.js 写本文件路径？
 *   Playwright 要求 reporter 模块 module.exports = class（v2 协议）。
 *   本文件导出的是 helper 工厂；真正的 class export 留给 bridge 文件。
 */
const BRIDGE_PATH = path.join(__dirname, 'html-reporter-bridge.js');

/**
 * 给消费方使用的 reporter 数组项工厂。
 *
 * @param {object} [opts]
 * @param {string} [opts.outputFolder='playwright-report']
 * @param {'always'|'never'|'on-failure'} [opts.open='never']
 * @param {string} [opts.title]
 * @param {string} [opts.attachmentsBaseURL]
 * @param {boolean} [opts.attachQuantifiedJson=true]
 * @param {string} [opts.resultsRoot='test-results']
 * @param {boolean} [opts.noSnippets]  关闭每个 step 旁的源码 snippet 块 + 标题尾部的"调用栈位置"链接。
 *                                      默认 false。当 reporter 内部统一调 test.step（如 quantified-reporter）
 *                                      时，所有 step 的 source location 都会指向 reporter 自己，对用户毫无价值，
 *                                      此时建议设 true 让 UI 干净。
 * @param {boolean} [opts.noCopyPrompt] 关闭"Copy prompt"按钮（Playwright 1.50+），默认 false。
 * @returns {[string, object]}  Playwright reporter 数组项格式
 */
function resolveHtmlReporter(opts = {}) {
  return [
    BRIDGE_PATH,
    {
      outputFolder: opts.outputFolder || 'playwright-report',
      open: opts.open || 'never',
      ...(opts.title ? { title: opts.title } : {}),
      ...(opts.attachmentsBaseURL ? { attachmentsBaseURL: opts.attachmentsBaseURL } : {}),
      ...(opts.noSnippets !== undefined ? { noSnippets: !!opts.noSnippets } : {}),
      ...(opts.noCopyPrompt !== undefined ? { noCopyPrompt: !!opts.noCopyPrompt } : {}),
      attachQuantifiedJson: opts.attachQuantifiedJson !== false,
      resultsRoot: opts.resultsRoot || 'test-results',
    },
  ];
}

module.exports = {
  resolveHtmlReporter,
  // 内部测试 / 高级用例可访问的工厂
  createEnhancedHtmlReporter,
  tryLoadPlaywrightHtml,
  // path 字段方便消费方直接拿桥接路径（不走工厂）
  bridgePath: BRIDGE_PATH,
  // 暴露推导工具，便于单测
  _internal: {
    resolveQuantifiedJsonPath,
    readQuantifiedAttachment,
  },
};
