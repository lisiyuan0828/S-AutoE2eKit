/**
 * lib/cli/steps/detect-project.js · 探测项目类型
 *
 * 职责：
 *   - 项目是 TypeScript 还是纯 JavaScript（决定 config 文件后缀）
 *   - 项目使用的框架（react/vue/svelte/nuxt/next，仅用于 baseURL 默认值提示）
 *   - dev 启动脚本（决定 webServer.command）
 *   - 默认 baseURL（猜测：webpack-dev-server / vite / next 默认端口）
 *
 * 不做：
 *   - 不修改任何文件
 *   - 不安装任何东西
 *
 * 返回：
 *   {
 *     useTS:        boolean,
 *     framework:    'react' | 'vue' | 'svelte' | 'next' | 'nuxt' | 'unknown',
 *     devScript:    string|null,   // 例如 "npm run dev"，找不到则 null
 *     guessBaseURL: string,        // 猜的默认 baseURL，例如 "http://localhost:5173"
 *   }
 */

'use strict';

const fs = require('fs');
const path = require('path');

function hasDep(pkg, name) {
  return Boolean(
    (pkg.dependencies && pkg.dependencies[name]) ||
      (pkg.devDependencies && pkg.devDependencies[name]) ||
      (pkg.peerDependencies && pkg.peerDependencies[name])
  );
}

/**
 * @param {object} ctx
 * @param {string} ctx.projectRoot
 */
function detectProject(ctx) {
  const { projectRoot } = ctx;
  const pkgPath = path.join(projectRoot, 'package.json');
  const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')) : {};

  // 1. TS or JS
  const tsconfig = fs.existsSync(path.join(projectRoot, 'tsconfig.json'));
  const useTS = tsconfig || hasDep(pkg, 'typescript');

  // 2. framework
  let framework = 'unknown';
  if (hasDep(pkg, 'next')) framework = 'next';
  else if (hasDep(pkg, 'nuxt') || hasDep(pkg, 'nuxt3')) framework = 'nuxt';
  else if (hasDep(pkg, 'react')) framework = 'react';
  else if (hasDep(pkg, 'vue')) framework = 'vue';
  else if (hasDep(pkg, 'svelte')) framework = 'svelte';

  // 3. dev 脚本（按优先级猜：dev > start > serve）
  const scripts = pkg.scripts || {};
  let devScript = null;
  if (scripts.dev) devScript = 'npm run dev';
  else if (scripts.start) devScript = 'npm start';
  else if (scripts.serve) devScript = 'npm run serve';

  // 4. baseURL：按工具链 / framework 猜默认端口
  let guessBaseURL = 'http://localhost:3000';
  if (hasDep(pkg, 'vite')) guessBaseURL = 'http://localhost:5173';
  else if (framework === 'next') guessBaseURL = 'http://localhost:3000';
  else if (framework === 'nuxt') guessBaseURL = 'http://localhost:3000';
  else if (hasDep(pkg, 'webpack-dev-server')) guessBaseURL = 'http://localhost:8080';

  return { useTS, framework, devScript, guessBaseURL };
}

module.exports = detectProject;
