/**
 * lib/cli/utils/prompt.js · 极简交互提问
 *
 * 设计原则：
 *   - 零第三方依赖（不引 inquirer / prompts / @clack/prompts）
 *   - 仅暴露 confirm（y/n）—— init 流程足够用，避免设计过度
 *   - 非 TTY 环境（CI / pipe）自动按默认值回答，绝不 hang 住
 *   - 支持外部 force 跳过（CLI 的 --yes 即跳过所有 confirm）
 */

'use strict';

const readline = require('readline');

/**
 * y/n 二选一确认
 *
 * @param {string} question 问题文本（不要带 (y/n) 后缀，函数自动加）
 * @param {object} [opts]
 * @param {boolean} [opts.defaultValue=true] 回车默认值
 * @param {boolean} [opts.force]             外部强制跳过（true=按 default 直接通过）
 * @returns {Promise<boolean>}
 */
function confirm(question, opts = {}) {
  const { defaultValue = true, force = false } = opts;

  // 外部 --yes 等场景：直接按默认通过，不交互
  if (force) {
    return Promise.resolve(defaultValue);
  }

  // 非 TTY（CI / 管道）：直接按默认通过，避免 hang
  if (!process.stdin.isTTY) {
    return Promise.resolve(defaultValue);
  }

  const hint = defaultValue ? '(Y/n)' : '(y/N)';

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(`${question} ${hint} `, (answer) => {
      rl.close();
      const trimmed = String(answer || '').trim().toLowerCase();
      if (trimmed === '') return resolve(defaultValue);
      if (['y', 'yes', '是', '好', 'ok'].includes(trimmed)) return resolve(true);
      if (['n', 'no', '否', '不'].includes(trimmed)) return resolve(false);
      // 不识别的输入：按默认值
      resolve(defaultValue);
    });
  });
}

module.exports = { confirm };
