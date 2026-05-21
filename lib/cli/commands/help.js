/**
 * lib/cli/commands/help.js · 帮助文本
 *
 * 设计原则：
 *   - 无外部依赖（不引 commander）
 *   - 帮助文本即文档，列出全部命令 + 全部 flag + 一行示例
 */

'use strict';

const logger = require('../utils/logger');

function showHelp() {
  const { c } = logger;
  const lines = [
    '',
    c.bold(c.magenta('s-auto-e2e-kit')) + c.dim(' · Drop-in Playwright E2E factory toolkit'),
    '',
    c.bold('用法:'),
    `  ${c.cyan('npx s-auto-e2e-kit')} ${c.yellow('<command>')} ${c.dim('[options]')}`,
    '',
    c.bold('命令:'),
    `  ${c.yellow('init')}      ${c.dim('在当前项目中初始化 E2E 环境（装包 + 配置 + 文档骨架）')}`,
    `  ${c.yellow('doctor')}    ${c.dim('体检：检测环境是否就绪，不做任何修改')}`,
    `  ${c.yellow('help')}      ${c.dim('显示本帮助')}`,
    `  ${c.yellow('--version')} ${c.dim('打印版本号')}`,
    '',
    c.bold('init 选项:'),
    `  ${c.cyan('--yes, -y')}              ${c.dim('跳过所有确认（CI 必备）')}`,
    `  ${c.cyan('--auto')}                 ${c.dim('bootstrap.mode=auto（不问，全自动）')}`,
    `  ${c.cyan('--manual')}               ${c.dim('bootstrap.mode=manual（只打印命令，不执行）')}`,
    `  ${c.cyan('--dry-run')}              ${c.dim('只打印计划，不真执行（debug）')}`,
    `  ${c.cyan('--force')}                ${c.dim('覆盖已存在的 playwright.config.js / docs/e2e/*')}`,
    `  ${c.cyan('--skip-browsers')}        ${c.dim('跳过 npx playwright install')}`,
    `  ${c.cyan('--pkg-manager <m>')}      ${c.dim('强制使用 npm | pnpm | yarn')}`,
    `  ${c.cyan('--only <step>')}          ${c.dim('只跑某一步：deps | browsers | config | docs | scripts')}`,
    '',
    c.bold('示例:'),
    `  ${c.cyan('npx s-auto-e2e-kit init')}                  ${c.dim('# 默认交互式接入')}`,
    `  ${c.cyan('npx s-auto-e2e-kit init --yes')}            ${c.dim('# CI 静默接入')}`,
    `  ${c.cyan('npx s-auto-e2e-kit init --dry-run')}        ${c.dim('# 只看计划')}`,
    `  ${c.cyan('npx s-auto-e2e-kit doctor')}                ${c.dim('# 仅体检不修复')}`,
    '',
    c.bold('文档:'),
    `  ${c.dim('https://github.com/lisiyuan0828/S-AutoE2eKit')}`,
    '',
  ];
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
}

module.exports = { showHelp };
