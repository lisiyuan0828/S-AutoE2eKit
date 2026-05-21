/**
 * 量化测试报告生成器（场景无关 · 工厂核心资产）
 *
 * 用途：
 *   把 spec 在执行过程中采集的"指标 / 步骤 / 截图 / 断言"等数据，
 *   渲染为人眼可读的 Markdown 报告 + 机器可读的 JSON 原始数据。
 *
 * 设计原则：
 *   1. 一个测试用例（test）= 一份报告
 *   2. 一个场景（scene）的多个用例聚合到 docs/qa-reports/<scene>/ 目录
 *   3. 报告文件名带时间戳，方便回溯历史
 *   4. JSON 原始数据放 test-results/<scene>/<case>.json，便于 CI 解析
 *
 * 报告结构：
 *   - 头部：用例元数据（ID / 标题 / 优先级 / 维度 / 起止时间 / 总耗时）
 *   - 核心结论：✅ Pass / ⚠️ Warn / ❌ Fail + 一句话摘要
 *   - 步骤详情表：Step / 动作 / 选择器 / 预期 / 实际 / 耗时 / 截图
 *   - 持久化校验表（i18n 等场景额外可附加）
 *   - 视觉证据（截图链接）
 *   - 失败诊断 hints
 *   - 附录（脚本路径 / 原始 JSON / Trace）
 *
 * 业务无关：
 *   - 不内置任何项目专属命名 / 域名 / key
 *   - step 蓝图字典（blueprintLookup）由调用方传入；不传则走"无蓝图降级"模式
 *     （无中文语义标题、无 phase 分组、无失败手册，但所有数据采集与基础渲染照常工作）
 */

const fs = require('fs');
const path = require('path');
const { test } = require('@playwright/test');
const { getRunStamp } = require('../utils/run-context');

class QuantifiedReporter {
  /**
   * @param {object} opts
   * @param {string} opts.sceneName  场景名（如 'i18n'），决定输出目录
   * @param {string} opts.caseId     用例 ID（如 'TC-I18N-P0-02'）
   * @param {string} opts.title      用例标题
   * @param {'P0'|'P1'|'P2'} opts.priority
   * @param {string[]} [opts.dimensions]  覆盖的维度代号（如 ['F2', 'P1-P5']）
   * @param {string} [opts.entryUrl]  fixture 入口 URL
   * @param {string} opts.projectRoot 项目根目录
   * @param {object} [opts.blueprintLookup] step 蓝图字典（需提供 getBlueprint / renderFailureMarkdown / renderFailureTitle / renderStepTitle / renderStepTitleNeutral / renderStepDetail / renderFailureReason / renderOverviewMindmap）
   *                                       不传则进入"无蓝图降级"模式：仍可生成报告，但缺少 phase 分组、失败手册、UI 中文语义标题等增强能力。
   *                                       业务专属的 step-blueprints 实现由消费方在主仓库注入，不进本包。
   */
  constructor(opts) {
    this.sceneName = opts.sceneName;
    this.caseId = opts.caseId;
    this.title = opts.title;
    this.priority = opts.priority;
    this.dimensions = opts.dimensions || [];
    this.entryUrl = opts.entryUrl || '';
    this.projectRoot = opts.projectRoot;
    // 蓝图查找器（场景可插拔）
    this.blueprintLookup = opts.blueprintLookup || null;
    // 累积每张截图的 caption，最后写入 INDEX.md
    // 结构：{ success: [{file, stepId, phaseCode, phaseName, intent, captionExtra}], error: [...] }
    this.shotIndex = { success: [], error: [] };
    // Playwright UI step buffer：finally 时统一 flush，让 UI 节点带中文语义标题
    this._uiStepQueue = [];

    this.startedAt = new Date();
    this.steps = []; // { id, action, selector, expected, actual, durationMs, screenshot, status }
    this.assertions = []; // { name, expected, actual, ok }
    this.persistenceSnapshots = {}; // { 'before': {...}, 'after-en': {...}, ... }
    this.warnings = [];
    this.errors = [];
    this.consoleEvents = []; // { ts, type, text, location }
    this.networkFailures = []; // { ts, url, method, failure, status }
    this.pageErrors = []; // { ts, message, stack }

    // 输出路径（按 YYYYMMDD_branch 分档，与 playwright.config.js 一致）
    const { stamp } = getRunStamp({ projectRoot: this.projectRoot });
    this.runStamp = stamp;
    this.qaReportsDir = path.join(
      this.projectRoot,
      'docs/qa-reports',
      this.runStamp,
      this.sceneName,
    );
    this.testResultsDir = path.join(
      this.projectRoot,
      'test-results',
      this.runStamp,
      this.sceneName,
    );
    this.screenshotsDir = path.join(this.testResultsDir, this.caseId);
    // 截图分桶：成功路径 vs 失败现场
    this.successShotsDir = path.join(this.screenshotsDir, 'success');
    this.errorShotsDir = path.join(this.screenshotsDir, 'error');

    fs.mkdirSync(this.qaReportsDir, { recursive: true });
    fs.mkdirSync(this.testResultsDir, { recursive: true });
    fs.mkdirSync(this.screenshotsDir, { recursive: true });
    fs.mkdirSync(this.successShotsDir, { recursive: true });
    fs.mkdirSync(this.errorShotsDir, { recursive: true });

    // ─── 🅵 方案：给当前 PW test 注入 caseId annotation ───
    // 设计意图：让下游 PW Reporter（如 quantified-summary）能通过
    // `test.annotations.find(a => a.type === 'qd:caseId')` 反向关联
    // PW 的 testCase（含 trace.zip 等 attachments）和 quantified JSON。
    // 容错：不在 Playwright runner 中（如单元测试）则跳过。
    try {
      const ti = test.info();
      if (ti && Array.isArray(ti.annotations)) {
        ti.annotations.push({ type: 'qd:caseId', description: this.caseId });
        ti.annotations.push({ type: 'qd:scene', description: this.sceneName });
      }
    } catch (_e) {
      /* not in PW runner — skip */
    }
  }

