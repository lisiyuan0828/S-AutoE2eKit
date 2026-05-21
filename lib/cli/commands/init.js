/**
 * lib/cli/commands/init.js · init 命令（实装版 · Stage 2）
 *
 * 职责：
 *   一条命令把 E2E 环境从 0 拉起：
 *     1) 探测环境 + 项目类型
 *     2) 装依赖（@playwright/test + s-auto-e2e-kit）
 *     3) 装浏览器（chromium）
 *     4) 生成 playwright.config.js
 *     5) 生成 docs/e2e/*.md 业务文档骨架
 *     6) 注入 package.json#scripts.e2e*
 *
 * 流程控制：
 *   - 默认交互式（一次 confirm）；--yes / --auto 跳过
 *   - --manual 不真执行，只打印手动命令
 *   - --dry-run 走全流程但不真改文件、不真装包
 *   - --only=<id> 只跑某一步（deps / browsers / config / docs / scripts）
 *   - --skip-browsers 跳过下载浏览器
 *
 * 失败策略：
 *   - 任一 step 抛出即中断后续；前面的 step 不回滚（用户可重跑，所有 step 都是幂等的）
 */

'use strict';

const logger = require('../utils/logger');
const prompt = require('../utils/prompt');
const paths = require('../utils/paths');

const detectEnv = require('../steps/detect-env');
const detectProject = require('../steps/detect-project');
const ensureDependencies = require('../steps/ensure-dependencies');
const ensureBrowsers = require('../steps/ensure-browsers');
const ensureConfig = require('../steps/ensure-config');
const ensureDocs = require('../steps/ensure-docs');
const ensureScripts = require('../steps/ensure-scripts');

/**
 * @param {object} opts CLI 解析后的选项
 */
