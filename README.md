# s-auto-e2e-kit

> A drop-in **Playwright E2E factory toolkit**: scene-agnostic reporters, cross-repo utils, and a quantified HTML report — installed once, reused across any Playwright-based repository.

[English](./README.md) · [简体中文](./README.zh.md)

[![npm](https://img.shields.io/npm/v/s-auto-e2e-kit.svg)](https://www.npmjs.com/package/s-auto-e2e-kit)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](#license)
[![Node](https://img.shields.io/badge/node-%E2%89%A514-brightgreen.svg)](#requirements)
[![Playwright](https://img.shields.io/badge/playwright-%E2%89%A51.55%20%3C2-blueviolet.svg)](#requirements)

---

## Table of contents

- [Why s-auto-e2e-kit](#why-s-auto-e2e-kit)
- [Feature matrix](#feature-matrix)
- [Quick start](#quick-start)
- [API reference](#api-reference)
  - [Reporters](#reporters)
  - [Utils](#utils)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Building from source](#building-from-source)
- [Design tenets — the "5 iron rules"](#design-tenets--the-5-iron-rules)
- [FAQ](#faq)
- [Versioning](#versioning)
- [License](#license)

---

## Why s-auto-e2e-kit

Every team that runs Playwright end-to-end tests at scale ends up rewriting the same plumbing: stitch together a quantified Markdown/JSON report, write yet another wait-strategy module (visible / text / count / response / nav / event), reinvent persistence helpers (cookies / localStorage / event buffers), build a network-mock primitive, and finally bolt a custom HTML report on top of Playwright's built-in one. **s-auto-e2e-kit** distills all of that into a single npm package that delivers:

1. **Three reporters** — `quantified` (Markdown + JSON), `sceneIndex` (multi-scene aggregator), `html` (Playwright HtmlReporter ++ business JSON attachment), `quantifiedSummary` (self-contained HTML with tabbed details).
2. **Six utils** — `wait`, `persistence`, `mocks`, `eventCapture`, `visibleText`, `runContext`.
3. **One contract** — every reporter / util is **scene-agnostic**: zero project-specific domains, cookie keys, API paths, or step blueprints baked in. Business specifics are injected by the caller.

**Design tenets**

- **Physical isolation.** No webpack aliases, no `@/` paths, no host-repo directory assumptions. The package is pure CommonJS that works in any Node ≥ 14 environment.
- **Zero project hard-coding.** Project name, output paths, domain names, cookie keys, API mock rules — every business specific is passed in via reporter `options` or util arguments.
- **Self-contained.** Dependencies live only in this package's own `package.json`. We do not "borrow" the host repo's `node_modules`.
- **Derived assets stay out of git.** The (legacy) `vendor/` path was Phase-4 plan A; the shipped solution (Phase 4 Plan F) extends Playwright's official `HtmlReporter` directly via the public `playwright/lib/runner` exports — no vendoring, no fragile path hacks.
- **Install path == post-publish path.** Consumers always `require('s-auto-e2e-kit')`, whether linked locally via `file:` protocol or installed from npm. Zero call-site changes when you flip from local to published.

## Feature matrix

| Capability | Surface | Scene-agnostic |
|---|---|---|
| Quantified Markdown + JSON report (per test case) | `reporters.quantified` | ✅ — step blueprint dictionary injected via `opts.blueprintLookup` |
| Multi-scene index aggregator | `reporters.sceneIndex` | ✅ |
| Enhanced Playwright HTML report (business JSON auto-attached) | `reporters.html` | ✅ — extends official `HtmlReporter` from `playwright/lib/runner` |
| Self-contained Quantified Summary HTML (5-tab details) | `reporters.quantifiedSummary` | ✅ |
| Six wait strategies (VIS / TXT / CNT / RES / NAV / EVT) | `utils.wait` | ✅ |
| Persistence read/write (localStorage / sessionStorage / cookie / window / event buffer) | `utils.persistence` | ✅ — channel list provided by caller |
| Network mock primitives (`mockJson` / `applyMockRules` / `silenceStaticResources`) | `utils.mocks` | ✅ — rule list provided by caller |
| Event capture (reload-safe via localStorage) | `utils.eventCapture` | ✅ — event name & storage key are constructor args |
| Visible text harvesting + translation classification | `utils.visibleText` | ✅ |
| Run context (`YYYYMMDD_<branch>` stamp + project root resolver) | `utils.runContext` | ✅ |

## Quick start

### Install

```bash
npm i -D s-auto-e2e-kit
# or: pnpm add -D s-auto-e2e-kit
# or: yarn add -D s-auto-e2e-kit
```

Peer dep: `@playwright/test >=1.55.0 <2.0.0`. Node ≥ 14 (Node ≥ 18 recommended for the enhanced HTML reporter, which loads `playwright/lib/runner`).

### Wire reporters

```js
// playwright.config.js
const { reporters } = require('s-auto-e2e-kit');

module.exports = {
  reporter: [
    ['list'],

    // Enhanced HTML report — extends Playwright's built-in HtmlReporter,
    // auto-attaches the per-test quantified.json as a downloadable attachment.
    reporters.html.resolveHtmlReporter({
      outputFolder: 'playwright-report-enhanced',
      open: 'never',
      title: 'My Project E2E',
      attachQuantifiedJson: true,
      resultsRoot: 'test-results',
    }),

    // Self-contained tabbed-detail HTML summary (5 tabs: detail / shots / errors / signals / trace).
    reporters.quantifiedSummary.resolve({
      outputFile: 'playwright-report-enhanced/<runStamp>/quantified-summary.html',
      testResultsDir: 'test-results/<runStamp>',
      title: 'My Project E2E — Quantified',
    }),
  ],
};
```

### Drive the quantified reporter from a spec

```js
const { test, expect } = require('@playwright/test');
const { reporters, utils } = require('s-auto-e2e-kit');

test('TC-LOGIN-P0-01 · happy path', async ({ page }) => {
  const reporter = new reporters.quantified.QuantifiedReporter({
    sceneName: 'login',
    caseId: 'TC-LOGIN-P0-01',
    title: 'Login happy path',
    priority: 'P0',
    projectRoot: process.cwd(),
    // blueprintLookup is OPTIONAL — omit it to enter "no-blueprint degraded mode".
    // Inject your own dictionary to get phase grouping, semantic step titles,
    // failure handbook, etc. — all business-specific, all caller-owned.
  });

  await reporter.runStep('open-page', async () => {
    await page.goto('https://example.com/login');
    await utils.wait.waitVisible(page, '#login-form');
  });

  // ... more steps ...

  await reporter.finalize();
});
```

### Use utils standalone

```js
const { utils } = require('s-auto-e2e-kit');

// 6 wait strategies
await utils.wait.waitVisible(page, '#hero');
await utils.wait.waitText(page, '#switcher', 'English');

// Network mocks (caller supplies the rule list)
await utils.mocks.applyMockRules(page, [
  { url: /\/api\/user$/, body: { id: 1, name: 'alice' } },
]);
await utils.mocks.silenceStaticResources(page, ['cdn.example.com']);

// Persistence (caller declares the channels they care about)
const snapshot = await utils.persistence.readPersistence(page, {
  localStorage: ['app:locale', 'app:theme'],
  cookie: ['session_id'],
});

// Run stamp: YYYYMMDD_<gitBranch> for foldering test artifacts
const { stamp } = utils.runContext.getRunStamp({ projectRoot: process.cwd() });
```

## API reference

### Reporters

#### `reporters.quantified`

```ts
new QuantifiedReporter(opts: {
  sceneName: string;          // e.g. 'login' — decides output folder
  caseId: string;             // e.g. 'TC-LOGIN-P0-01'
  title: string;
  priority: 'P0' | 'P1' | 'P2';
  dimensions?: string[];      // coverage tags, e.g. ['F2', 'P1-P5']
  entryUrl?: string;
  projectRoot: string;
  blueprintLookup?: BlueprintLookup;  // optional — caller-injected business dictionary
});
```

Outputs:

- `docs/qa-reports/<runStamp>/<scene>/<caseId>.md` — human-readable Markdown
- `test-results/<runStamp>/<scene>/<caseId>.json` — machine-readable JSON (`shotIndex`, `shotsByStep`, persistence snapshots, console / pageError / network-failure timelines)

When `blueprintLookup` is omitted the reporter degrades gracefully: data capture and base rendering still work, but you lose phase grouping / semantic step titles / failure handbooks. **Business-specific blueprints stay in the consuming repo** — never inside this package.

#### `reporters.sceneIndex`

```ts
buildSceneIndex(opts: { projectRoot: string; runStamp?: string }): Promise<void>
```

Walks `docs/qa-reports/<runStamp>/*` and writes a top-level `INDEX.md` linking every scene's reports together.

#### `reporters.html`

```ts
reporters.html.resolveHtmlReporter(opts: {
  outputFolder?: string;          // default: 'playwright-report-enhanced'
  open?: 'always' | 'never' | 'on-failure';
  title?: string;
  attachQuantifiedJson?: boolean; // default: true
  resultsRoot?: string;           // default: 'test-results'
}): [bridgePath: string, opts: object]
```

Returns a Playwright reporter array entry. Internally extends the official `HtmlReporter` exposed via `require('playwright/lib/runner').html` (Playwright ≥ 1.60). On environments where that path is unavailable, the bridge degrades to a no-op placeholder that warns once instead of crashing.

Also exposed: `bridgePath`, `createEnhancedHtmlReporter(BaseHtmlReporter)`, `tryLoadPlaywrightHtml()` for advanced / unit-test usage.

#### `reporters.quantifiedSummary`

```ts
reporters.quantifiedSummary.resolve(opts: {
  outputFile: string;       // supports '<runStamp>' placeholder
  testResultsDir: string;   // supports '<runStamp>' placeholder
  title?: string;
}): [reporterPath: string, opts: object]
```

Generates a fully self-contained HTML at `outputFile`. The page bundles its own JS / CSS, copies all referenced screenshots and Playwright artifacts (trace.zip / video.webm / test-failed-N.png) into `<outputDir>/_assets/<caseId>/{shots,pw}/`, and rewrites every reference to a relative path — so the entire `playwright-report-enhanced/<runStamp>/` folder can be zipped, mailed, or uploaded as a CI artifact and **still open correctly anywhere**.

The right-hand detail panel is split into 5 tabs:

| Tab | Content |
|---|---|
| 📝 Detail | Step's Markdown detail (rendered) |
| 📷 Shots | Reporter-captured shots (success / error) + Playwright auto `test-failed-N.png`, lazy-loaded thumbnails + click-to-expand |
| ⚠️ Errors | `actual` of failed step + page-errors within the step's time window (with collapsible stack) |
| 📋 Signals | console / requestfailed events sliced to step's `startTs ± 200ms` |
| 📦 Trace | One-click copy of `npx playwright show-trace <abs-path>` + jump to sibling Playwright HTML report + download local trace.zip copy |

Also exposed: `QuantifiedSummaryReporter`, `scanQuantifiedJsons`, `renderSummaryHtml` for advanced / unit-test usage.

### Utils

#### `utils.wait` — six strategies

```ts
waitVisible(page, selector, opts?)        // VIS — element visible + stable
waitText(page, selector, expectedText, opts?)  // TXT — text matches
waitCount(page, selector, expectedCount, opts?) // CNT — element count
waitResponse(page, urlMatcher, opts?)     // RES — network response
waitNavigation(page, urlMatcher?, opts?)  // NAV — URL change
waitEvent(page, eventName, predicate?, opts?)   // EVT — page event
```

#### `utils.persistence` — generic primitives

```ts
readPersistence(page, channels: { localStorage?: string[]; sessionStorage?: string[]; cookie?: string[]; window?: string[] }): Promise<Snapshot>
clearAllPersistence(page): Promise<void>
presetLocalStorage(page, kv: Record<string, string>): Promise<void>
presetCookies(context, cookies: Cookie[]): Promise<void>
injectNavigatorLanguage(context, lang: string): Promise<void>
installEventBuffer(context, opts: { storageKey: string }): Promise<void>
```

> Project-specific helpers like `readI18nPersistence` / `installLocaleEventCapture` are **not** in this package — they live as adapter layers in the consuming repo.

#### `utils.mocks` — three primitives

```ts
mockJson(page, urlMatcher, body, opts?): Promise<void>
applyMockRules(page, rules: MockRule[]): Promise<void>
silenceStaticResources(page, domains: string[]): Promise<void>
```

> Project-specific aggregations (e.g. `mockHeaderApis` for a particular product line) belong in the consuming repo's adapter layer.

#### `utils.eventCapture` — reload-safe event buffer

```ts
new EventCapture({ eventName: string; storageKey?: string })
  .install(context): Promise<void>
  .read(page): Promise<Event[]>
  .clear(page): Promise<void>
```

The legacy `STORAGE_KEY` alias is exported for backward compatibility.

#### `utils.visibleText`

```ts
collectVisibleTexts(page, opts?): Promise<string[]>
classifyTranslation(source: string, target: string): '✅ 已翻译' | '⚠️ 部分翻译' | '❌ 未翻译' | '⏭️ 不需翻译'
```

#### `utils.runContext`

```ts
getRunStamp(opts: { projectRoot: string }): { stamp: string; branch: string; date: string }
sanitizeBranch(branch: string): string
todayYYYYMMDD(): string
```

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  Consumer (host repo)                     │
│  playwright.config.js     spec.js     reporter adapter    │
│         │                    │                │            │
│         └────── require('s-auto-e2e-kit') ────┘            │
└──────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────┐
│                    s-auto-e2e-kit                         │
│                                                           │
│  reporters/                                               │
│   ├─ quantified-reporter.js          (Markdown + JSON)   │
│   ├─ scene-index-reporter.js         (multi-scene index) │
│   ├─ html-reporter.js  ─►  html-reporter-bridge.js       │
│   │                       (extends Playwright HtmlReporter│
│   │                        via playwright/lib/runner)    │
│   ├─ quantified-summary-reporter.js  (5-tab self-contained│
│   │                                    HTML, asset copy) │
│   └─ _summary-template/{html,css,js} (rendered template) │
│                                                           │
│  utils/                                                   │
│   ├─ wait-strategies.js     (6 strategies)               │
│   ├─ persistence-helpers.js (generic primitives)         │
│   ├─ network-mocks.js       (3 primitives)               │
│   ├─ event-capture.js       (reload-safe buffer)         │
│   ├─ visible-text.js                                     │
│   └─ run-context.js         (YYYYMMDD_<branch> stamp)    │
└──────────────────────────────────────────────────────────┘
                              │
                              ▼
            @playwright/test  (peer dep, ≥1.55 <2)
```

## Repository layout

```
s-auto-e2e-kit/
├── lib/
│   ├── index.js                        # top-level entry — { reporters, utils, version }
│   ├── reporters/
│   │   ├── index.js                    # reporter sub-entry
│   │   ├── quantified-reporter.js
│   │   ├── scene-index-reporter.js
│   │   ├── html-reporter.js
│   │   ├── html-reporter-bridge.js
│   │   ├── quantified-summary-reporter.js
│   │   ├── quantified-summary-reporter-bridge.js
│   │   └── _summary-template/{summary.html, summary.css, summary.js}
│   └── utils/
│       ├── index.js                    # utils sub-entry
│       ├── wait-strategies.js
│       ├── persistence-helpers.js
│       ├── network-mocks.js
│       ├── event-capture.js
│       ├── visible-text.js
│       └── run-context.js
├── scripts/
│   └── sync-vendor.js                  # legacy Phase-4-Plan-A placeholder; the shipped Plan F does not use it
├── package.json
├── README.md / README.zh.md
├── CHANGELOG.md
└── LICENSE
```

## Building from source

### Requirements

- Node.js **≥ 14** (≥ 18 recommended — `reporters.html` needs `playwright/lib/runner` which targets modern Node)
- `@playwright/test` `>=1.55.0 <2.0.0` in the host repo
- One runtime dep: [`marked`](https://www.npmjs.com/package/marked) `^18.0.0` (used by `quantifiedSummary` to render step-detail Markdown)

### Local development against a host repo

```bash
# 1. Inside the host repo, link via file: protocol
#    package.json:
#    "devDependencies": {
#      "s-auto-e2e-kit": "file:../path/to/s-auto-e2e-kit"
#    }
npm install

# 2. Edit the package, re-run e2e
npx playwright test
```

> Because `lib/` is plain CommonJS, **no build step is required**. Edits inside the package are picked up immediately on the next `require()`.

### Packing & verifying locally

```bash
npm pack
# produces s-auto-e2e-kit-<version>.tgz
# install it in a sandbox:
mkdir /tmp/saek-test && cd /tmp/saek-test && npm init -y
npm install /path/to/s-auto-e2e-kit-*.tgz
node -e "console.log(require('s-auto-e2e-kit').version)"
```

### Publishing

```bash
# bump version in package.json
npm version patch     # or minor / major
# publish — publishConfig in package.json forces public access on registry.npmjs.org
npm publish
```

`.npmignore` keeps the published tarball lean: only `lib/`, `scripts/`, `README*.md`, `CHANGELOG.md`, `LICENSE` ship.

## Design tenets — the "5 iron rules"

1. **Physical isolation.** The package never depends on host-repo webpack aliases, `@/` paths, or directory layout.
2. **Zero project hard-coding.** All project-specific data (project name, output paths, domain names, mock rules, cookie keys, step blueprints) flows in via reporter `options` or util arguments. The package's source is grep-clean of any product-line keyword.
3. **Self-contained.** Dependencies live in this package's `package.json`; we never reach into the host repo's `node_modules`.
4. **Derived assets stay out of git.** When a feature would have required vendoring (e.g. Phase-4 Plan A: copying Playwright HTML reporter assets), we instead extend Playwright's official runner exports (Plan F) — no vendoring, no fragile path hacks.
5. **Install path == post-publish path.** Consumers always `require('s-auto-e2e-kit')`. Switching from `file:` link to a published version is a `package.json` one-line change with **zero call-site edits**.

## FAQ

**Q: Do I have to use all four reporters together?**
No. They compose freely. The simplest setup is just `['list', reporters.html.resolveHtmlReporter({...})]`. Add `quantifiedSummary` only when you want the tabbed self-contained HTML; add `quantified` (driven from inside specs) when you want per-test Markdown reports.

**Q: Where do business-specific step blueprints / mock rules / cookie keys live?**
In the host repo, as an **adapter layer** (e.g. `tests/e2e/_<product>/`) that builds product-specific dictionaries on top of this package's generic primitives. The package itself stays grep-clean of any product line.

**Q: What happens if `playwright/lib/runner` is unavailable in the host environment?**
`reporters.html` degrades gracefully: the bridge logs one warning and exposes a no-op reporter — your test run is **not** crashed. Other reporters (`quantified` / `sceneIndex` / `quantifiedSummary`) do not depend on that path and work everywhere Node ≥ 14 runs.

**Q: Why is `vendor/` mentioned in `.gitignore` and `scripts/sync-vendor.js` exists if Plan F doesn't use it?**
Historical: Phase-4 Plan A was going to vendor the Playwright HTML report bundle. Plan F (extending `HtmlReporter` directly) made that obsolete. The script and ignore rule are kept as a documented breadcrumb but are inert in the current implementation.

**Q: Does the package work on monorepos / nested workspaces?**
Yes — every path is resolved against the caller-supplied `projectRoot` (or `process.cwd()` as a fallback), never against `__dirname`.

**Q: Is there a build step?**
No. `lib/` ships plain CommonJS. `npm publish` packs `lib/` as-is.

## Versioning

s-auto-e2e-kit follows semantic versioning starting at `0.0.x`. While the version is below `1.0.0`, breaking changes may land between minor releases (and will always be called out in [CHANGELOG.md](./CHANGELOG.md)). The first `1.0.0` will lock the public API.

## License

[MIT](./LICENSE) © s-auto-e2e-kit contributors.
