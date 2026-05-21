/**
 * lib/cli/commands/doctor.js · 体检命令（骨架版 · Stage 1）
 *
 * 当前状态：**骨架阶段**
 *   - 仅做最基础的环境探测：是否有 package.json、node 版本、是否已装 PW、是否有 config
 *   - 不修复任何东西，纯只读
 *
 * Stage 2 将增强：
 *   - 复用 steps/detect-env + steps/detect-project 的真实探测
 *   - 输出每项的"修复建议命令"
 *   - 退出码：全部就绪 0；有缺项但可修复 1；致命问题 2
 */

'use strict';

const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const paths = require('../utils/paths');
const { capture } = require('../utils/exec');

async function doctor(_opts = {}) {
  const { c } = logger;
  logger.title('s-auto-e2e-kit · doctor');

  let missing = 0;
  let warnings = 0;

  // ---------- 1. 项目根 ----------
  const projectRoot = paths.findProjectRoot();
  if (!projectRoot) {
    logger.error('未在当前目录及其上级找到 package.json');
    logger.hint('在你的项目根目录跑这条命令');
    process.exit(2);
  }
  logger.success(`项目根：${c.cyan(projectRoot)}`);

  const pkg = paths.readPackageJson(projectRoot) || {};

  // ---------- 2. node 版本 ----------
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (Number.isFinite(nodeMajor) && nodeMajor >= 14) {
    logger.success(`Node.js: ${c.cyan(process.version)} (>= 14)`);
  } else {
    logger.warn(`Node.js 版本偏低：${process.version}（建议 >= 14）`);
    warnings += 1;
  }

  // ---------- 3. 包管理器（按 lockfile 推断） ----------
  const lockfiles = {
    'pnpm-lock.yaml': 'pnpm',
    'yarn.lock': 'yarn',
    'package-lock.json': 'npm',
  };
  const detectedPm = Object.entries(lockfiles).find(([f]) =>
    fs.existsSync(path.join(projectRoot, f))
  );
  if (detectedPm) {
    logger.success(`包管理器：${c.cyan(detectedPm[1])}（依据 ${detectedPm[0]}）`);
  } else {
    logger.warn('未检测到 lockfile，将默认使用 npm');
    warnings += 1;
  }

  // ---------- 4. @playwright/test 是否已装 ----------
  const pwInstalled = fs.existsSync(
    path.join(projectRoot, 'node_modules', '@playwright', 'test', 'package.json')
  );
  if (pwInstalled) {
    logger.success('@playwright/test 已安装');
  } else {
    logger.warn('@playwright/test 未安装');
    missing += 1;
  }

  // ---------- 5. s-auto-e2e-kit 是否已装 ----------
  const kitInstalled = fs.existsSync(
    path.join(projectRoot, 'node_modules', 's-auto-e2e-kit', 'package.json')
  );
  if (kitInstalled) {
    logger.success('s-auto-e2e-kit 已安装');
  } else {
    logger.warn('s-auto-e2e-kit 未安装（项目 dev 依赖）');
    missing += 1;
  }

  // ---------- 6. playwright.config.js 是否存在 ----------
  const configCandidates = ['playwright.config.js', 'playwright.config.ts', 'playwright.config.mjs'];
  const config = configCandidates.find((n) => fs.existsSync(path.join(projectRoot, n)));
  if (config) {
    logger.success(`配置存在：${c.cyan(config)}`);
  } else {
    logger.warn('playwright.config.* 不存在');
    missing += 1;
  }

  // ---------- 7. docs/e2e/ 业务文档 ----------
  const docsDir = path.join(projectRoot, 'docs', 'e2e');
  if (fs.existsSync(docsDir)) {
    const files = fs.readdirSync(docsDir).filter((f) => f.endsWith('.md'));
    logger.success(`docs/e2e/ 已存在（${files.length} 个 md 文件）`);
  } else {
    logger.warn('docs/e2e/ 业务文档骨架不存在');
    missing += 1;
  }

  // ---------- 8. npm scripts ----------
  const scripts = pkg.scripts || {};
  if (scripts.e2e) {
    logger.success(`scripts.e2e = ${c.cyan(scripts.e2e)}`);
  } else {
    logger.warn('package.json 未注入 scripts.e2e');
    warnings += 1;
  }

  // ---------- 9. Chromium 浏览器（探测 npx playwright --version） ----------
  try {
    const r = await capture('npx', ['playwright', '--version'], { cwd: projectRoot });
    if (r.code === 0 && r.stdout) {
      logger.success(`Playwright CLI 可用：${c.cyan(r.stdout)}`);
    } else {
      logger.warn('Playwright CLI 不可用');
      warnings += 1;
    }
  } catch (_e) {
    logger.warn('Playwright CLI 探测失败');
    warnings += 1;
  }

  // ---------- 总结 ----------
  logger.blank();
  if (missing === 0 && warnings === 0) {
    logger.success(c.bold('环境完全就绪 ✓'));
    process.exit(0);
  } else {
    logger.plain(
      c.yellow(
        `共 ${missing} 项缺失、${warnings} 项告警。` +
          `跑 ${c.cyan('npx s-auto-e2e-kit init')} 一键修复。`
      )
    );
    process.exit(missing > 0 ? 1 : 0);
  }
}

module.exports = doctor;