async function init(opts = {}) {
  const { c } = logger;

  logger.title('s-auto-e2e-kit · init');

  // ---------- 1. 定位项目根 ----------
  const projectRoot = paths.findProjectRoot();
  if (!projectRoot) {
    logger.error('当前目录及其上级都没有找到 package.json');
    logger.hint('请在你的项目根目录（含 package.json）跑这条命令');
    process.exit(1);
  }
  const pkg = paths.readPackageJson(projectRoot) || {};
  logger.info(`项目根:    ${c.cyan(projectRoot)}`);
  logger.info(`项目名:    ${c.cyan(pkg.name || '(unnamed)')}`);
  logger.info(`项目版本:  ${c.cyan(pkg.version || '0.0.0')}`);
  logger.blank();

  // ---------- 2. 探测环境与项目类型（只读） ----------
  logger.step('探测环境');
  const env = detectEnv({ projectRoot, opts });
  const project = detectProject({ projectRoot });
  logger.hint(
    `node=${process.version}  pkgManager=${env.pkgManager}(${env.pkgManagerSource})` +
      `  monorepo=${env.isMonorepo ? env.monorepoKind : 'no'}`
  );
  logger.hint(
    `framework=${project.framework}  ts=${project.useTS}` +
      `  baseURL≈${project.guessBaseURL}  dev=${project.devScript || 'n/a'}`
  );
  logger.blank();

  // ---------- 3. 体检清单 ----------
  const docsLabel = project.hasI18n
    ? '创建 docs/e2e/ 业务文档骨架（核心 4 + i18n.md）'
    : '创建 docs/e2e/ 业务文档骨架（核心 4 个文件）';
  const checklist = [
    { id: 'deps',     label: '安装 s-auto-e2e-kit + @playwright/test', skip: false,                 fn: ensureDependencies },
    { id: 'browsers', label: '下载 Chromium 浏览器（约 130MB）',        skip: !!opts.skipBrowsers,    fn: ensureBrowsers },
    { id: 'config',   label: '生成 playwright.config.js',               skip: false,                 fn: ensureConfig },
    { id: 'docs',     label: docsLabel,                                 skip: false,                 fn: ensureDocs },
    { id: 'scripts',  label: '注入 package.json scripts (e2e/e2e:ui)',  skip: false,                 fn: ensureScripts },
  ];

  // --only=<id> 过滤
  const onlyId = opts.only || null;
  if (onlyId && !checklist.find((x) => x.id === onlyId)) {
    logger.error(`--only=${onlyId} 不是合法步骤；可选：${checklist.map((x) => x.id).join(', ')}`);
    process.exit(2);
  }

  logger.step('计划');
  for (const item of checklist) {
    const filtered = onlyId && onlyId !== item.id;
    const tag = item.skip ? c.dim(' (skip)') : filtered ? c.dim(' (filtered)') : '';
    logger.pending(`${item.label}${tag}`);
  }
  logger.blank();

  // ---------- 4. 模式决策 ----------
  if (opts.manual) {
    logger.warn('manual 模式：仅打印命令，不执行修改');
    logger.blank();
    printManualHints(checklist, env);
    return;
  }
  if (opts.dryRun) {
    logger.warn('dry-run 模式：走完所有 step 但不真改文件、不真装包');
    logger.blank();
  }

  let goAhead = true;
  if (!opts.auto && !opts.yes && !opts.dryRun) {
    goAhead = await prompt.confirm('要我一键搞定上面的事吗？', { defaultValue: true });
  }
  if (!goAhead) {
    logger.info('已取消。可以稍后再跑：' + c.cyan('npx s-auto-e2e-kit init'));
    return;
  }

  // ---------- 5. 真正执行 ----------
  const ctx = { projectRoot, opts, env, project };
  for (const item of checklist) {
    const filtered = onlyId && onlyId !== item.id;
    if (item.skip) {
      logger.hint(`[skip]    ${item.label}`);
      continue;
    }
    if (filtered) {
      logger.hint(`[filter]  ${item.label}`);
      continue;
    }

    logger.blank();
    logger.step(item.label);
    try {
      await item.fn(ctx);
      logger.done(item.label);
    } catch (err) {
      logger.error(`${item.id} 失败：${err && err.message ? err.message : String(err)}`);
      logger.hint('修好后可以重跑（所有步骤幂等）：');
      logger.hint(`  ${c.cyan(`npx s-auto-e2e-kit init --only=${item.id}`)}`);
      process.exit(1);
    }
  }

  // ---------- 6. 完成提示 ----------
  logger.blank();
  logger.success('init 完成');
  logger.blank();
  logger.plain(c.bold('下一步:'));
  logger.plain(`  ${c.cyan('npm run e2e')}              ${c.dim('# 跑测试（默认 chromium）')}`);
  logger.plain(`  ${c.cyan('npm run e2e:ui')}           ${c.dim('# 交互式 UI 模式（推荐边写边看）')}`);
  logger.hint('需要带浏览器窗口 debug：' + c.cyan('npx playwright test --headed'));
  logger.hint('需要看 HTML 报告：    ' + c.cyan('npx playwright show-report'));
  logger.blank();
  logger.plain(c.bold('体检环境:'));
  logger.plain(`  ${c.cyan('npx s-auto-e2e-kit doctor')}`);
  logger.blank();
  logger.plain(c.bold('配套 Claude / CodeBuddy skill（强烈推荐）:'));
  logger.plain(`  ${c.cyan('npx skills add lisiyuan0828/S-AutoE2eSkill')}`);
  logger.hint('装好 skill 后，直接对 AI 说"测一下登录流程"即可自动接管。');
  logger.blank();
}

function printManualHints(checklist, env) {
  const { c } = logger;
  const pm = (env && env.pkgManager) || 'npm';
  const installCmd =
    pm === 'pnpm'
      ? 'pnpm add -D s-auto-e2e-kit @playwright/test'
      : pm === 'yarn'
      ? 'yarn add -D s-auto-e2e-kit @playwright/test'
      : 'npm i -D s-auto-e2e-kit @playwright/test';

  logger.plain(c.bold('请手动执行（按顺序）:'));
  logger.plain(`  ${c.cyan(installCmd)}`);
  if (!checklist.find((x) => x.id === 'browsers')?.skip) {
    logger.plain(`  ${c.cyan('npx playwright install chromium')}`);
  }
  logger.plain(`  ${c.cyan('npx s-auto-e2e-kit init --only=config')}    ${c.dim('# 仅生成 playwright.config.js')}`);
  logger.plain(`  ${c.cyan('npx s-auto-e2e-kit init --only=docs')}      ${c.dim('# 仅生成 docs/e2e/')}`);
  logger.plain(`  ${c.cyan('npx s-auto-e2e-kit init --only=scripts')}   ${c.dim('# 仅注入 npm scripts')}`);
  logger.blank();
  logger.hint('如需 Claude skill：' + c.cyan('npx skills add lisiyuan0828/S-AutoE2eSkill'));
}

module.exports = init;
