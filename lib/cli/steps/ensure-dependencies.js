/**
 * lib/cli/steps/ensure-dependencies.js · 安装依赖
 *
 * 职责：
 *   - 装 @playwright/test 和 s-auto-e2e-kit 到目标项目的 devDependencies
 *   - 自动选择 npm / pnpm / yarn 的对应命令
 *   - 已装则跳过（idempotent）
 *
 * 设计：
 *   - 不接触 lockfile 之外的事，让用户的 npm/pnpm 自己处理
 *   - dryRun=true 时只打印命令
 *   - 在 monorepo 里默认装到 ctx.projectRoot（最近的 package.json 所在）
 *     用户如果要装到 root 可以加 --pkg-manager + 在 root 跑命令
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { run } = require('../utils/exec');
const logger = require('../utils/logger');

const REQUIRED = ['@playwright/test', 's-auto-e2e-kit'];

function isInstalled(projectRoot, name) {
  return fs.existsSync(path.join(projectRoot, 'node_modules', name, 'package.json'));
}

function buildInstallArgs(pm, packages) {
  // 统一加 -D（dev dep）
  switch (pm) {
    case 'pnpm':
      return ['add', '-D', ...packages];
    case 'yarn':
      return ['add', '-D', ...packages];
    case 'npm':
    default:
      return ['install', '--save-dev', ...packages];
  }
}

/**
 * @param {object} ctx
 * @param {string} ctx.projectRoot
 * @param {object} ctx.env  detect-env 返回值
 * @param {object} ctx.opts CLI opts（force / dryRun）
 */
async function ensureDependencies(ctx) {
  const { projectRoot, env, opts = {} } = ctx;
  const pm = (env && env.pkgManager) || 'npm';

  // 找出真正缺失的包；force=true 时强制重装全部
  const missing = opts.force
    ? REQUIRED.slice()
    : REQUIRED.filter((p) => !isInstalled(projectRoot, p));

  if (missing.length === 0) {
    logger.success('依赖已就绪：' + REQUIRED.join(', '));
    return { installed: [], skipped: REQUIRED.slice() };
  }

  logger.step(`安装依赖（${pm}）：${missing.join(', ')}`);
  await run(pm, buildInstallArgs(pm, missing), {
    cwd: projectRoot,
    dryRun: !!opts.dryRun,
  });

  if (!opts.dryRun) {
    // 校验
    const stillMissing = missing.filter((p) => !isInstalled(projectRoot, p));
    if (stillMissing.length > 0) {
      throw new Error(
        `依赖装完后仍未生效：${stillMissing.join(', ')}（请检查 ${pm} 的输出）`
      );
    }
    logger.success(`依赖安装完成：${missing.join(', ')}`);
  }

  return {
    installed: missing,
    skipped: REQUIRED.filter((p) => !missing.includes(p)),
  };
}

module.exports = ensureDependencies;
