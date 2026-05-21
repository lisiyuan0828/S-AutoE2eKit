/**
 * lib/cli/steps/ensure-docs.js · 生成 docs/e2e/ 业务文档骨架
 *
 * 职责：
 *   - 把 lib/cli/templates/docs-e2e/ 下的核心 md 拷贝到 projectRoot/docs/e2e/
 *   - 已存在的文件**默认跳过**（保护用户已写的内容）；--force 才覆盖
 *
 * 设计：
 *   - 不做模板替换；这些 md 是给"人 + skill"看的，里面的占位描述不需要用项目变量替换
 *   - 创建中间目录 docs/ 和 docs/e2e/（如果不存在）
 *   - **核心模板默认全装**：README / auth / flows / selectors
 *     —— 几乎所有项目都用得上，就算暂时不用也只是空模板，删起来很便宜
 *   - **可选模板按需装**：i18n.md 仅当 detectProject 检测到 i18n 库（i18next / vue-i18n / ...）时才生成
 *     —— 没 i18n 的项目硬塞 i18n.md 是噪声；用户后续真要时可手动 `--only=docs --force` 不解决问题，
 *        改用 `npx s-auto-e2e-kit init --only=docs` 仍然不会补——这是有意为之，避免误导
 *   - 用户后期想强行补 i18n.md，可以从 npm 包里直接拷模板：
 *       cp node_modules/s-auto-e2e-kit/lib/cli/templates/docs-e2e/i18n.md docs/e2e/
 */

'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const paths = require('../utils/paths');

// 核心模板：所有项目都装
const CORE_FILES = ['README.md', 'auth.md', 'flows.md', 'selectors.md'];

// 可选模板：根据 detect-project 结果按需装（key 与 detectProject 字段对齐）
const OPTIONAL_FILES = [
  { name: 'i18n.md', detectKey: 'hasI18n', label: 'i18n 多语言' },
];

/**
 * @param {object} ctx
 * @param {string} ctx.projectRoot
 * @param {object} ctx.project   detectProject 的结果
 * @param {object} ctx.opts
 */
async function ensureDocs(ctx) {
  const { projectRoot, project = {}, opts = {} } = ctx;
  const srcDir = path.join(paths.templatesDir(), 'docs-e2e');
  const dstDir = path.join(projectRoot, 'docs', 'e2e');

  if (!fs.existsSync(srcDir)) {
    throw new Error(`模板目录缺失：${srcDir}（包损坏？）`);
  }

  // 计算最终要生成的文件清单
  const filesToCreate = [...CORE_FILES];
  const optionalSkipped = [];
  for (const optional of OPTIONAL_FILES) {
    if (project[optional.detectKey]) {
      filesToCreate.push(optional.name);
    } else {
      optionalSkipped.push(optional);
    }
  }

  if (!opts.dryRun) {
    fs.mkdirSync(dstDir, { recursive: true });
  }

  const created = [];
  const skipped = [];
  for (const name of filesToCreate) {
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
  if (optionalSkipped.length > 0) {
    for (const it of optionalSkipped) {
      logger.hint(
        `按需跳过：${it.name}（未检测到${it.label}相关依赖；如需可手动从 node_modules/s-auto-e2e-kit/lib/cli/templates/docs-e2e/ 拷贝）`
      );
    }
  }
  return { created, skipped, optionalSkipped: optionalSkipped.map((x) => x.name), dir: dstDir };
}

module.exports = ensureDocs;
