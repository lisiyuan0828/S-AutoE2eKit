/**
 * @tencent/e2e-kit/reporters/html-reporter-bridge
 *
 * 这是真正的 Playwright reporter 模块（v2 协议）。
 * 它由 Playwright reporter 进程在 runtime require，必须 module.exports
 * 一个 class（或 default class），供 Playwright `new ReporterClass(opts)`。
 *
 * 桥接职责（只做这一件事）：
 *   1. 在 reporter 进程里实时调用 tryLoadPlaywrightHtml() 取得 BaseHtmlReporter
 *   2. 用 createEnhancedHtmlReporter(BaseHtmlReporter) 生成增强版 class
 *   3. module.exports 该 class
 *
 * 失败降级：
 *   如果 BaseHtmlReporter 取不到（运行环境只装了 @playwright/test、没装 playwright
 *   顶级包；或者 Playwright 版本太旧没有 ./lib/runner exports 白名单），
 *   导出一个"只打 warning 不做任何事"的占位 reporter，让测试整体继续跑完
 *   而不是直接 crash。
 */

'use strict';

const {
  createEnhancedHtmlReporter,
  tryLoadPlaywrightHtml,
} = require('./html-reporter');

const loaded = tryLoadPlaywrightHtml();

if (loaded && loaded.HtmlReporter) {
  module.exports = createEnhancedHtmlReporter(loaded.HtmlReporter);
} else {
  // 优雅降级：只警告一次，不报错
  let warned = false;
  class FallbackHtmlReporter {
    constructor(_options) {
      if (!warned) {
        warned = true;
        // eslint-disable-next-line no-console
        console.warn(
          '[@tencent/e2e-kit/html] 未能加载 Playwright 内置 HtmlReporter。\n' +
            '  - 请确认已安装 `playwright` 顶级包（@playwright/test 通常会传递安装它）\n' +
            '  - 或 Playwright 版本 >= 1.60（要求 package.json exports 白名单包含 ./lib/runner）\n' +
            '  本次运行将不产 HTML 报告，但 markdown / JSON 不受影响。',
        );
      }
    }
    version() {
      return 'v2';
    }
    printsToStdio() {
      return false;
    }
    onConfigure() {}
    onBegin() {}
    onTestBegin() {}
    onTestEnd() {}
    onError() {}
    onEnd() {}
    onExit() {}
    onReportConfigure() {}
    onReportEnd() {}
  }
  module.exports = FallbackHtmlReporter;
}
