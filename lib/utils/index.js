/**
 * @tencent/e2e-kit/utils · Utils 子入口
 *
 * Phase 2 已完成：6 个 util 全部迁入包内，业务无关版（企点专属命名/域名/key
 * 全部移除，由主仓库适配层组装）。
 *
 * 命名空间访问（推荐）：
 *   const { utils } = require('@tencent/e2e-kit');
 *   utils.wait.waitVisible(page, '#x');
 *
 * 子路径直接访问（性能更好，按需加载）：
 *   const { waitVisible } = require('@tencent/e2e-kit/utils/wait-strategies');
 */

'use strict';

module.exports = {
  /** 6 种等待策略：VIS / TXT / CNT / RES / NAV / EVT */
  wait: require('./wait-strategies'),

  /** 通用持久化读写：localStorage / sessionStorage / cookie / window / event buffer */
  persistence: require('./persistence-helpers'),

  /** 通用网络 mock 三原语：mockJson / applyMockRules / silenceStaticResources */
  mocks: require('./network-mocks'),

  /** 通用业务事件捕获器（reload-safe，基于 localStorage） */
  eventCapture: require('./event-capture'),

  /** 提取页面可见文本 + 翻译完整度判断 */
  visibleText: require('./visible-text'),

  /** 运行上下文：YYYYMMDD_branch 戳 + 项目根（process.cwd 兜底） */
  runContext: require('./run-context'),
};
