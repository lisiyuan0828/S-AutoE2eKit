/**
 * lib/cli/steps/ensure-scripts.js · 注入 npm scripts
 *
 * 职责：
 *   - 给 projectRoot/package.json 的 scripts 里加 2 条：
 *       "e2e":          "playwright test"
 *       "e2e:ui":       "playwright test --ui"
 *   - 已有同名 script 默认**不覆盖**（保护用户）；--force 才覆盖
 *
 * 设计：
 *   - 用 JSON.parse + JSON.stringify(2) 写回，不引第三方 json-format
 *   - 保留原文件末尾换行（Node 默认 stringify 不带）
 *   - **只装核心两条**：`e2e`（CI 必用）+ `e2e:ui`（开发时极好用）
 *     - 不再装 `e2e:headed` / `e2e:report`：playwright 原生 CLI 一行参数即可
 *       (`npx playwright test --headed` / `npx playwright show-report`)，
 *       多写 alias 是 package.json 噪声而非便利。教学写在 docs/e2e/README.md。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const SCRIPTS_TO_ADD = {
  e2e: 'playwright test',
  'e2e:ui': 'playwright test --ui',
};

/**
 * @param {object} ctx
 * @param {string} ctx.projectRoot
 * @param {object} ctx.opts
 */
async function ensureScripts(ctx) {
  const { projectRoot, opts = {} } = ctx;
  const pkgPath = path.join(projectRoot, 'package.json');

  if (!fs.existsSync(pkgPath)) {
    throw new Error(`package.json 不存在：${pkgPath}`);
  }

  const raw = fs.readFileSync(pkgPath, 'utf8');
  let pkg;
  try {
    pkg = JSON.parse(raw);
  } catch (e) {
    throw new Error(`package.json 解析失败：${e.message}`);
  }

  pkg.scripts = pkg.scripts || {};

  const added = [];
  const skipped = [];
  for (const [k, v] of Object.entries(SCRIPTS_TO_ADD)) {
    if (pkg.scripts[k] != null && !opts.force) {
      skipped.push(k);
      continue;
    }
    pkg.scripts[k] = v;
    added.push(k);
  }

  if (added.length === 0) {
    logger.success('scripts 全部已存在，无需修改');
    return { added: [], skipped };
  }

  if (opts.dryRun) {
    logger.hint(`(dry-run) 将注入 scripts：${added.join(', ')}`);
    return { added, skipped, dryRun: true };
  }

  // 保留末尾换行（与原文件一致）
  const trailingNL = raw.endsWith('\n') ? '\n' : '';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + trailingNL, 'utf8');
  logger.success(`已注入 scripts：${added.join(', ')}`);
  if (skipped.length > 0) {
    logger.hint(`跳过已存在：${skipped.join(', ')}（用 --force 覆盖）`);
  }
  return { added, skipped };
}

module.exports = ensureScripts;
