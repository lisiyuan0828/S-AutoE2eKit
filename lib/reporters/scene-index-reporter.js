/**
 * 场景索引报告（场景无关 · 工厂资产）
 *
 * 用途：
 *   把同一场景下所有用例的 JSON 原始数据聚合，生成一份"场景执行总览"。
 *   通常在 globalTeardown 或 afterAll 中调用一次。
 *
 * 输出：<projectRoot>/docs/qa-reports/<runStamp>/<sceneName>/index-<date>.md
 *
 * 内容：
 *   - 用例池总览（数量、按优先级分布、总耗时）
 *   - Pass / Warn / Fail 分布饼图（Mermaid）
 *   - 每条用例的快速链接（点开进入详情报告）
 *   - 失败用例的 errors 摘要
 *
 * 业务无关：
 *   - 所有路径基于调用方传入的 projectRoot，本身不假设任何项目结构
 *   - 不引用任何企点专属命名 / 域名 / key
 */

const fs = require('fs');
const path = require('path');
const { getRunStamp } = require('../utils/run-context');

/**
 * @param {object} opts
 * @param {string} opts.projectRoot 项目根（必填）
 * @param {string} opts.sceneName   场景名（必填，决定输出子目录）
 */
function buildSceneIndex(opts) {
  const { projectRoot, sceneName } = opts;
  const { stamp: runStamp } = getRunStamp({ projectRoot });
  const testResultsDir = path.join(projectRoot, 'test-results', runStamp, sceneName);
  const qaReportsDir = path.join(projectRoot, 'docs/qa-reports', runStamp, sceneName);

  if (!fs.existsSync(testResultsDir)) {
    return { ok: false, reason: 'no-results' };
  }

  const jsonFiles = fs
    .readdirSync(testResultsDir)
    .filter((f) => f.endsWith('.json') && f.startsWith('TC-'));

  if (jsonFiles.length === 0) {
    return { ok: false, reason: 'no-json' };
  }

  const cases = jsonFiles.map((f) => {
    try {
      const raw = fs.readFileSync(path.join(testResultsDir, f), 'utf-8');
      return JSON.parse(raw);
    } catch (_e) {
      return null;
    }
  }).filter(Boolean);

  const total = cases.length;
  const passCount = cases.filter((c) => c.result === 'pass').length;
  const warnCount = cases.filter((c) => c.result === 'warn').length;
  const failCount = cases.filter((c) => c.result === 'fail').length;
  const totalMs = cases.reduce((sum, c) => sum + (c.totalMs || 0), 0);

  const byPriority = { P0: [], P1: [], P2: [] };
  cases.forEach((c) => {
    const prio = c.priority || 'P2';
    if (!byPriority[prio]) byPriority[prio] = [];
    byPriority[prio].push(c);
  });

  const date = new Date().toISOString().slice(0, 10);
  const md = renderIndex({
    sceneName,
    runStamp,
    date,
    total,
    passCount,
    warnCount,
    failCount,
    totalMs,
    byPriority,
    cases,
  });

  fs.mkdirSync(qaReportsDir, { recursive: true });
  const mdPath = path.join(qaReportsDir, `index-${date}.md`);
  fs.writeFileSync(mdPath, md, 'utf-8');

  return { ok: true, mdPath, total, passCount, warnCount, failCount };
}

function renderIndex(ctx) {
  const { sceneName, runStamp, date, total, passCount, warnCount, failCount, totalMs, byPriority, cases } = ctx;
  const passRate = total ? Math.round((passCount / total) * 100) : 0;

  const overallIcon = failCount > 0 ? '❌' : warnCount > 0 ? '⚠️' : '✅';

  const renderPrioBlock = (prio) => {
    const list = byPriority[prio] || [];
    if (list.length === 0) return `_（本次未运行 ${prio} 用例）_`;
    return list
      .map((c) => {
        const icon = c.result === 'pass' ? '✅' : c.result === 'warn' ? '⚠️' : '❌';
        const detailLink = `./${c.caseId}-${c.finishedAt.slice(0, 10)}.md`;
        return `- ${icon} [${c.caseId}](${detailLink}) — ${c.title}（${c.totalMs}ms）`;
      })
      .join('\n');
  };

  const errorBlock = (() => {
    const fails = cases.filter((c) => c.result === 'fail');
    if (fails.length === 0) return '✅ 本次执行无失败用例。';
    return fails
      .map(
        (c) =>
          `### ❌ ${c.caseId}\n${(c.errors || []).map((e) => `- ${e}`).join('\n') || '_(无具体 error message)_'}`,
      )
      .join('\n\n');
  })();

  return `# ${sceneName} 场景测试总览（${date}）

> 生成时间：${new Date().toISOString()}
> 场景：\`${sceneName}\`
> 用例总数：${total}
> 总耗时：${totalMs} ms
> **执行结果：${overallIcon} ${failCount > 0 ? 'Fail' : warnCount > 0 ? 'Warn' : 'Pass'}**

---

## 📊 执行指标

| 指标 | 值 |
| --- | --- |
| 用例总数 | ${total} |
| ✅ 通过 | ${passCount}（${passRate}%）|
| ⚠️ 警告 | ${warnCount} |
| ❌ 失败 | ${failCount} |
| 总耗时 | ${totalMs} ms |
| 平均耗时 | ${total ? Math.round(totalMs / total) : 0} ms |

\`\`\`mermaid
pie title 用例结果分布
    "Pass" : ${passCount}
    "Warn" : ${warnCount}
    "Fail" : ${failCount}
\`\`\`

---

## 🎯 用例清单（按优先级）

### 🔴 P0 必测

${renderPrioBlock('P0')}

### 🟠 P1 应测

${renderPrioBlock('P1')}

### 🟡 P2 选测

${renderPrioBlock('P2')}

---

## ❗ 失败诊断

${errorBlock}

---

## 📎 附录

- 测试矩阵：\`docs/e2e/${sceneName}/02-test-matrix.md\`
- 调研报告：\`docs/e2e/${sceneName}/01-scope-report.md\`
- 原始 JSON 目录：\`test-results/${runStamp}/${sceneName}/\`
- Playwright HTML 报告：\`npx playwright show-report\`
`;
}

module.exports = { buildSceneIndex };
