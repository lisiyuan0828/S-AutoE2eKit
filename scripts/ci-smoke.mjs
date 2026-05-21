#!/usr/bin/env node
/**
 * scripts/ci-smoke.mjs · 端到端冒烟测试（CI 用）
 *
 * 在临时 fixture 项目里依次跑：
 *   1. init --yes --dry-run --skip-browsers       全流程不真做
 *   2. init --only=docs --yes --skip-browsers     真创建 docs/e2e/
 *   3. init --only=config --yes --skip-browsers   真创建 playwright.config.js
 *   4. init --only=scripts --yes --skip-browsers  真注入 scripts
 *   5. doctor                                      真探测，但允许 PW/kit 未装
 *
 * 各步骤的预期：
 *   - 退出码均为 0
 *   - 步骤 2 后 fixture/docs/e2e/ 必须有 5 个 md
 *   - 步骤 3 后 playwright.config.js 必须存在且包含 vite 默认 baseURL（5173）
 *   - 步骤 4 后 fixture/package.json 必须含 e2e / e2e:ui / e2e:headed / e2e:report
 *
 * 跨平台：用 Node 原生 fs / child_process，不依赖 shell；Windows / macOS / Linux 都跑得动
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, '..');
const CLI = path.join(PKG_ROOT, 'bin', 'auto-e2e.mjs');

let failures = 0;

function step(title, fn) {
  process.stdout.write(`\n→ ${title}\n`);
  try {
    fn();
    process.stdout.write(`✓ ${title}\n`);
  } catch (err) {
    failures += 1;
    process.stdout.write(`✗ ${title}\n  ${err.message}\n`);
  }
}

function run(args, opts = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd: opts.cwd || process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  if (r.status !== (opts.expectExit ?? 0)) {
    throw new Error(
      `exit ${r.status} (expected ${opts.expectExit ?? 0})\n` +
        `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
    );
  }
  return r;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ---------- Setup fixture ----------
const fixture = mkdtempSync(path.join(tmpdir(), 'saek-ci-fixture-'));
process.stdout.write(`fixture: ${fixture}\n`);

writeFileSync(
  path.join(fixture, 'package.json'),
  JSON.stringify(
    {
      name: 'saek-ci-fixture',
      version: '0.0.1',
      scripts: { dev: 'vite' },
      devDependencies: { vite: '^5.0.0', react: '^18.0.0' },
    },
    null,
    2,
  ),
);

// ---------- Smoke ----------
step('1. dry-run 走全流程', () => {
  const r = run(['init', '--yes', '--dry-run', '--skip-browsers'], { cwd: fixture });
  assert(/init 完成/.test(r.stdout), 'output 缺少 "init 完成"');
  assert(/baseURL≈http:\/\/localhost:5173/.test(r.stdout), '没探测到 vite=5173');
  assert(/framework=react/.test(r.stdout), '没探测到 react');
});

step('2. --only=docs 真建 5 文件', () => {
  run(['init', '--yes', '--skip-browsers', '--only=docs'], { cwd: fixture });
  const files = readdirSync(path.join(fixture, 'docs', 'e2e'));
  assert(files.length === 5, `期望 5 个 md，实际 ${files.length}：${files.join(',')}`);
  ['README.md', 'auth.md', 'flows.md', 'selectors.md', 'i18n.md'].forEach((f) => {
    assert(files.includes(f), `缺少 ${f}`);
  });
});

step('3. --only=config 真建 playwright.config.js（baseURL=5173）', () => {
  run(['init', '--yes', '--skip-browsers', '--only=config'], { cwd: fixture });
  const cfg = path.join(fixture, 'playwright.config.js');
  assert(existsSync(cfg), 'playwright.config.js 未创建');
  const content = readFileSync(cfg, 'utf8');
  assert(/http:\/\/localhost:5173/.test(content), 'baseURL 不是 5173（vite 默认）');
  assert(/__BASE_URL__/.test(content) === false, '占位符未替换');
  assert(/__TEST_DIR__/.test(content) === false, '占位符未替换');
});

step('4. --only=scripts 真注入 npm scripts', () => {
  run(['init', '--yes', '--skip-browsers', '--only=scripts'], { cwd: fixture });
  const pkg = JSON.parse(readFileSync(path.join(fixture, 'package.json'), 'utf8'));
  ['e2e', 'e2e:ui', 'e2e:headed', 'e2e:report'].forEach((s) => {
    assert(pkg.scripts && pkg.scripts[s], `package.json 缺 scripts.${s}`);
  });
});

step('5. 幂等性 — 重跑应全跳过', () => {
  const r = run(['init', '--yes', '--skip-browsers', '--skip-skill'], { cwd: fixture });
  assert(
    /已存在|无需修改|已就绪|已生成|已有配置/.test(r.stdout),
    '重跑应有"跳过"或"无需修改"字样',
  );
});

step('6. doctor 在该 fixture 跑通（缺包不算失败）', () => {
  // doctor 缺包会 exit 1，这里用 expectExit:1 是合法的
  // 但已经经过 smoke 5 后 config/docs/scripts 都齐了，剩下只是缺 PW/kit
  const r = spawnSync(process.execPath, [CLI, 'doctor'], {
    cwd: fixture,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  // 0 (全绿) 或 1 (有缺失但不致命) 都接受；2 才是致命
  assert(r.status === 0 || r.status === 1, `doctor 致命退出（exit ${r.status}）`);
  assert(/项目根/.test(r.stdout), 'doctor 未识别项目根');
});

// ---------- Cleanup ----------
try {
  rmSync(fixture, { recursive: true, force: true });
} catch (_e) {
  /* ignore */
}

if (failures > 0) {
  process.stdout.write(`\n✗ ${failures} 个 smoke 步骤失败\n`);
  process.exit(1);
}
process.stdout.write('\n✓ 所有 smoke 步骤通过\n');
