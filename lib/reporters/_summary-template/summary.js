/* === Quantified Summary · 渲染层（原生 JS，零依赖框架） === */
/* 🅵 方案：右侧详情区按数据语义分 tab — 业务/截图/错误/信号/Trace */
(function () {
  'use strict';

  // ─── 1. 取数 ───
  const dataEl = document.getElementById('quantified-data');
  let DATA = { title: '', runStamp: '', generatedAt: '', cases: [], pwReportRel: 'index.html' };
  try {
    DATA = JSON.parse(dataEl.textContent || dataEl.innerText || '{}');
  } catch (e) {
    console.error('quantified-data parse failed', e);
  }

  // marked 是否可用
  const hasMarked = typeof window.marked !== 'undefined' && typeof window.marked.parse === 'function';
  if (hasMarked) {
    try {
      window.marked.setOptions({ gfm: true, breaks: false });
    } catch (_e) { /* noop */ }
  }

  // ─── 2. 顶部 meta 渲染 ───
  document.getElementById('runstamp').textContent = DATA.runStamp ? `runStamp: ${DATA.runStamp}` : '';
  if (DATA.generatedAt) {
    document.getElementById('generated-at').textContent = `生成于 ${formatTime(DATA.generatedAt)}`;
  }
  // 链接到 PW 原生报告（trace viewer 入口）
  const linkPw = document.getElementById('link-pw-report');
  if (linkPw && DATA.pwReportRel) linkPw.setAttribute('href', DATA.pwReportRel);

  // ─── 3. 用例树渲染 ───
  const sidebar = document.getElementById('sidebar');
  const detail = document.getElementById('detail');
  const state = {
    filter: 'all',
    keyword: '',
    activeCaseIdx: -1,
    activeStepIdx: -1,
    activeTab: 'detail', // detail | shots | errors | signals | trace
  };

  function buildSidebar() {
    sidebar.innerHTML = '';
    if (!DATA.cases || !DATA.cases.length) {
      sidebar.innerHTML = '<div class="sidebar-empty">没有可显示的 case</div>';
      return;
    }
    DATA.cases.forEach((entry, ci) => {
      const p = entry.payload || {};
      const steps = filterSteps(p.steps || []);
      if (!steps.length && (state.filter !== 'all' || state.keyword)) return;

      const group = document.createElement('div');
      group.className = 'case-group';
      group.dataset.caseIdx = ci;

      const header = document.createElement('div');
      header.className = 'case-header';
      header.innerHTML = `
        <span class="case-toggle">▼</span>
        <span class="case-id">${escapeHtml(p.caseId || '')}</span>
        <span class="case-title">${escapeHtml(p.title || '')}</span>
        <span class="case-result ${escapeHtml(p.result || 'pass')}">${escapeHtml((p.result || 'pass').toUpperCase())}</span>
      `;
      header.addEventListener('click', () => {
        group.classList.toggle('collapsed');
      });
      group.appendChild(header);

      const stepList = document.createElement('div');
      stepList.className = 'case-steps';
      steps.forEach((s) => {
        const realIdx = (p.steps || []).indexOf(s);
        const item = document.createElement('div');
        item.className = 'step-item';
        item.dataset.caseIdx = ci;
        item.dataset.stepIdx = realIdx;
        const icon = s.status === 'pass' ? '✓' : s.status === 'fail' ? '✕' : '○';

        // 旁标小徽章：截图数 / 错误 / 信号 — 让用户一眼看到该 step 哪个 tab 有料
        const stepShots = countStepShots(p, s.id);
        const stepSignals = countStepSignals(p, s);
        const badges = [
          stepShots ? `<span class="step-badge badge-shots" title="截图 ${stepShots}">📷${stepShots}</span>` : '',
          s.status === 'fail' ? `<span class="step-badge badge-err" title="错误">⚠️</span>` : '',
          stepSignals ? `<span class="step-badge badge-signals" title="信号 ${stepSignals}">📋${stepSignals}</span>` : '',
        ].filter(Boolean).join('');

        item.innerHTML = `
          <span class="step-icon ${escapeHtml(s.status || 'pass')}">${icon}</span>
          <span class="step-id">${escapeHtml(s.id || '')}</span>
          <span class="step-title">${escapeHtml(deriveStepShortTitle(s, p))}</span>
          <span class="step-badges">${badges}</span>
          <span class="step-duration">${formatDuration(s.durationMs || 0)}</span>
        `;
        item.addEventListener('click', () => selectStep(ci, realIdx));
        stepList.appendChild(item);
      });
      group.appendChild(stepList);
      sidebar.appendChild(group);
    });
  }

  function filterSteps(steps) {
    return steps.filter((s) => {
      if (state.filter !== 'all' && s.status !== state.filter) return false;
      if (state.keyword) {
        const k = state.keyword.toLowerCase();
        const hay = `${s.id || ''} ${s.action || ''} ${s.expected || ''} ${s.actual || ''}`.toLowerCase();
        if (!hay.includes(k)) return false;
      }
      return true;
    });
  }

  function deriveStepShortTitle(step, payload) {
    if (step.action) return step.action;
    if (step.expected) return step.expected;
    return payload.title || '(无描述)';
  }

  // ─── 4. 详情渲染 · tab 化 ───
  function selectStep(ci, si) {
    state.activeCaseIdx = ci;
    state.activeStepIdx = si;

    document.querySelectorAll('.step-item').forEach((el) => el.classList.remove('active'));
    const target = document.querySelector(`.step-item[data-case-idx="${ci}"][data-step-idx="${si}"]`);
    if (target) target.classList.add('active');

    renderDetail();
  }

  function renderDetail() {
    const ci = state.activeCaseIdx;
    const si = state.activeStepIdx;
    if (ci < 0 || si < 0) {
      detail.innerHTML = '<div class="detail-empty"><p>👈 从左侧选择一个 step 查看详情</p></div>';
      return;
    }
    const entry = DATA.cases[ci];
    const p = entry.payload || {};
    const s = (p.steps || [])[si];
    if (!s) {
      detail.innerHTML = '<div class="detail-empty">未找到 step 数据</div>';
      return;
    }

    const stepShots = collectStepShots(p, s.id);
    const stepSignals = collectStepSignals(p, s);
    const hasError = s.status === 'fail' || (stepSignals.pageErrors.length > 0);
    const pwAtt = (p.pwAttachments || []);
    const pwTrace = pwAtt.find((a) => a.category === 'trace');
    const pwVideo = pwAtt.find((a) => a.category === 'video');
    const pwFailedShots = pwAtt.filter((a) => a.category === 'failedShot');

    // tab 列表 — 数字角标显示对应内容数量
    const tabs = [
      { key: 'detail', icon: '📝', label: '业务详情', count: s.detail ? 1 : 0 },
      { key: 'shots', icon: '📷', label: '截图', count: stepShots.success.length + stepShots.error.length + pwFailedShots.length },
      { key: 'errors', icon: '⚠️', label: '错误', count: hasError ? (1 + stepSignals.pageErrors.length) : 0 },
      { key: 'signals', icon: '📋', label: '运行期信号', count: stepSignals.consoleEvents.length + stepSignals.networkFailures.length },
      { key: 'trace', icon: '📦', label: 'Trace & PW', count: (pwTrace ? 1 : 0) + (pwVideo ? 1 : 0) },
    ];

    // 校验当前 activeTab 是否还有料；没有就回退到 detail
    if (!tabs.find((t) => t.key === state.activeTab)) state.activeTab = 'detail';

    const breadcrumb = `
      <div class="detail-breadcrumb">
        <span>${escapeHtml(entry.scene)}</span>
        <span class="arrow">›</span>
        <span>${escapeHtml(p.caseId)}</span>
        <span class="arrow">›</span>
        <span>${escapeHtml(s.id || '')}</span>
        <span class="step-status-pill ${escapeHtml(s.status || 'pass')}">${escapeHtml((s.status || 'pass').toUpperCase())}</span>
      </div>`;

    const tabBar = `
      <div class="tab-bar">
        ${tabs.map((t) => `
          <button class="tab-btn ${state.activeTab === t.key ? 'active' : ''} ${t.count === 0 ? 'empty' : ''}"
                  data-tab="${t.key}">
            <span class="tab-icon">${t.icon}</span>
            <span class="tab-label">${t.label}</span>
            ${t.count > 0 ? `<span class="tab-count">${t.count}</span>` : ''}
          </button>
        `).join('')}
      </div>`;

    let body = '';
    switch (state.activeTab) {
      case 'detail':
        body = renderDetailTab(s, p);
        break;
      case 'shots':
        body = renderShotsTab(stepShots, pwFailedShots);
        break;
      case 'errors':
        body = renderErrorsTab(s, stepSignals.pageErrors);
        break;
      case 'signals':
        body = renderSignalsTab(stepSignals);
        break;
      case 'trace':
        body = renderTraceTab(pwTrace, pwVideo, p);
        break;
      default:
        body = '';
    }

    detail.innerHTML = breadcrumb + tabBar + `<div class="tab-panel">${body}</div>`;
    detail.scrollTop = 0;

    // 绑定 tab 点击
    detail.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeTab = btn.dataset.tab;
        renderDetail();
      });
    });

    // 绑定"复制命令"按钮
    detail.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const text = btn.dataset.copy;
        copyToClipboard(text, btn);
      });
    });
  }

  // ─── tab 内容渲染 ───

  function renderDetailTab(s, p) {
    if (s.detail && hasMarked) {
      try {
        return window.marked.parse(s.detail);
      } catch (e) {
        return `<pre>${escapeHtml(s.detail)}</pre>`;
      }
    }
    if (s.detail) return `<pre>${escapeHtml(s.detail)}</pre>`;
    // 没 detail 时用 expected/actual 拼最小详情
    return `
      <h2>${escapeHtml(s.id || '')} · ${escapeHtml(deriveStepShortTitle(s, p))}</h2>
      <table>
        <tr><th>状态</th><td>${escapeHtml(s.status || '')}</td></tr>
        <tr><th>动作</th><td>${escapeHtml(s.action || '—')}</td></tr>
        <tr><th>选择器</th><td><code>${escapeHtml(s.selector || '—')}</code></td></tr>
        <tr><th>预期</th><td>${escapeHtml(s.expected || '—')}</td></tr>
        <tr><th>实际</th><td>${escapeHtml(s.actual || '—')}</td></tr>
        <tr><th>耗时</th><td>${escapeHtml(String(s.durationMs || 0))}ms</td></tr>
      </table>
      <p class="muted"><em>该 step 没有 markdown 详情（可能是 blueprintLookup 未注入或 renderStepDetail 异常）。</em></p>
    `;
  }

  function renderShotsTab(stepShots, pwFailedShots) {
    const blocks = [];

    if (stepShots.success.length) {
      blocks.push(renderShotGroup('✅ 关键路径截图', stepShots.success, 'success'));
    }
    if (stepShots.error.length) {
      blocks.push(renderShotGroup('❌ 失败现场（reporter）', stepShots.error, 'error'));
    }
    if (pwFailedShots.length) {
      const items = pwFailedShots.map((a) => ({
        file: a.path,
        intent: a.name || 'PW 自动失败截图',
        captionExtra: 'Playwright 框架自动捕获',
      }));
      blocks.push(renderShotGroup('❌ 失败现场（PW 自动）', items, 'error'));
    }

    if (!blocks.length) {
      return '<p class="empty-tip">该 step 没有关联截图。</p>';
    }
    return blocks.join('');
  }

  function renderShotGroup(title, items, kind) {
    return `
      <h3 class="shot-group-title">${escapeHtml(title)} <span class="shot-count">(${items.length})</span></h3>
      <div class="shot-grid">
        ${items.map((it) => `
          <figure class="shot-card ${escapeHtml(kind)}">
            <a href="${escapeHtml(it.file)}" target="_blank" rel="noopener">
              <img loading="lazy" src="${escapeHtml(it.file)}"
                   alt="${escapeHtml(it.intent || '')}"
                   onerror="this.classList.add('broken'); this.alt='⚠ 无法加载: ${escapeHtml(it.file)}';" />
            </a>
            <figcaption>
              <div class="shot-intent">${escapeHtml(it.intent || '—')}</div>
              ${it.captionExtra ? `<div class="shot-extra">${escapeHtml(it.captionExtra)}</div>` : ''}
              ${it.phaseCode ? `<div class="shot-phase">${escapeHtml(it.phaseCode)} · ${escapeHtml(it.phaseName || '')}</div>` : ''}
            </figcaption>
          </figure>
        `).join('')}
      </div>
    `;
  }

  function renderErrorsTab(s, pageErrorsInWindow) {
    const blocks = [];

    if (s.status === 'fail') {
      blocks.push(`
        <h3>❌ 业务断言失败</h3>
        <table class="kv-table">
          <tr><th>选择器</th><td><code>${escapeHtml(s.selector || '—')}</code></td></tr>
          <tr><th>预期</th><td>${escapeHtml(s.expected || '—')}</td></tr>
          <tr><th>实际</th><td class="actual-fail">${escapeHtml(s.actual || '—')}</td></tr>
        </table>
      `);
    }

    if (pageErrorsInWindow.length) {
      blocks.push(`
        <h3>🐛 时间窗口内的页面 JS 异常 (${pageErrorsInWindow.length})</h3>
        ${pageErrorsInWindow.map((e, i) => `
          <details class="err-card" ${i === 0 ? 'open' : ''}>
            <summary>#${i + 1} ${escapeHtml(e.message || '')}</summary>
            <pre>${escapeHtml((e.stack || '').slice(0, 1500))}</pre>
          </details>
        `).join('')}
      `);
    }

    if (!blocks.length) {
      return '<p class="empty-tip">该 step 通过且时间窗口内未捕获页面 JS 异常。</p>';
    }
    return blocks.join('');
  }

  function renderSignalsTab(sig) {
    const blocks = [];

    blocks.push(`
      <h3>📋 Console 错误/警告 (${sig.consoleEvents.length})</h3>
      ${sig.consoleEvents.length ? `
        <table class="signal-table">
          <thead><tr><th>#</th><th>type</th><th>text</th><th>location</th></tr></thead>
          <tbody>
            ${sig.consoleEvents.map((c, i) => `
              <tr class="sig-${escapeHtml(c.type || 'log')}">
                <td>${i + 1}</td>
                <td><span class="sig-pill ${escapeHtml(c.type || 'log')}">${escapeHtml(c.type || '')}</span></td>
                <td><code>${escapeHtml((c.text || '').slice(0, 300))}</code></td>
                <td class="muted">${escapeHtml(c.location || '')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<p class="empty-tip">时间窗口内无 console 错误/警告。</p>'}
    `);

    blocks.push(`
      <h3>🌐 网络请求失败 (${sig.networkFailures.length})</h3>
      ${sig.networkFailures.length ? `
        <table class="signal-table">
          <thead><tr><th>#</th><th>method</th><th>url</th><th>failure</th></tr></thead>
          <tbody>
            ${sig.networkFailures.map((n, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${escapeHtml(n.method || '')}</td>
                <td><code>${escapeHtml((n.url || '').slice(0, 300))}</code></td>
                <td class="muted">${escapeHtml(n.failure || '')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<p class="empty-tip">时间窗口内无 requestfailed。</p>'}
    `);

    return blocks.join('');
  }

  function renderTraceTab(pwTrace, pwVideo, p) {
    const blocks = [];

    blocks.push(`
      <h3>📦 Playwright Trace</h3>
      ${pwTrace ? `
        <p>该用例失败时 Playwright 自动留存了 trace，可用以下任一方式查看：</p>
        <div class="trace-actions">
          <a class="btn-primary" href="${escapeHtml(DATA.pwReportRel || 'index.html')}" target="_blank" rel="noopener">
            🚀 打开 Playwright 原生报告（含 trace viewer）
          </a>
          <button class="btn-secondary" data-copy="npx playwright show-trace ${escapeAttr(pwTrace.originalPath || pwTrace.path)}">
            📋 复制 trace viewer 命令
          </button>
          ${pwTrace.path && pwTrace.path !== pwTrace.originalPath ? `
            <a class="btn-secondary" href="${escapeHtml(pwTrace.path)}" download
               title="下载本地副本（位于 _assets/，可便携传输）">
              💾 下载 trace.zip
            </a>
          ` : ''}
        </div>
        <div class="trace-meta">
          <div class="muted">PW 原始路径：</div>
          <code>${escapeHtml(pwTrace.originalPath || pwTrace.path)}</code>
        </div>
      ` : `
        <p class="empty-tip">该用例未产出 trace（仅在失败时自动留存；当前配置 <code>trace: 'retain-on-failure'</code>）。</p>
        <p class="muted">
          想强制每次都留 trace？把 <code>playwright.config.js</code> 的
          <code>use.trace</code> 改成 <code>'on'</code>。
        </p>
      `}
    `);

    if (pwVideo) {
      blocks.push(`
        <h3>🎬 视频回放</h3>
        <video controls preload="metadata" src="${escapeHtml(pwVideo.path)}"
               class="trace-video"></video>
      `);
    }

    blocks.push(`
      <h3>🔗 同目录原生 PW 报告</h3>
      <p>当前 quantified-summary 与 PW 增强版报告 <strong>同目录</strong>，可随时切换：</p>
      <div class="trace-actions">
        <a class="btn-secondary" href="${escapeHtml(DATA.pwReportRel || 'index.html')}" target="_blank" rel="noopener">
          ← 切到 Playwright 原生报告
        </a>
      </div>
    `);

    return blocks.join('');
  }

  // ─── 5. 过滤栏 ───
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.filter = btn.dataset.filter;
      buildSidebar();
    });
  });
  const searchEl = document.getElementById('search');
  if (searchEl) {
    searchEl.addEventListener('input', (e) => {
      state.keyword = e.target.value.trim();
      buildSidebar();
    });
  }

  // ─── 6. helpers ───

  function countStepShots(payload, stepId) {
    const idx = (payload && payload.shotsByStep) || {};
    return (idx[stepId] || []).length;
  }

  function collectStepShots(payload, stepId) {
    const idx = (payload && payload.shotsByStep) || {};
    const arr = idx[stepId] || [];
    return {
      success: arr.filter((it) => it.kind === 'success'),
      error: arr.filter((it) => it.kind === 'error'),
    };
  }

  function countStepSignals(payload, step) {
    const sig = collectStepSignals(payload, step);
    return sig.consoleEvents.length + sig.networkFailures.length + sig.pageErrors.length;
  }

  /**
   * 按 step 时间窗口（startTs ± 200ms 缓冲）从 case 级 console/network/pageError 数组中切片。
   * 没时间戳时（旧数据）整体不归属任何 step，避免误归。
   */
  function collectStepSignals(payload, step) {
    const empty = { consoleEvents: [], networkFailures: [], pageErrors: [] };
    if (!payload || !step) return empty;
    const start = Number(step.startTs) || 0;
    const end = Number(step.endTs) || 0;
    if (!start || !end) return empty;
    const PAD = 200; // ms 缓冲，捕获 step 边界附近触发的异步事件
    const lo = start - PAD;
    const hi = end + PAD;
    const inWindow = (ts) => {
      const t = Number(ts);
      return t && t >= lo && t <= hi;
    };
    return {
      consoleEvents: (payload.consoleEvents || []).filter((e) => inWindow(e.ts)),
      networkFailures: (payload.networkFailures || []).filter((e) => inWindow(e.ts)),
      pageErrors: (payload.pageErrors || []).filter((e) => inWindow(e.ts)),
    };
  }

  function copyToClipboard(text, btn) {
    const orig = btn.textContent;
    const done = () => {
      btn.textContent = '✅ 已复制';
      setTimeout(() => { btn.textContent = orig; }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => fallback(text, done));
    } else {
      fallback(text, done);
    }
  }
  function fallback(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (_e) { /* noop */ }
    document.body.removeChild(ta);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }
  function formatDuration(ms) {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }
  function formatTime(iso) {
    try {
      const d = new Date(iso);
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    } catch (_e) { return iso; }
  }

  // 启动
  buildSidebar();

  // 自动选中第一个 case 的第一个 step
  if (DATA.cases && DATA.cases.length && (DATA.cases[0].payload || {}).steps && DATA.cases[0].payload.steps.length) {
    selectStep(0, 0);
  }
})();