  /**
   * 高阶 step 运行器（可选使用）：把一段业务逻辑包装为一个语义化的 test.step 节点
   *
   * 未来有需要时可以让 scenarios.js 里的代码块递进使用这个高阶 API：
   *   await reporter.runStep('S04.1.5', async () => {
   *     const panelMounted = await page.evaluate(...);
   *     return { status: panelMounted ? 'pass' : 'skip', actual: ... };
   *   });
   *
   * 这样 Playwright UI 只会出现一个中文语义节点，裡面的 page.evaluate 作为子节点。
   *
   * ⚠ 当前策略：scenarios.js 仍使用裸调用 + recordStep 的写法，
   * 调用者可选择逐步平滑升级为 runStep。
   *
   * @param {string} stepId
   * @param {() => Promise<object|void>} fn 返回 { status, actual, warn?, fail?, screenshot? } 或 void(=pass)
   * @returns {Promise<object>} fn 的返回值
   */
  async runStep(stepId, fn) {
    if (!this.blueprintLookup || typeof this.blueprintLookup.renderStepTitle !== 'function') {
      return this._runStepFallback(stepId, fn);
    }
    let testApi;
    try {
      testApi = test;
    } catch (_e) {
      return this._runStepFallback(stepId, fn);
    }

    const t0 = Date.now();
    let outcome = { status: 'pass' };
    let caughtError = null;
    const provisionalTitle = this.blueprintLookup.renderStepTitle(stepId, 'pass');

    await testApi.step(provisionalTitle, async () => {
      try {
        const ret = await fn();
        if (ret && typeof ret === 'object') outcome = { status: 'pass', ...ret };
      } catch (e) {
        caughtError = e;
        outcome = {
          status: 'fail',
          actual: String(e && e.message ? e.message : e).slice(0, 200),
        };
      }
      try {
        const detail = this.blueprintLookup.renderStepDetail({
          id: stepId,
          action: outcome.action || '',
          selector: outcome.selector || '',
          expected: outcome.expected || '',
          actual: outcome.actual || '',
          durationMs: Date.now() - t0,
          status: outcome.status,
        });
        const ti = test.info();
        await ti.attach(`${stepId}.md`, {
          body: detail,
          contentType: 'text/markdown',
        });
      } catch (_e) {
        /* noop */
      }
    });

    const bp = this.blueprintLookup.getBlueprint(stepId);
    this.recordStep({
      id: stepId,
      action: outcome.action || (bp && bp.intent) || '',
      selector: outcome.selector || '',
      expected: outcome.expected || (bp && bp.successMeans) || '',
      actual: outcome.actual || '',
      durationMs: Date.now() - t0,
      screenshot: outcome.screenshot || '',
      status: outcome.status,
    });
    if (outcome.warn) this.warn(outcome.warn);
    if (outcome.fail) this.fail(outcome.fail);
    if (caughtError) {
      this.fail(`${stepId} 拋出异常：${caughtError.message}`);
    }
    return outcome;
  }

  async _runStepFallback(stepId, fn) {
    const t0 = Date.now();
    try {
      const ret = await fn();
      const out = ret || { status: 'pass' };
      this.recordStep({
        id: stepId,
        action: out.action || '',
        actual: out.actual || '',
        durationMs: Date.now() - t0,
        status: out.status || 'pass',
      });
      return out;
    } catch (e) {
      this.recordStep({
        id: stepId,
        action: '',
        actual: e.message,
        durationMs: Date.now() - t0,
        status: 'fail',
      });
      this.fail(`${stepId} 拋出异常：${e.message}`);
      return { status: 'fail', actual: e.message };
    }
  }

  /**
   * 记录一个 Step
   *
   * ⚡️ 隐藏逆向：当 status === 'fail' 且 spec 未传 screenshot，
   * reporter 会在后续手动调用 reporter.snapshotForFailure(page, step) 补上。
   * 这里只负责存起来；自动截图逻辑由 spec 主动触发。
   *
   * @param {object} step
   * @param {string} step.id 例如 'S01'
   * @param {string} step.action 例如 'goto'
   * @param {string} [step.selector]
   * @param {string} [step.expected]
   * @param {string} [step.actual]
   * @param {number} [step.durationMs]
   * @param {string} [step.screenshot]  绝对路径或 null
   * @param {'pass'|'fail'|'skip'} [step.status='pass']
   */
  recordStep(step) {
    const durationMs = step.durationMs ?? 0;
    // endTs 默认为"现在"；startTs = endTs - durationMs，方便 finalize 时画 gantt
    const endTs = step.endTs ?? Date.now();
    const startTs = step.startTs ?? endTs - durationMs;
    const normalized = {
      id: step.id,
      action: step.action,
      selector: step.selector || '',
      expected: step.expected || '',
      actual: step.actual || '',
      durationMs,
      startTs,
      endTs,
      screenshot: step.screenshot || '',
      status: step.status || 'pass',
    };
    this.steps.push(normalized);

    // 同步在 Playwright UI 中制造一个“语义标题 step”，让 UI 展现中文说明。
    // 这是一个 fire-and-forget 调用，差服务不会抱错。
    // ⚠ 注意：test 没被如期居在一个 Playwright test 上下文中运行时，会报错 ——这里打包个 try 兑底。
    this._uiStep(normalized);
  }

