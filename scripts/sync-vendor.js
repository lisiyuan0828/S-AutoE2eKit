/**
 * sync-vendor.js · 从消费方 node_modules 同步 Playwright HTML reporter 产物
 *
 * Phase 1 状态：占位（仅打印计划信息，不做实际拷贝）。
 * Phase 4 状态：实现真实拷贝 + 版本兼容性校验。
 *
 * 设计目标（Phase 4 实现）：
 *   1. 从消费方根目录的 node_modules/playwright-core/lib/vite/htmlReport/ 读取 3 个产物：
 *        - index.html
 *        - report.css
 *        - report.js
 *   2. 拷贝到本包 packages/e2e-kit/vendor/ 目录（不入库，由 .gitignore 排除）。
 *   3. 校验消费方 @playwright/test 版本是否在 peerDependencies 范围内。
 *   4. 输出 vendor 来源版本号，便于排错。
 *
 * 触发方式（Phase 4 实现）：
 *   - 主动：node packages/e2e-kit/scripts/sync-vendor.js
 *   - 自动：消费方 npm install 时通过 package.json scripts.postinstall 触发
 *           （注意：file: 协议下 npm 不会运行 postinstall，需消费方主动 npm run sync-vendor）
 *
 * 关键决策：
 *   - 路径解析以"消费方 process.cwd()"为锚，不使用 __dirname（避免 monorepo 嵌套场景失效）
 *   - 不依赖任何 npm 包，仅用 Node.js 内置 fs / path（保持脚本零依赖、健壮）
 *   - 失败时抛出明确错误信息（缺文件 / 版本不兼容 / 权限不足）
 */

'use strict';

const path = require('path');

function main() {
  // eslint-disable-next-line no-console
  console.log('[@tencent/e2e-kit] sync-vendor 占位脚本（Phase 1）');
  // eslint-disable-next-line no-console
  console.log('  当前 cwd:', process.cwd());
  // eslint-disable-next-line no-console
  console.log('  本包路径:', path.resolve(__dirname, '..'));
  // eslint-disable-next-line no-console
  console.log('  Phase 4 将实现真实的 vendor 同步逻辑。');
  // eslint-disable-next-line no-console
  console.log('  目标源文件: <consumer>/node_modules/playwright-core/lib/vite/htmlReport/{index.html,report.css,report.js}');
}

if (require.main === module) {
  main();
}

module.exports = { main };
