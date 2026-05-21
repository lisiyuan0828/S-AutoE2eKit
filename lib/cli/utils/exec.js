/**
 * lib/cli/utils/exec.js · child_process spawn 封装
 *
 * 设计原则：
 *   - 流式输出：子进程 stdout/stderr 直接转发，让 npm install 进度条等可见
 *   - dryRun 模式：不真跑，仅打印将要执行的命令（挑刺者必备）
 *   - 错误抛出：子进程非 0 退出时抛 Error，调用方决定如何处理
 *   - 跨平台：Windows 用 shell:true 让 npm.cmd 等可被解析
 */

'use strict';

const { spawn } = require('child_process');
const logger = require('./logger');

const isWindows = process.platform === 'win32';

/**
 * 执行命令并流式转发输出
 *
 * @param {string} command 主命令，如 "npm" / "npx"
 * @param {string[]} args 参数数组
 * @param {object} [opts]
 * @param {string} [opts.cwd]              工作目录
 * @param {boolean} [opts.dryRun]          true 时不真执行，仅打印
 * @param {object} [opts.env]              额外环境变量
 * @param {boolean} [opts.silent]          true 时不打印命令本身（仅静默执行）
 * @returns {Promise<void>}
 */
function run(command, args, opts = {}) {
  const { cwd, dryRun = false, env, silent = false } = opts;
  const display = `${command} ${args.join(' ')}`;

  if (!silent) {
    logger.hint(`$ ${display}${cwd ? `   (cwd: ${cwd})` : ''}`);
  }

  if (dryRun) {
    logger.hint('  (dry-run, 跳过真实执行)');
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: cwd || process.cwd(),
      env: { ...process.env, ...(env || {}) },
      stdio: 'inherit',
      shell: isWindows, // Windows 下 shell 模式，npm.cmd / npx.cmd 才能被找到
    });

    child.on('error', (err) => {
      reject(new Error(`spawn 失败：${command} —— ${err.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`命令失败（exit ${code}）：${display}`));
    });
  });
}

/**
 * 执行命令并捕获 stdout（用于探测类场景，比如 `npm config get registry`）
 * 与 run 不同：不流式输出，返回 stdout 字符串
 *
 * @param {string} command
 * @param {string[]} args
 * @param {object} [opts]
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
function capture(command, args, opts = {}) {
  const { cwd, env } = opts;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: cwd || process.cwd(),
      env: { ...process.env, ...(env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: isWindows,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code: code == null ? -1 : code });
    });
  });
}

module.exports = { run, capture };