  /**
   * 在 Playwright 报告 UI 中作为一个 step 节点出现，带语义标题 + 中文详细说明 attach。
   * pass/skip 都走该逻辑；fail 除了 attach 外，还会让该 step 打上“软标记”（不接管主是否失败，
   * 主是否失败由 spec 结束时的 attachAndAssertResult 决定）。
   *
   * @param {object} step 已归一化的 step 对象
   */
  _uiStep(step) {
    if (!this.blueprintLookup) return;
    // 必须有中性标题函数，避免出现"标题里带 ❌ 字符 + Playwright 自己又画 ✅ 图标"的状态自相矛盾
    const renderNeutral = this.blueprintLookup.renderStepTitleNeutral;
    if (typeof renderNeutral !== 'function') return;
    try {
      test.info();
    } catch (_e) {
      // 不在 Playwright runner 中（如 unit test）——跳过
      return;
    }
    const title = renderNeutral(step.id, step.status);
    const detail = this.blueprintLookup.renderStepDetail
      ? this.blueprintLookup.renderStepDetail(step)
      : '';
    const failureReason = this.blueprintLookup.renderFailureReason
      ? this.blueprintLookup.renderFailureReason(step)
      : '';

    // buffer 到最后统一 flush（在 spec finally 阶段），避免 await test.step 在业务流程中嵌套
    this._uiStepQueue.push({ title, detail, failureReason, status: step.status, stepId: step.id });
  }

  /**
   * 在 spec finally 阶段调用：将阶段期间 buffer 的 UI step 一一 flush 到 test.step。
   * 仅在 Playwright runner 上下文生效。
   *
   * 为什么 buffer 而不是实时 await：
   *   - 在 scenarios.js 中 await test.step 会让业务逻辑被 Playwright 生命周期介入（嵌套、出错可能会被包装）
   *   - buffer 到最后统一 flush，保证 spec 业务代码不被侵入
   *
   * @returns {Promise<void>}
   */
  async flushUISteps() {
    if (!this._uiStepQueue.length) return;
    let testInfo;
    try {
      testInfo = test.info();
    } catch (_e) {
      return;
    }
    for (const item of this._uiStepQueue) {
      // skip 用 test.step.skip：UI 显示"跳过"图标，不会显示成 ✅
      const stepFn = item.status === 'skip' && typeof test.step.skip === 'function'
        ? test.step.skip.bind(test)
        : test.step.bind(test);

      try {
        // ─────────────────────────────────────────────────────────────────
        // step.attach 业务 markdown 详情
        // ─────────────────────────────────────────────────────────────────
        // 设计：外层 step 标题 = 业务量化标题（PASS/FAIL · Sxx · [Px·...]），
        //       回调里直接 attach <stepId>.md（用 step.attach 让附件归属本 step）。
        //
        // 注意：Playwright 内置 HTML reporter 的 step 节点点击展开行为由
        //       `(step.steps.length || step.snippet)` 决定，**与 attachments 无关**。
        //       配合 noSnippets:true（避免标题尾巴渲染 reporter 内部代码片段），
        //       本 step 行不会"整行可展开"——这是 PW 内置 reporter 的设计局限。
        //
        // 详情查看入口：由独立的 quantified-summary.html（@tencent/e2e-kit/reporters/
        //              quantified-summary-reporter）提供——内嵌全部 step.detail 的
        //              markdown 全文，左侧 step 树 + 右侧 markdown 渲染，体验最佳。
        // ─────────────────────────────────────────────────────────────────
        await stepFn(item.title, async (step) => {
          if (item.detail) {
            try {
              // step 形参在 Playwright 1.46+ 一定有 attach；老版本兜底到 testInfo
              const attachFn = (step && typeof step.attach === 'function')
                ? step.attach.bind(step)
                : testInfo.attach.bind(testInfo);
              await attachFn(`${item.stepId}.md`, {
                body: item.detail,
                contentType: 'text/markdown',
              });
            } catch (_e) {
              /* attach 失败不影响主流程 */
            }
          }
          // 关键：fail 必须真正 throw，UI 才会画 ❌ 图标 + 红字原因
          // 主 spec 是否失败仍由 attachAndAssertResult 决定（这里 throw 只影响本 step 节点的图标和原因展示）
          if (item.status === 'fail') {
            throw new Error(item.failureReason || `${item.stepId} 业务断言失败（详见 quantified-summary.html）`);
          }
        });
      } catch (_e) {
        // fail step throw 出来的错误已经被 Playwright 记录在该 step 节点上，外层吞掉避免影响后续 step 渲染
      }
    }
    // flush 后清空，避免重复
    this._uiStepQueue = [];
  }

  /**
   * 记录一个断言
   */
  recordAssertion(name, expected, actual, ok) {
    this.assertions.push({ name, expected, actual, ok: !!ok });
  }

  /**
   * 记录一份持久化快照（i18n 等场景常用）
   * @param {string} label 例如 'before' / 'after-zh-to-en'
   * @param {object} data
   */
  recordPersistenceSnapshot(label, data) {
    this.persistenceSnapshots[label] = data;
  }

  warn(message) {
    this.warnings.push(message);
  }

  fail(message) {
    this.errors.push(message);
  }

