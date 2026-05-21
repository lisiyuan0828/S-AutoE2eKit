/**
 * lib/cli/steps/detect-env.js · 探测运行环境
 *
 * 职责：
 *   - Node 版本是否 >= 14
 *   - 包管理器（pnpm / yarn / npm，按 lockfile + userAgent 双信号判断）
 *   - 是否在 monorepo 里（pnpm-workspace.yaml / lerna.json / package.json#workspaces）
 *
 * 不做：
 *   - 不修改任何文件、不装任何包。纯只读探测。
 *
 * 返回：
 *   {
 *     nodeMajor:    number,
 *     pkgManager:   'pnpm' | 'yarn' | 'npm',
 *     pkgManagerSource: 'lockfile' | 'userAgent' | 'default',
 *     isMonorepo:   boolean,
 *     monorepoKind: 'pnpm' | 'lerna' | 'workspaces' | null,
 *   }
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * @param {object} ctx
 * @param {string} ctx.projectRoot 项目根
 * @param {object} [ctx.opts]      CLI opts（用于 --pkg-manager 强制指定）
 */
function detectEnv(ctx) {
  const { projectRoot, opts = {} } = ctx;

  // 1. node 版本
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);

  // 2. 包管理器：优先 CLI flag，其次 lockfile，再次 npm_config_user_agent，最后 npm
  let pkgManager = 'npm';
  let pkgManagerSource = 'default';

  if (opts.pkgManager && ['npm', 'pnpm', 'yarn'].includes(opts.pkgManager)) {
    pkgManager = opts.pkgManager;
    pkgManagerSource = 'lockfile'; // 视为外部强指定，等同 lockfile 优先级
  } else {
    const lockMap = [
      ['pnpm-lock.yaml', 'pnpm'],
      ['yarn.lock', 'yarn'],
      ['package-lock.json', 'npm'],
    ];
    const hit = lockMap.find(([f]) => fs.existsSync(path.join(projectRoot, f)));
    if (hit) {
      pkgManager = hit[1];
      pkgManagerSource = 'lockfile';
    } else {
      // npm_config_user_agent 形如 "pnpm/8.6.0 npm/? node/v20.18.0 darwin arm64"
      const ua = process.env.npm_config_user_agent || '';
      if (ua.startsWith('pnpm/')) {
        pkgManager = 'pnpm';
        pkgManagerSource = 'userAgent';
      } else if (ua.startsWith('yarn/')) {
        pkgManager = 'yarn';
        pkgManagerSource = 'userAgent';
      } else if (ua.startsWith('npm/')) {
        pkgManager = 'npm';
        pkgManagerSource = 'userAgent';
      }
    }
  }

  // 3. monorepo 判断
  let isMonorepo = false;
  let monorepoKind = null;
  if (fs.existsSync(path.join(projectRoot, 'pnpm-workspace.yaml'))) {
    isMonorepo = true;
    monorepoKind = 'pnpm';
  } else if (fs.existsSync(path.join(projectRoot, 'lerna.json'))) {
    isMonorepo = true;
    monorepoKind = 'lerna';
  } else {
    try {
      const pkgPath = path.join(projectRoot, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg && pkg.workspaces) {
          isMonorepo = true;
          monorepoKind = 'workspaces';
        }
      }
    } catch (_e) {
      // ignore
    }
  }

  return { nodeMajor, pkgManager, pkgManagerSource, isMonorepo, monorepoKind };
}

module.exports = detectEnv;
