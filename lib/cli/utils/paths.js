/**
 * lib/cli/utils/paths.js · 路径解析工具
 *
 * 设计要点：
 *   - consumerCwd: 用户跑 `npx s-auto-e2e-kit init` 时的目录（process.cwd）
 *   - packageRoot: CLI 包自己的根（用于读取 templates/）
 *   - findProjectRoot: 从 consumerCwd 向上找最近的 package.json（monorepo 友好）
 */

'use strict';

const fs = require('fs');
const path = require('path');

/** 用户当前所在目录（npx 执行点） */
function consumerCwd() {
  return process.cwd();
}

/**
 * CLI 包自身的根目录
 *   - 本文件位于 <pkg>/lib/cli/utils/paths.js
 *   - 向上 3 级即为包根
 */
function packageRoot() {
  return path.resolve(__dirname, '..', '..', '..');
}

/** 模板目录绝对路径 */
function templatesDir() {
  return path.join(packageRoot(), 'lib', 'cli', 'templates');
}

/**
 * 从给定目录向上查找最近的 package.json 所在目录
 *
 * @param {string} [start=consumerCwd()]
 * @returns {string|null} 找不到返回 null
 */
function findProjectRoot(start) {
  let dir = path.resolve(start || consumerCwd());
  const root = path.parse(dir).root;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    if (dir === root) return null;
    dir = path.dirname(dir);
  }
}

/**
 * 安全读 package.json（不存在或解析失败返回 null）
 *
 * @param {string} dir
 * @returns {object|null}
 */
function readPackageJson(dir) {
  const p = path.join(dir, 'package.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_e) {
    return null;
  }
}

/** 文件存在判断 */
function exists(p) {
  try {
    return fs.existsSync(p);
  } catch (_e) {
    return false;
  }
}

module.exports = {
  consumerCwd,
  packageRoot,
  templatesDir,
  findProjectRoot,
  readPackageJson,
  exists,
};