  /**
   * 让 reporter 自己接管 page 的 console / pageerror / requestfailed 事件。
   * 调用后 reporter.consoleEvents / reporter.pageErrors / reporter.networkFailures 会自动填充。
   * 只在需要的 spec 里调一次即可，逆向可选（返回 detach 函数）。
   *
   * @param {import('@playwright/test').Page} page
   * @param {object} [opts]
   * @param {boolean} [opts.captureWarnings=false] 是否也收 console.warn
   * @returns {() => void} detach
   */
  attachPage(page, opts = {}) {
    const captureWarnings = !!opts.captureWarnings;
    const onConsole = (msg) => {
      const type = msg.type();
      // 默认只收 error；opts 打开后才收 warning。log/info/debug 一律忽略，避免被业务日志汤淹。
      if (type === 'error' || (captureWarnings && type === 'warning')) {
        let location = '';
        try {
          const loc = msg.location();
          if (loc && loc.url) {
            location = `${loc.url}:${loc.lineNumber || 0}:${loc.columnNumber || 0}`;
          }
        } catch (_e) {
          /* noop */
        }
        this.consoleEvents.push({
          ts: Date.now(),
          type,
          text: String(msg.text()).slice(0, 500),
          location,
        });
      }
    };
    const onPageError = (err) => {
      this.pageErrors.push({
        ts: Date.now(),
        message: String(err && err.message).slice(0, 500),
        stack: String((err && err.stack) || '').slice(0, 1500),
      });
    };
    const onRequestFailed = (req) => {
      let failure = '';
      try {
        const f = req.failure();
        failure = (f && f.errorText) || '';
      } catch (_e) {
        /* noop */
      }
      this.networkFailures.push({
        ts: Date.now(),
        url: req.url(),
        method: req.method(),
        failure,
        status: 'failed',
      });
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('requestfailed', onRequestFailed);
    return () => {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('requestfailed', onRequestFailed);
    };
  }

  /**
   * 截图便捷方法：调用时自动归档到 case 目录下的 success/<phase>/ 或 error/<phase>/ 子桶。
   *
   * ⚡ 升级说明（资深 QA 视视重造）：
   *   - 不再是扫平的 success/error，而是 success/<phase-code-name>/ 、error/<phase-code-name>/
   *   - 文件名不再是“stepId-name”，而是“<stepId>__<intent>.png”，一眼能看出是哪个业务环节
   *   - 同时在内存里记一份 caption，finalize() 时写到 INDEX.md供读者快速索引
   *
   * @param {import('@playwright/test').Page} page
   * @param {string} stepId 例如 'S03'
   * @param {string|object} [nameOrOpts] 字符串（向后兼容 v1）或 { name, status, captionExtra }
   * @param {string} [nameOrOpts.name='snapshot']
   * @param {'success'|'error'} [nameOrOpts.status='success']
   * @param {string} [nameOrOpts.captionExtra] 额外备注（如“点击之后 5s”）
   * @returns {Promise<string>} 截图绝对路径
   */
  async snapshot(page, stepId, nameOrOpts = 'snapshot') {
    const opts =
      typeof nameOrOpts === 'string'
        ? { name: nameOrOpts }
        : { ...nameOrOpts };
    const name = opts.name || 'snapshot';
    const status = opts.status === 'error' ? 'error' : 'success';
    const captionExtra = opts.captionExtra || '';

    // 从蓝图查询 phase。查不到走 fallback（phase = unknown）
    const bp =
      (this.blueprintLookup && this.blueprintLookup.getBlueprint
        ? this.blueprintLookup.getBlueprint(stepId)
        : null) || null;
    const phase = bp ? bp.phase : { code: 'P0', name: 'unknown' };
    const phaseDir = `${phase.code}-${slugifyForFs(phase.name)}`;
    const intentSlug = slugifyForFs(name);

    const rootBucket = status === 'error' ? this.errorShotsDir : this.successShotsDir;
    const phaseBucket = path.join(rootBucket, phaseDir);
    fs.mkdirSync(phaseBucket, { recursive: true });

    const fileName = `${stepId}__${intentSlug}.png`;
    const fullPath = path.join(phaseBucket, fileName);
    try {
      await page.screenshot({ path: fullPath, fullPage: false });
    } catch (e) {
      this.warnings.push(`snapshot ${stepId}/${name} 失败：${String(e.message).slice(0, 200)}`);
      return '';
    }

    // 记一笔 caption，finalize 时写 INDEX.md
    this.shotIndex[status].push({
      file: fullPath,
      relFromBucket: path.join(phaseDir, fileName),
      stepId,
      phaseCode: phase.code,
      phaseName: phase.name,
      intent: bp ? bp.intent : name,
      captionExtra,
      isError: status === 'error',
    });

    return fullPath;
  }

  /**
   * 为“失败 step”抓一张现场照，自动归档到 error/<phase>/ 桶。
   * 返回绝对路径，spec 可选择是否回填到 step.screenshot。
   *
   * @param {import('@playwright/test').Page} page
   * @param {string} stepId
   * @param {string} [reason='failure']
   */
  async snapshotForFailure(page, stepId, reason = 'failure') {
    return this.snapshot(page, stepId, {
      name: reason,
      status: 'error',
      captionExtra: '失败现场',
    });
  }

  /**
   * 完成并写盘
   * @returns {{result: 'pass'|'warn'|'fail', mdPath: string, jsonPath: string}}
   */
  finalize() {
    const finishedAt = new Date();
    const totalMs = finishedAt - this.startedAt;

    let result = 'pass';
    if (this.errors.length > 0) result = 'fail';
    else if (this.warnings.length > 0 || this.steps.some((s) => s.status === 'fail')) result = 'warn';

    // ─── D3 · quantified-summary 数据底盘 ────────────────────────────────
    // 给每个 step 现场渲染 markdown detail 并写入 step.detail 字段。
    // 这样 quantified-summary HTML 完全自完备：直接读 JSON 就能拿到全部
    // 富文本，无需依赖 PW HTML reporter 的 attachment 链。
    // 失败容错：blueprint 缺失或 renderStepDetail 抛错时降级为空字符串，
    // 不影响主链路。
    const stepsWithDetail = this.steps.map((s) => {
      let detail = '';
      try {
        if (this.blueprintLookup && typeof this.blueprintLookup.renderStepDetail === 'function') {
          detail = this.blueprintLookup.renderStepDetail(s) || '';
        }
      } catch (_e) {
        detail = '';
      }
      return { ...s, detail };
    });

    // ─── 🅵 方案：把截图索引按 stepId 聚合，便于 quantified-summary 前端按 step 渲染缩略图墙 ───
    // shotIndex 是 reporter.snapshot 累积出来的（含 success/error 桶 + phase 子目录 + caption）。
    // shotsByStep[stepId] = [{file, kind, phaseCode, phaseName, intent, captionExtra}]
    const shotsByStep = {};
    for (const kind of ['success', 'error']) {
      for (const it of this.shotIndex[kind] || []) {
        const arr = shotsByStep[it.stepId] || (shotsByStep[it.stepId] = []);
        arr.push({
          file: it.file,
          kind,
          phaseCode: it.phaseCode,
          phaseName: it.phaseName,
          intent: it.intent,
          captionExtra: it.captionExtra || '',
        });
      }
    }

    const payload = {
      caseId: this.caseId,
      title: this.title,
      priority: this.priority,
      dimensions: this.dimensions,
      sceneName: this.sceneName,
      entryUrl: this.entryUrl,
      startedAt: this.startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      totalMs,
      result,
      steps: stepsWithDetail,
      assertions: this.assertions,
      persistenceSnapshots: this.persistenceSnapshots,
      warnings: this.warnings,
      errors: this.errors,
      consoleEvents: this.consoleEvents,
      pageErrors: this.pageErrors,
      networkFailures: this.networkFailures,
      // 🅵 新增：截图索引（绝对路径）+ 按 step 聚合后的快查表
      // 路径在 quantified-summary 生成阶段会被复制到 _assets/ 并改写为相对路径
      shotIndex: this.shotIndex,
      shotsByStep,
    };

    // 写 JSON
    const jsonPath = path.join(this.testResultsDir, `${this.caseId}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf-8');

    // 写两份 INDEX.md（成功路径 / 失败现场的“图采索引”）
    this._writeShotIndex('success');
    this._writeShotIndex('error');

    // 写 Markdown
    const date = finishedAt.toISOString().slice(0, 10);
    const mdPath = path.join(this.qaReportsDir, `${this.caseId}-${date}.md`);
    fs.writeFileSync(mdPath, this._renderMarkdown(payload), 'utf-8');

    // 同时写一份专供 CodeBuddy 自审的 prompt 资料包（self-review-pending.md）
    // 设计意图：运行后用户/CodeBuddy 只需读这一份，就能对 spec 质量、业务 bug、
    // 文档脱节三类问题作出判断。
    const reviewPath = path.join(
      this.qaReportsDir,
      `${this.caseId}-self-review-pending.md`,
    );
    fs.writeFileSync(reviewPath, this._renderSelfReviewPending(payload), 'utf-8');

    // 写一份"用例总览思维导图"（脱离 runStamp，长期维护）
    // 路径：docs/qa-reports/<sceneName>/<sceneName>-mindmap.md
    let mindmapOverviewPath = '';
    try {
      if (
        this.blueprintLookup &&
        typeof this.blueprintLookup.renderOverviewMindmap === 'function'
      ) {
        const overviewDir = path.join(
          this.projectRoot,
          'docs/qa-reports',
          this.sceneName,
        );
        fs.mkdirSync(overviewDir, { recursive: true });
        mindmapOverviewPath = path.join(
          overviewDir,
          `${this.sceneName}-mindmap.md`,
        );
        fs.writeFileSync(
          mindmapOverviewPath,
          this.blueprintLookup.renderOverviewMindmap(),
          'utf-8',
        );
      }
    } catch (e) {
      this.warnings.push(
        `写入用例总览思维导图失败：${String(e.message).slice(0, 200)}`,
      );
    }

    return {
      result,
      mdPath,
      jsonPath,
      reviewPath,
      mindmapOverviewPath,
      errorShotsDir: this.errorShotsDir,
      successShotsDir: this.successShotsDir,
    };
  }

  // ============================================================
  // 私有：Markdown 渲染
  // ============================================================
  _renderMarkdown(p) {
    const resultIcon = p.result === 'pass' ? '✅' : p.result === 'warn' ? '⚠️' : '❌';
    const resultText = p.result === 'pass' ? 'Pass' : p.result === 'warn' ? 'Warn' : 'Fail';
    const priorityIcon = { P0: '🔴', P1: '🟠', P2: '🟡' }[p.priority] || '⚪';

    const stepRows = p.steps
      .map((s) => {
        const statusIcon = s.status === 'pass' ? '✅' : s.status === 'fail' ? '❌' : '⏭️';
        const screenshot = s.screenshot
          ? `[查看](${path.relative(this.qaReportsDir, s.screenshot)})`
          : '—';
        return `| ${s.id} | ${statusIcon} ${s.action} | ${escapeMd(s.selector)} | ${escapeMd(
          s.expected,
        )} | ${escapeMd(s.actual)} | ${s.durationMs}ms | ${screenshot} |`;
      })
      .join('\n');

    const assertionRows = p.assertions
      .map((a) => {
        const icon = a.ok ? '✅' : '❌';
        return `| ${icon} ${escapeMd(a.name)} | ${escapeMd(String(a.expected))} | ${escapeMd(
          String(a.actual),
        )} |`;
      })
      .join('\n');

    const persistenceBlock = Object.keys(p.persistenceSnapshots).length
      ? Object.entries(p.persistenceSnapshots)
          .map(
            ([label, data]) =>
              `**${label}**\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
          )
          .join('\n\n')
      : '_（本用例未采集持久化快照）_';

    const passCount = p.steps.filter((s) => s.status === 'pass').length;
    const failCount = p.steps.filter((s) => s.status === 'fail').length;
    const passRate = p.steps.length ? Math.round((passCount / p.steps.length) * 100) : 0;

    // 视觉证据：按 phase 分组 + 带 caption
    const visualEvidenceBlock = this._renderVisualEvidence();

    // 执行时间轴（mermaid gantt）
    const timelineBlock = this._renderTimeline(p);

    // 用例思维导图（mermaid mindmap，本次执行版，含 pass/fail 标记）
    const mindmapBlock = this._renderMindmap(p);

    // 失败诊断手册：每一个失败 step 都渲染成“现象 + 可能原因 + 排查方向”教科书
    const failedSteps = p.steps.filter((s) => s.status === 'fail');
    const failureManualBlock = this._renderFailureManual(failedSteps);

    return `# ${p.caseId} · ${p.title}

> 生成时间：${p.finishedAt}
> 场景：\`${p.sceneName}\`
> 优先级：${priorityIcon} ${p.priority}
> 覆盖维度：${p.dimensions.join(' / ') || '—'}
> 入口 URL：${p.entryUrl || '—'}

---

## 🎯 执行结果

| 指标 | 值 |
| --- | --- |
| 总耗时 | ${p.totalMs} ms |
| 步骤数 | ${p.steps.length} |
| 步骤通过率 | ${passCount}/${p.steps.length}（${passRate}%）|
| 断言数 | ${p.assertions.length} |
| 警告数 | ${p.warnings.length} |
| 错误数 | ${p.errors.length} |
| **结论** | ${resultIcon} **${resultText}** |

${
  p.warnings.length
    ? `\n**⚠️ 警告：**\n${p.warnings.map((w) => `- ${w}`).join('\n')}\n`
    : ''
}${
      p.errors.length
        ? `\n**❌ 错误：**\n${p.errors.map((e) => `- ${e}`).join('\n')}\n`
        : ''
    }

---

## 📋 步骤详情

| Step | 动作 | 选择器 / 参数 | 预期 | 实际 | 耗时 | 截图 |
| --- | --- | --- | --- | --- | --- | --- |
${stepRows || '_（本用例未记录步骤）_'}

---

## ⏱️ 执行时间轴

${timelineBlock}

---

## 🗺️ 用例思维导图（本次执行）

${mindmapBlock}

---

## ✅ 断言摘要

${
  p.assertions.length
    ? `| 断言 | 期望 | 实际 |\n| --- | --- | --- |\n${assertionRows}`
    : '_（本用例未记录显式断言）_'
}

---

## 💾 持久化快照

${persistenceBlock}

---

## 📸 视觉证据

${visualEvidenceBlock}

---

## 📚 失败诊断手册

${failureManualBlock}

---

## 🩺 运行期健康信号

### Console 错误 / 警告（${p.consoleEvents.length}）

${
  p.consoleEvents.length
    ? `| # | type | text | location |\n| --- | --- | --- | --- |\n${p.consoleEvents
        .map((c, i) => `| ${i + 1} | ${c.type} | ${escapeMd(c.text)} | ${escapeMd(c.location)} |`)
        .join('\n')}`
    : '_（本轮运行未捕获到 console error/warning）_'
}

### 页面 JS 异常 pageerror（${p.pageErrors.length}）

${
  p.pageErrors.length
    ? p.pageErrors
        .map(
          (e, i) =>
            `**#${i + 1}** ${escapeMd(e.message)}\n\n\`\`\`\n${(e.stack || '').slice(0, 800)}\n\`\`\``,
        )
        .join('\n\n')
    : '_（本轮运行未捕获到未捕获的 JS 异常）_'
}

