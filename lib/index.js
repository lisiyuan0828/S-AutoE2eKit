/**
 * @tencent/e2e-kit · 主入口
 *
 * 设计原则：
 *   - 本入口只做"二级聚合"，不实现具体逻辑，所有能力延迟到子模块按需加载。
 *   - 消费方推荐使用子路径导入以减小加载体积：
 *       require('@tencent/e2e-kit/reporters')
 *       require('@tencent/e2e-kit/utils')
 *   - 也支持顶层一次取齐：
 *       const { reporters, utils } = require('@tencent/e2e-kit');
 *
 * 当前阶段（Phase 1）：reporters / utils 子模块均为空壳骨架，待 Phase 2/3/4 填充。
 */

'use strict';

module.exports = {
  /**
   * Reporter 集合（Phase 3/4 填充）
   * @see ./reporters/index.js
   */
  get reporters() {
    return require('./reporters');
  },

  /**
   * Utils 集合（Phase 2 填充）
   * @see ./utils/index.js
   */
  get utils() {
    return require('./utils');
  },

  /**
   * 当前包版本（运行时读取，便于排错）
   */
  get version() {
    return require('../package.json').version;
  },
};
