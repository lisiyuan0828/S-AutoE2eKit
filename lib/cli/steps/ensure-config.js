/**
 * lib/cli/steps/ensure-config.js · 生成 playwright.config.js
 *
 * 职责：
 *   - 从 lib/cli/templates/playwright.config.js 读模板
 *   - 替换占位符：__TEST_DIR__ / __BASE_URL__ / __DEV_COMMAND__
 *   - 写到 projectRoot/playwright.config.js
 *   - 已存在则跳过；--force 才覆盖
 *
 * 设计：
 *   - 不支持 .ts 模板（即使 useTS 项目也写 .js）—— 简单粗暴，能跑就行
 *     用户想要 .ts 自己改后缀加类型，不影响功能
 *   - 占位符策略：纯字符串 replace，不引入模板引擎，不做 escape（值都是简单字符串）
 */

'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const paths = require('../utils/paths');

/**
 * @param {object} ctx
 * @param {string} ctx.projectRoot
 * @param {object} ctx.project   detect-project 返回值
 * @param {object} ctx.opts      CLI opts
 */
async function ensureConfig(ctx) {
  const { projectRoot, project = {}, opts = {} } = ctx;
  const target = path.join(projectRoot, 'playwright.config.js');

  // 已存在场景
  const candidates = ['playwright.config.js', 'playwright.config.ts', 'playwright.config.mjs'];
  const existing = candidates.find((n) => fs.existsSync(path.join(projectRoot, n)));
  if (existing && !opts.force) {
    logger.success(`已有配置，跳过：${existing}（用 --force 覆盖）`);
    return { written: false, path: path.join(projectRoot, existing) };
  }

  // 读模板
  const templatePath = path.join(paths.templatesDir(), 'playwright.config.js');
  if (!fs.existsSync(templatePath)) {
    throw new Error(`模板缺失：${templatePath}（包损坏？）`);
  }
  let content = fs.readFileSync(templatePath, 'utf8');

  // 替换占位符
  const baseURL = project.guessBaseURL || 'http://localhost:3000';
  const devCommand = project.devScript || 'npm run dev';
  content = content
    .replace(/__TEST_DIR__/g, './e2e')
    .replace(/__BASE_URL__/g, baseURL)
    .replace(/__DEV_COMMAND__/g, devCommand);

  if (opts.dryRun) {
    logger.hint(`(dry-run) 将写入 ${target}（${content.length} 字节）`);
    return { written: false, path: target, dryRun: true };
  }

  fs.writeFileSync(target, content, 'utf8');
  logger.success(`已生成：${target}`);
  logger.hint(`  baseURL = ${baseURL}`);
  logger.hint(`  testDir = ./e2e`);
  return { written: true, path: target };
}

module.exports = ensureConfig;
