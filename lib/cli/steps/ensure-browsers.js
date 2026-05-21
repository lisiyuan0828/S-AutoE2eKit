/**
 * lib/cli/steps/ensure-browsers.js · 安装 Playwright 浏览器
 *
 * 职责：
 *   - 跑 `npx playwright install chromium`（默认只装 chromium，~130MB）
 *   - 若已装则可由 playwright 自身识别并 no-op，不需要我们额外探测
 *
 * 设计：
 *   - opts.skipBrowsers 由上层 init 已经过滤；这里假定调用就一定要装
 *   - opts.allBrowsers=true 时装全套（chromium + firefox + webkit），保留扩展点
 *   - dryRun 透传
 */

'use strict';

const { run } = require('../utils/exec');
const logger = require('../utils/logger');

/**
 * @param {object} ctx
 * @param {string} ctx.projectRoot
 * @param {object} ctx.opts CLI opts
 */
async function ensureBrowsers(ctx) {
  const { projectRoot, opts = {} } = ctx;

  const args = ['playwright', 'install'];
  if (!opts.allBrowsers) args.push('chromium');

  logger.step(`下载浏览器：${opts.allBrowsers ? 'all' : 'chromium'}（首次较慢）`);
  await run('npx', args, {
    cwd: projectRoot,
    dryRun: !!opts.dryRun,
  });

  if (!opts.dryRun) logger.success('浏览器准备就绪');
  return { browsers: opts.allBrowsers ? ['chromium', 'firefox', 'webkit'] : ['chromium'] };
}

module.exports = ensureBrowsers;