### 网络请求失败 requestfailed（${p.networkFailures.length}）

${
  p.networkFailures.length
    ? `| # | method | url | failure |\n| --- | --- | --- | --- |\n${p.networkFailures
        .map(
          (n, i) =>
            `| ${i + 1} | ${n.method} | ${escapeMd(n.url)} | ${escapeMd(n.failure)} |`,
        )
        .join('\n')}`
    : '_（本轮运行未捕获到请求失败）_'
}

---

## 📎 附录

- 用例 ID：\`${p.caseId}\`
- 原始 JSON：\`test-results/${p.runStamp}/${p.sceneName}/${p.caseId}.json\`
- 截图目录：
  - ✅ 关键路径：\`test-results/${p.runStamp}/${p.sceneName}/${p.caseId}/success/\`
  - ❌ 失败现场：\`test-results/${p.runStamp}/${p.sceneName}/${p.caseId}/error/\`
- Playwright HTML 报告：\`npx playwright show-report\`
`;
  }
}

function escapeMd(s) {
  return String(s ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
}

/**
 * 将任意中文/特殊字符化为文件名友好的 slug。
 * 保留中文、字母、数字；空格 -> 连词符；特殊字符 -> 下划线。
 */
function slugifyForFs(s) {
  return String(s || 'unknown')
    .trim()
    .replace(/[\\\/:*?"<>|\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/**
 * Gantt 任务文本不能包含 `:` `,` 否则会被语法解析器吃掉。
 */
function escapeGanttText(s) {
  return String(s || '')
    .replace(/[:：]/g, '·')
    .replace(/[,，]/g, '、')
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Mindmap 节点文本：括号会被识别为节点形状（圆形/方形），需要转义。
 * 我们用 <br/> 做软换行，其他符号尽量保留，避免破坏可读性。
 */
function escapeMindmap(s) {
  return String(s || '')
    .replace(/[(（]/g, '〔')
    .replace(/[)）]/g, '〕')
    .replace(/[[\]]/g, '')
    .replace(/[`"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 枚举某个桶目录下的 png 文件（递归），返回绝对路径数组。
 * 文件不存在/为空都返回 []。
 */
function listShotsRecursive(dir) {
  const out = [];
  try {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        out.push(...listShotsRecursive(p));
      } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.png')) {
        out.push(p);
      }
    }
  } catch (_e) {
    /* noop */
  }
  return out.sort();
}

QuantifiedReporter.prototype._writeShotIndex = function (kind /* 'success' | 'error' */) {
  const items = this.shotIndex[kind] || [];
  const dir = kind === 'error' ? this.errorShotsDir : this.successShotsDir;
  const indexPath = path.join(dir, 'INDEX.md');

  const headTitle = kind === 'error' ? '❌ 失败现场索引' : '✅ 关键路径索引';
  const headDesc =
    kind === 'error'
      ? '该目录下的每一张图都是"失败发生时"的页面现场照。按业务阶段分子目录。'
      : '该目录下的每一张图都是"关键路径节点"的验证照。按业务阶段分子目录。';

  if (!items.length) {
    fs.writeFileSync(
      indexPath,
      `# ${headTitle}\n\n${headDesc}\n\n_（本轮运行未产生该类别截图）_\n`,
      'utf-8',
    );
    return;
  }

  // 按 phase 分组
  const grouped = {};
  for (const it of items) {
    const key = `${it.phaseCode}-${it.phaseName}`;
    (grouped[key] = grouped[key] || []).push(it);
  }

  const lines = [`# ${headTitle}`, '', headDesc, ''];
  for (const [phaseKey, list] of Object.entries(grouped)) {
    lines.push(`## ${phaseKey}（${list.length} 张）`);
    lines.push('');
    for (const it of list) {
      const captionParts = [
        `**${it.stepId}** · ${it.intent}`,
        it.captionExtra ? `_${it.captionExtra}_` : '',
      ].filter(Boolean);
      lines.push(`### ${captionParts.join(' — ')}`);
      lines.push('');
      lines.push(`![${it.stepId}](${it.relFromBucket.replace(/\\/g, '/')})`);
      lines.push('');
    }
  }
  fs.writeFileSync(indexPath, lines.join('\n'), 'utf-8');
};

QuantifiedReporter.prototype._renderVisualEvidence = function () {
  const toRelFromReport = (abs) =>
    path.relative(this.qaReportsDir, abs).replace(/\\/g, '/');

  const renderGroup = (kind /* 'success' | 'error' */) => {
    const items = this.shotIndex[kind] || [];
    if (!items.length) return null;
    const grouped = {};
    for (const it of items) {
      const key = `${it.phaseCode}-${it.phaseName}`;
      (grouped[key] = grouped[key] || []).push(it);
    }
    const blocks = [];
    for (const [phaseKey, list] of Object.entries(grouped)) {
      blocks.push(`#### ${phaseKey}（${list.length} 张）`);
      blocks.push('');
      for (const it of list) {
        const rel = toRelFromReport(it.file);
        const head = it.captionExtra
          ? `**${it.stepId}** · ${it.intent} — _${it.captionExtra}_`
          : `**${it.stepId}** · ${it.intent}`;
        blocks.push(head);
        blocks.push('');
        blocks.push(`![${it.stepId}](${rel})`);
        blocks.push('');
      }
    }
    return blocks.join('\n');
  };

  const successBlock = renderGroup('success');
  const errorBlock = renderGroup('error');

  return [
    `### ✅ 关键路径（${(this.shotIndex.success || []).length} 张，按业务阶段分组）`,
    '',
    '主流程关键节点的"状态验证照"。可快速检查反略有无错讹。',
    '',
    successBlock || '_（本轮未采集到关键路径截图）_',
    '',
    `### ❌ 失败现场（${(this.shotIndex.error || []).length} 张，按业务阶段分组）`,
    '',
    '问题发生时的页面现场。需要逐张查看并对照「失败诊断手册」。',
    '',
    errorBlock || '✅ 本轮运行未产生失败现场。',
  ].join('\n');
};

QuantifiedReporter.prototype._renderTimeline = function (p) {
  if (!p.steps.length) {
    return '_（本用例未记录步骤，无时间轴可绘制）_';
  }

  // 起点对齐：以第一个 step 的 startTs 为 0，所有时间转换为相对毫秒
  const baseTs = p.steps.reduce(
    (min, s) => (s.startTs && s.startTs < min ? s.startTs : min),
    p.steps[0].startTs || Date.now(),
  );

  // 按 phase 分组（蓝图无登记则归到 P? 未分类）
  const groups = {};
  for (const s of p.steps) {
    const bp =
      this.blueprintLookup && this.blueprintLookup.getBlueprint
        ? this.blueprintLookup.getBlueprint(s.id)
        : null;
    const phaseKey = bp ? `${bp.phase.code}-${bp.phase.name}` : 'P?-未分类';
    (groups[phaseKey] = groups[phaseKey] || []).push(s);
  }

  // mermaid gantt 语法
  // 注意：dateFormat x = 毫秒时间戳；axisFormat 用 %S.%L 显示秒.毫秒
  const lines = [
    '```mermaid',
    'gantt',
    `    title ${p.caseId} 执行时间轴（相对耗时，单位 ms）`,
    '    dateFormat x',
    '    axisFormat %S.%Ls',
    '    todayMarker off',
  ];

  for (const [phaseKey, list] of Object.entries(groups)) {
    lines.push(`    section ${escapeGanttText(phaseKey)}`);
    for (const s of list) {
      // mermaid gantt task 格式：<text> :<status>, <id>, <start ms>, <duration ms>
      const startRel = (s.startTs || baseTs) - baseTs;
      const dur = Math.max(s.durationMs || 0, 1); // 至少 1ms 才能渲染出条
      const status =
        s.status === 'fail' ? 'crit' : s.status === 'skip' ? 'active' : 'done';
      // task text：用 stepId + intent 简写（去掉冒号、引号等会破坏 gantt 语法的字符）
      const bp =
        this.blueprintLookup && this.blueprintLookup.getBlueprint
          ? this.blueprintLookup.getBlueprint(s.id)
          : null;
      const text = `${s.id} ${escapeGanttText(bp ? bp.intent : s.action || '')}`.slice(0, 60);
      lines.push(`    ${text} :${status}, ${s.id.replace(/\./g, '_')}, ${startRel}, ${dur}ms`);
    }
  }

  lines.push('```');
  lines.push('');
  lines.push(
    '> 颜色说明：✅ done(蓝色) = 通过；❌ crit(红色) = 失败；⏭️ active(绿色) = 跳过。条的长度即耗时，可以一眼识别"哪一步在拖后腿"。',
  );

  return lines.join('\n');
};

QuantifiedReporter.prototype._renderMindmap = function (p) {
  if (!p.steps.length) {
    return '_（本用例未记录步骤，无导图可绘制）_';
  }

  // 按 phase 分组
  const groups = {};
  for (const s of p.steps) {
    const bp =
      this.blueprintLookup && this.blueprintLookup.getBlueprint
        ? this.blueprintLookup.getBlueprint(s.id)
        : null;
    const phaseKey = bp ? `${bp.phase.code}·${bp.phase.name}` : 'P?·未分类';
    (groups[phaseKey] = groups[phaseKey] || []).push({ s, bp });
  }

  const resultIcon =
    p.result === 'pass' ? '✅' : p.result === 'warn' ? '⚠️' : '❌';

  const lines = [
    '```mermaid',
    'mindmap',
    `  root((${escapeMindmap(p.caseId)}<br/>${resultIcon} ${p.result.toUpperCase()}))`,
  ];

  for (const [phaseKey, items] of Object.entries(groups)) {
    const passCount = items.filter((it) => it.s.status === 'pass').length;
    const failCount = items.filter((it) => it.s.status === 'fail').length;
    const skipCount = items.filter((it) => it.s.status === 'skip').length;
    const phaseLabel = `${escapeMindmap(phaseKey)}<br/>✅${passCount} ❌${failCount} ⏭️${skipCount}`;
    lines.push(`    ${phaseLabel}`);
    for (const { s, bp } of items) {
      const icon =
        s.status === 'pass' ? '✅' : s.status === 'fail' ? '❌' : '⏭️';
      const intent = bp ? bp.intent : s.action || '';
      lines.push(`      ${icon} ${escapeMindmap(s.id)} ${escapeMindmap(intent.slice(0, 28))}`);
    }
  }

  lines.push('```');
  lines.push('');
  lines.push(
    '> 这张图是"本次执行结果"的鸟瞰图：根节点为用例，第一层为业务阶段（含本阶段 pass/fail/skip 计数），第二层为具体 step。',
  );

  return lines.join('\n');
};

QuantifiedReporter.prototype._renderFailureManual = function (failedSteps) {
  if (!failedSteps.length) {
    return '✅ 本轮运行未产生失败 step，无需诊断。';
  }
  if (
    !this.blueprintLookup ||
    typeof this.blueprintLookup.renderFailureMarkdown !== 'function'
  ) {
    return failedSteps
      .map(
        (s) =>
          `### ❌ ${s.id} · ${s.action}\n\n- selector: \`${s.selector || '-'}\`\n- expected: ${s.expected || '-'}\n- actual: ${s.actual || '-'}`,
      )
      .join('\n\n---\n\n');
  }
  return failedSteps
    .map((s) =>
      this.blueprintLookup.renderFailureMarkdown(s.id, s.action, s.actual),
    )
    .join('\n\n---\n\n');
};

QuantifiedReporter.prototype._renderSelfReviewPending = function (p) {
  const failedSteps = p.steps.filter((s) => s.status === 'fail');
  const skippedSteps = p.steps.filter((s) => s.status === 'skip');
  return `# ${p.caseId} · self-review pending

> 这份文档是运行后交给 CodeBuddy 以助手身份作“自审”的资料包。
>
> 使用方式：跳回对话，跳这份 md 设为另一轮问题的详细背景，说“帮我对这份运行结果出一份自审报告”。

## 1. 元信息

- 用例 ID：\`${p.caseId}\`
- 场景：\`${p.sceneName}\`
- 优先级：${p.priority}
- 起止：${p.startedAt} → ${p.finishedAt}（${p.totalMs}ms）
- 结论：**${p.result.toUpperCase()}**

## 2. 三类归因指南（请 CodeBuddy 逐一鉴定）

请从以下三维判断每个失败/警告/异常属于哪一类：

| 归因类 | 含义 | 处置 |
|---|---|---|
| **A. 业务真 bug** | 业务代码 (src/) 表现与预期不一致 | 提出代码修复建议（外部代码同步修）|
| **B. spec / reporter 错** | 测试代码本身选择器/断言/时序错 | 提出 spec 修复建议 |
| **C. 文档脱节** | docs/e2e/* 中的描述与代码真相不一致 | 提出文档修订建议 |

## 3. 犯罪现场

### 3.1 失败 step（${failedSteps.length}）

${
  failedSteps.length
    ? failedSteps
        .map((s) => {
          const bp =
            this.blueprintLookup && this.blueprintLookup.getBlueprint
              ? this.blueprintLookup.getBlueprint(s.id)
              : null;
          const phase = bp ? `[${bp.phase.code}·${bp.phase.name}]` : '';
          const intent = bp ? bp.intent : s.action;
          const hints = bp ? bp.hints.map((h, i) => `    ${i + 1}. ${h}`).join('\n') : '';
          const debug = bp ? bp.debug.map((d, i) => `    ${i + 1}. ${d}`).join('\n') : '';
          return `- **${s.id} · ${phase} ${intent}**\n  - selector: \`${s.selector || '—'}\`\n  - expected: ${s.expected || '—'}\n  - actual: ${s.actual || '—'}${
            hints ? `\n  - 可能原因:\n${hints}` : ''
          }${debug ? `\n  - 排查方向:\n${debug}` : ''}`;
        })
        .join('\n')
    : '_（无）_'
}

### 3.2 被 skip 的 step（${skippedSteps.length}）

${
  skippedSteps.length
    ? skippedSteps
        .map((s) => `- **${s.id} · ${s.action}**：${s.actual || '—'}`)
        .join('\n')
    : '_（无）_'
}

### 3.3 console 错误/警告（${p.consoleEvents.length}）

${
  p.consoleEvents.length
    ? p.consoleEvents.slice(0, 20).map((c, i) => `${i + 1}. [${c.type}] ${c.text}`).join('\n')
    : '_（无）_'
}

### 3.4 页面 JS 异常（${p.pageErrors.length}）

${
  p.pageErrors.length
    ? p.pageErrors.slice(0, 5).map((e, i) => `${i + 1}. ${e.message}`).join('\n')
    : '_（无）_'
}

### 3.5 请求失败（${p.networkFailures.length}）

${
  p.networkFailures.length
    ? p.networkFailures.slice(0, 20).map((n, i) => `${i + 1}. [${n.method}] ${n.url} — ${n.failure}`).join('\n')
    : '_（无）_'
}

## 4. 期望输出

请 CodeBuddy 输出如下结构的 markdown 处方签：

1. 总结 1 句话结论（什么造成 ${p.result.toUpperCase()}）
2. 问题表：| 现象 | 归因 A/B/C | 位置 | 修复动作 | 优先级 |
3. 推荐修复顺序（先修什么后修什么）
4. spec 质量评分（0~100 分）+ 评分理由
5. 下轮继续跑前需要人工拍板的点（如果有）
`;
};

module.exports = { QuantifiedReporter };
