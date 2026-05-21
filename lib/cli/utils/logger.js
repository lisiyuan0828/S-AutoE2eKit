/**
 * lib/cli/utils/logger.js · 极简 ANSI 颜色日志
 *
 * 设计原则：
 *   - 零第三方依赖（不引 chalk / kleur / picocolors）
 *   - 在非 TTY / NO_COLOR 环境自动降级为纯文本
 *   - 提供语义化前缀（info/warn/error/success/step）便于扫读
 */

'use strict';

const isTTY = process.stdout.isTTY === true;
const noColor = process.env.NO_COLOR != null || process.env.TERM === 'dumb';
const colorOn = isTTY && !noColor;

function wrap(code, str) {
  if (!colorOn) return String(str);
  return `\x1b[${code}m${str}\x1b[0m`;
}

const c = {
  gray: (s) => wrap(90, s),
  red: (s) => wrap(31, s),
  green: (s) => wrap(32, s),
  yellow: (s) => wrap(33, s),
  blue: (s) => wrap(34, s),
  magenta: (s) => wrap(35, s),
  cyan: (s) => wrap(36, s),
  bold: (s) => wrap(1, s),
  dim: (s) => wrap(2, s),
};

function info(msg) {
  // eslint-disable-next-line no-console
  console.log(`${c.cyan('ℹ')}  ${msg}`);
}

function warn(msg) {
  // eslint-disable-next-line no-console
  console.warn(`${c.yellow('⚠')}  ${msg}`);
}

function error(msg) {
  // eslint-disable-next-line no-console
  console.error(`${c.red('✗')}  ${msg}`);
}

function success(msg) {
  // eslint-disable-next-line no-console
  console.log(`${c.green('✓')}  ${msg}`);
}

function step(msg) {
  // eslint-disable-next-line no-console
  console.log(`${c.blue('→')}  ${c.bold(msg)}`);
}

function pending(msg) {
  // eslint-disable-next-line no-console
  console.log(`${c.gray('☐')}  ${msg}`);
}

function done(msg) {
  // eslint-disable-next-line no-console
  console.log(`${c.green('☑')}  ${msg}`);
}

function plain(msg) {
  // eslint-disable-next-line no-console
  console.log(msg);
}

function blank() {
  // eslint-disable-next-line no-console
  console.log('');
}

function title(msg) {
  blank();
  plain(c.bold(c.magenta(`━━━ ${msg} ━━━`)));
  blank();
}

function hint(msg) {
  // eslint-disable-next-line no-console
  console.log(`   ${c.dim(msg)}`);
}

module.exports = {
  c,
  info,
  warn,
  error,
  success,
  step,
  pending,
  done,
  plain,
  blank,
  title,
  hint,
};
