/**
 * lib/cli/steps/ensure-skill.js · 引导安装 Claude skill
 *
 * 职责：
 *   - **不真的安装** auto-e2e Claude skill —— 因为 skills 的安装路径在用户家目录
 *     需要外部 `npx skills add` 或 IDE 集成完成；CLI 越权安装会出问题
 *   - 仅打印一段引导：怎么装、为什么要装、不装会怎样
 *   - 探测一下用户家目录下有无已装迹象（~/.claude/skills/auto-e2e）；有则告知"已就绪"
 *
 * 设计：
 *   - 靠 fs 探测，不能 100% 准；探测失败时只是打印不会失败
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const logger = require('../utils/logger');

function isLikelyInstalled() {
  const candidates = [
    path.join(os.homedir(), '.claude', 'skills', 'auto-e2e'),
    path.join(os.homedir(), '.codebuddy', 'skills', 'auto-e2e'),
    path.join(os.homedir(), '.config', 'skills', 'auto-e2e'),
  ];
  return candidates.find((p) => {
    try {
      return fs.existsSync(p);
    } catch (_e) {
      return false;
    }
  });
}

/**
 * @param {object} ctx
 * @param {object} ctx.opts
 */
async function ensureSkill(ctx) {
  const { opts = {} } = ctx;
  const { c } = logger;

  const found = isLikelyInstalled();
  if (found) {
    logger.success(`检测到 auto-e2e skill 已安装：${found}`);
    return { installed: true, path: found };
  }

  // 没探测到：打印引导
  if (opts.dryRun) {
    logger.hint('(dry-run) 将引导用户安装 auto-e2e skill');
    return { installed: false, dryRun: true };
  }

  logger.warn('未检测到 auto-e2e skill —— 这是给 Claude / CodeBuddy 用的"自动接管"插件');
  logger.blank();
  logger.plain(c.bold('要让 AI 自动测你的项目，请执行：'));
  logger.plain(`  ${c.cyan('npx skills add lisiyuan0828/S-AutoE2eSkill')}`);
  logger.blank();
  logger.hint('安装后，在 Claude / CodeBuddy 里直接说');
  logger.hint(`  "${c.cyan('测一下登录流程')}"`);
  logger.hint('skill 会读 docs/e2e/ 下的业务文档，自动生成并跑 Playwright 测试。');
  logger.blank();
  logger.hint('不装也没关系：你可以手写 e2e/*.spec.js 跑 npm run e2e。');
  return { installed: false, hinted: true };
}

module.exports = ensureSkill;
