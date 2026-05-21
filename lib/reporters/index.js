/**
 * @tencent/e2e-kit/reporters · Reporter 子入口
 *
 * Phase 3 已完成：
 *   - quantified  ← 通用版量化报告（业务无关，blueprintLookup 由调用方注入）
 *   - sceneIndex  ← 通用版多场景汇总入口
 *   - html        ← 占位，待 Phase 4 实现（自建 HTML Reporter，方案 F）
 *
 * 设计纪律：
 *   本子入口**只导出业务无关的通用 reporter**。任何与具体业务（如 i18n / Header /
 *   特定 API 协议）强绑定的 reporter，均不应进入本包，应留在消费方仓库的
 *   `tests/e2e/_reporters/` 目录作为业务测试代码。
 *
 * 命名空间访问（推荐）：
 *   const { reporters } = require('@tencent/e2e-kit');
 *   const reporter = new reporters.quantified.QuantifiedReporter(opts);
 *
 * 子路径直接访问（性能更好，按需加载）：
 *   const { QuantifiedReporter } = require('@tencent/e2e-kit/reporters/quantified-reporter');
 *   const { buildSceneIndex } = require('@tencent/e2e-kit/reporters/scene-index-reporter');
 */

'use strict';

/**
 * 创建一个"未实现"占位 reporter，调用 onBegin 时抛出明确错误。
 *
 * @param {string} reporterName
 * @returns {object}
 */
function createPlaceholder(reporterName) {
  return {
    onBegin() {
      throw new Error(
        `[@tencent/e2e-kit] reporter "${reporterName}" 尚未实现（请关注 CHANGELOG.md 的 Phase 进度）。`,
      );
    },
  };
}

module.exports = {
  /**
   * 量化报告 reporter（Phase 3 实装）
   * 通用版本，业务专属的 step-blueprints 由调用方通过 opts.blueprintLookup 注入。
   */
  quantified: require('./quantified-reporter'),

  /**
   * 多场景汇总入口（Phase 3 实装）
   */
  sceneIndex: require('./scene-index-reporter'),

  /**
   * 自建 HTML Reporter（Phase 4 实装，方案 F）
   *
   * 命名空间字段：
   *   - resolveHtmlReporter(opts):  返回 Playwright reporter 数组项 [bridgePath, opts]
   *   - bridgePath:                  桥接文件绝对路径，便于消费方手工拼装
   *   - createEnhancedHtmlReporter:  内部工厂（高级用法 / 单测）
   *   - tryLoadPlaywrightHtml:       探测 Playwright 是否可用（高级用法 / 单测）
   *
   * 典型用法（playwright.config.js）：
   *   const { reporters } = require('@tencent/e2e-kit');
   *   reporter: [
   *     ['list'],
   *     reporters.html.resolveHtmlReporter({
   *       outputFolder: 'playwright-report',
   *       open: 'never',
   *       title: '我的项目 E2E',
   *       attachQuantifiedJson: true,
   *     }),
   *   ]
   */
  html: require('./html-reporter'),

  /**
   * Quantified Summary Reporter（Phase 7 · D3 方案）
   *
   * 独立的量化总览 HTML reporter：跳出 Playwright 内置 HTML reporter
   * 的 step 节点限制，基于 quantified-reporter 写盘的 JSON（含 step.detail
   * markdown 字段）渲染一份**自完备**的 HTML — 左侧用例/步骤树 + 右侧
   * markdown 详情。
   *
   * 命名空间字段：
   *   - resolve(opts):                返回 Playwright reporter 数组项
   *   - QuantifiedSummaryReporter:    Reporter class（高级用法 / 单测）
   *   - scanQuantifiedJsons:          扫盘工具（高级用法 / 单测）
   *   - renderSummaryHtml:            纯函数渲染（高级用法 / 单测）
   *
   * 典型用法（playwright.config.js）：
   *   reporter: [
   *     ['list'],
   *     reporters.html.resolveHtmlReporter({ ... }),
   *     reporters.quantifiedSummary.resolve({
   *       outputFile: 'playwright-report-enhanced/<runStamp>/quantified-summary.html',
   *       testResultsDir: 'test-results/<runStamp>',
   *       title: '我的项目 E2E 量化报告',
   *     }),
   *   ]
   */
  quantifiedSummary: require('./quantified-summary-reporter'),
};
