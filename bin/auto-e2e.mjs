#!/usr/bin/env node
/**
 * bin/auto-e2e.mjs · CLI 薄壳入口
 *
 * 设计原则：
 *   - 这里**只做转发**，不写业务逻辑
 *   - 用 .mjs 是为了确保 node 不把它当作 cjs 解析（避免某些 node 版本的歧义）
 *   - 真正实现在 lib/cli/index.js（CommonJS，与现有 lib/* 风格一致）
 *
 * 兼容性：
 *   - 通过 npm 安装时，npm 会自动在 .bin/ 下生成跨平台包装（含 Windows .cmd）
 *   - 直接 `node bin/auto-e2e.mjs ...` 也能跑
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 解析到 lib/cli/index.js（绝对路径，避免不同启动目录解析失败）
const cliPath = resolve(__dirname, '..', 'lib', 'cli', 'index.js');
const { run } = require(cliPath);

// 剔除 node 可执行文件路径和脚本路径，只留 user argv
const userArgv = process.argv.slice(2);

run(userArgv).then(
  (code) => {
    process.exit(typeof code === 'number' ? code : 0);
  },
  (err) => {
    // run 内部已经 logger.error 过；这里只兜底未捕获错误
    // eslint-disable-next-line no-console
    console.error('[s-auto-e2e-kit] uncaught:', err && err.stack ? err.stack : err);
    process.exit(1);
  },
);
