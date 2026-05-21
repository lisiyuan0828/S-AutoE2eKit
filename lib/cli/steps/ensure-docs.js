/**
 * lib/cli/steps/ensure-docs.js · 生成 docs/e2e/ 业务文档骨架
 *
 * 职责：
 *   - 把 lib/cli/templates/docs-e2e/ 下的 5 个 md 拷贝到 projectRoot/docs/e2e/
 *   - 已存在的文件**默认跳过**（保护用户已写的内容）；--force 才覆盖
 *
 * 设计：
 *   - 不做模板替换；这些 md 是给"人 + skill"看的，里面的占位描述不需要用项目变量替换
 *   - 创建中间目录 docs/ 和 docs/e2e/（如果不存在）
 */

'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const paths = require('../utils/paths');

const FILES = ['README.md', 'auth.md', 'flows.md', 'selectors.md', 'i18n.md'];

/**
 * @param {object} ctx
 * @param {string} ctx.projectRoot
 * @param {object} ctx.opts
 */
async function ensureDocs(ctx) {
  const { projectRoot, opts = {} } = ctx;
  const srcDir = path.join(paths.templatesDir(), 'docs-e2e');
  const dstDir = path.join(projectRoot, 'docs', 'e2e');

  if (!fs.existsSync(srcDir)) {
    throw new Error(`模板目录缺失：${srcDir}（包损坏？）`);
  }

  if (!opts.dryRun) {
    fs.mkdirSync(dstDir, { recursive: true });
  }

  const created = [];
  const skipped = [];
  for (const name of FILES) {
    const src = path.join(srcDir, name);
    const dst = path.join(dstDir, name);
    if (fs.existsSync(dst) && !opts.force) {
      skipped.push(name);
      continue;
    }
    if (opts.dryRun) {
      created.push(name);
      continue;
    }
    fs.copyFileSync(src, dst);
    created.push(name);
  }

  if (created.length > 0) {
    logger.success(
      `docs/e2e/ ${opts.dryRun ? '将创建' : '已创建'}：${created.join(', ')}`
    );
  }
  if (skipped.length > 0) {
    logger.hint(`已存在跳过：${skipped.join(', ')}（用 --force 覆盖）`);
  }
  return { created, skipped, dir: dstDir };
}

module.exports = ensureDocs;
