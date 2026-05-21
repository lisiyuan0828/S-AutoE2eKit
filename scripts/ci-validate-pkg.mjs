#!/usr/bin/env node
/**
 * scripts/ci-validate-pkg.mjs · package.json 元数据校验（CI 用）
 *
 * 防止以下"沉默事故"流入 npm：
 *   - bin 字段误删 / 路径写错
 *   - files 白名单漏列 bin/ 目录 → npx 装下来跑不动
 *   - keywords 丢失 auto-e2e-toolkit → skill §0.4 / §0.8 探测失败
 *   - main / exports 路径不存在
 *   - LICENSE 缺失但 license 字段声称 MIT
 *
 * 任意一项校验不过即 exit 1，CI 中止后续 publish。
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const errors = [];
const warnings = [];

function fail(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

// ---------- 必备字段 ----------
['name', 'version', 'description', 'license', 'author', 'main', 'bin', 'files'].forEach((f) => {
  if (pkg[f] == null || (typeof pkg[f] === 'object' && Object.keys(pkg[f]).length === 0)) {
    fail(`字段缺失或为空：${f}`);
  }
});

// ---------- name 必须是 s-auto-e2e-kit ----------
if (pkg.name !== 's-auto-e2e-kit') {
  fail(`name 应为 "s-auto-e2e-kit"，实际 "${pkg.name}"`);
}

// ---------- version 是合法 semver ----------
if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(pkg.version || '')) {
  fail(`version 不是合法 semver：${pkg.version}`);
}

// ---------- bin 必须含 auto-e2e 别名且文件存在 ----------
if (typeof pkg.bin !== 'object' || pkg.bin === null) {
  fail('bin 字段必须是对象（包含 auto-e2e / auto-e2e-kit 双别名）');
} else {
  if (!pkg.bin['auto-e2e']) fail('bin 缺少 "auto-e2e" 别名');
  if (!pkg.bin['auto-e2e-kit']) fail('bin 缺少 "auto-e2e-kit" 别名');
  for (const [alias, rel] of Object.entries(pkg.bin)) {
    const abs = path.join(ROOT, rel);
    if (!existsSync(abs)) fail(`bin "${alias}" 指向的文件不存在：${rel}`);
  }
}

// ---------- files 必须显式包含 bin 入口和 lib/ ----------
const files = pkg.files || [];
const hasBinEntry = files.some((f) => f === 'bin/' || f.startsWith('bin/auto-e2e'));
if (!hasBinEntry) fail('files 白名单未包含 bin/ 或具体的 bin/auto-e2e.* 路径');
if (!files.includes('lib/')) fail('files 白名单未包含 lib/');

// ---------- keywords 必须含 auto-e2e-toolkit（skill 探测靠它） ----------
const kw = pkg.keywords || [];
if (!kw.includes('auto-e2e-toolkit')) {
  fail('keywords 缺 "auto-e2e-toolkit"（skill §0.4 / §0.8 探测会失败）');
}

// ---------- main 路径必须存在 ----------
if (pkg.main && !existsSync(path.join(ROOT, pkg.main))) {
  fail(`main 指向的文件不存在：${pkg.main}`);
}

// ---------- exports 各路径必须存在（除了 wildcard 和 package.json） ----------
const exp = pkg.exports || {};
for (const [key, val] of Object.entries(exp)) {
  if (typeof val !== 'string') continue;
  if (val.includes('*')) continue; // wildcard 跳过
  if (!existsSync(path.join(ROOT, val))) {
    fail(`exports["${key}"] 指向的文件不存在：${val}`);
  }
}

// ---------- LICENSE 文件必须存在 ----------
if (!existsSync(path.join(ROOT, 'LICENSE'))) {
  warn('LICENSE 文件缺失（package.json 声称 license=' + pkg.license + '）');
}

// ---------- README 必须存在 ----------
if (!existsSync(path.join(ROOT, 'README.md'))) {
  fail('README.md 缺失');
}

// ---------- publishConfig.access 必须 public（unscoped npm 默认 restricted） ----------
if (pkg.publishConfig?.access !== 'public') {
  warn('publishConfig.access 不是 "public"，发包到公网 npm 时可能被拒');
}

// ---------- 报告 ----------
if (warnings.length > 0) {
  console.log('\n⚠️  Warnings:');
  warnings.forEach((w) => console.log(`   - ${w}`));
}

if (errors.length > 0) {
  console.error('\n❌ package.json validation failed:');
  errors.forEach((e) => console.error(`   - ${e}`));
  process.exit(1);
}

console.log(`\n✓ package.json 元数据校验通过（${pkg.name}@${pkg.version}）`);
