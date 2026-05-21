# s-auto-e2e-kit

> 即装即用的 **Playwright E2E 测试工厂套件**：场景无关的 reporters、跨仓库通用 utils、量化版 HTML 报告 —— 装一次，所有用 Playwright 的内部仓库都能复用。

[English](./README.md) · [简体中文](./README.zh.md)

[![npm](https://img.shields.io/npm/v/s-auto-e2e-kit.svg)](https://www.npmjs.com/package/s-auto-e2e-kit)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](#许可证)
[![Node](https://img.shields.io/badge/node-%E2%89%A514-brightgreen.svg)](#环境要求)
[![Playwright](https://img.shields.io/badge/playwright-%E2%89%A51.55%20%3C2-blueviolet.svg)](#环境要求)

---

## 目录

- [为什么需要 s-auto-e2e-kit](#为什么需要-s-auto-e2e-kit)
- [能力矩阵](#能力矩阵)
- [快速开始](#快速开始)
- [API 参考](#api-参考)
  - [Reporters](#reporters)
  - [Utils](#utils)
- [架构](#架构)
- [仓库结构](#仓库结构)
- [从源码构建](#从源码构建)
- [设计原则 —— 5 条铁律](#设计原则--5-条铁律)
- [常见问题](#常见问题)
- [版本策略](#版本策略)
- [许可证](#许可证)

---

## 为什么需要 s-auto-e2e-kit

每个跑 Playwright 端到端测试的团队都在重复造同一套底层管线：拼一份量化版 Markdown/JSON 报告、再写一遍等待策略（visible / text / count / response / nav / event）、再造一遍持久化助手（cookie / localStorage / 事件缓冲）、再封一层网络 mock 原语，最后还要在 Playwright 自带 HTML 报告之上拧一份业务定制的 HTML。**s-auto-e2e-kit** 把这些工作压成一个 npm 包，开箱即用：

1. **4 个 reporter** —— `quantified`（Markdown + JSON）、`sceneIndex`（多场景汇总）、`html`（继承 Playwright HtmlReporter 并自动挂载业务 JSON）、`quantifiedSummary`（自完备的 5 tab 详情 HTML）。
2. **6 个 util** —— `wait`、`persistence`、`mocks`、`eventCapture`、`visibleText`、`runContext`。
3. **同一份契约** —— 所有 reporter / util 都是**场景无关**的：包内不内置任何项目专属域名、Cookie 键、API 路径、step 蓝图。业务相关参数全部由调用方注入。

**设计理念**

- **物理隔离**。不依赖 webpack alias、不依赖 `@/` 路径、不假设宿主仓库的目录结构。纯 CommonJS，Node ≥ 14 即可。
- **零项目硬编码**。项目名、输出路径、域名、Cookie 键、API mock 规则 —— 任何业务相关信息一律通过 reporter `options` / util 参数传入。
- **包内自洽**。依赖只声明在本包 `package.json`，绝不"借用"宿主仓库的 `node_modules`。
- **派生产物不入库**。原 Phase 4 Plan A 计划 vendor Playwright HTML reporter 产物，最终采用的 Plan F 改为通过 `playwright/lib/runner` 公共 exports 直接继承 `HtmlReporter` —— 无需 vendor，无脆弱路径 hack。
- **接入路径 = 发包后路径**。无论本地 `file:` 协议链接还是从 npm 安装，调用方都写 `require('s-auto-e2e-kit')`。从本地切到发布版 = `package.json` 改一行，业务侧 0 改动。

## 能力矩阵

| 能力 | 入口 | 场景无关 |
|---|---|---|
| 量化 Markdown + JSON 报告（每个用例一份） | `reporters.quantified` | ✅ —— step 蓝图字典通过 `opts.blueprintLookup` 注入 |
| 多场景汇总入口 | `reporters.sceneIndex` | ✅ |
| 增强版 Playwright HTML 报告（自动挂载业务 JSON） | `reporters.html` | ✅ —— 通过 `playwright/lib/runner` 继承官方 `HtmlReporter` |
| 自完备的量化总览 HTML（5 个 tab） | `reporters.quantifiedSummary` | ✅ |
| 6 种等待策略（VIS / TXT / CNT / RES / NAV / EVT） | `utils.wait` | ✅ |
| 持久化读写（localStorage / sessionStorage / cookie / window / 事件缓冲） | `utils.persistence` | ✅ —— channel 列表由调用方传入 |
| 网络 mock 三原语（`mockJson` / `applyMockRules` / `silenceStaticResources`） | `utils.mocks` | ✅ —— 规则由调用方传入 |
| 事件捕获（基于 localStorage，reload 安全） | `utils.eventCapture` | ✅ —— 事件名 / storageKey 通过构造函数传 |
| 提取页面可见文本 + 翻译完整度判定 | `utils.visibleText` | ✅ |
| 运行上下文（`YYYYMMDD_<branch>` 戳 + 项目根解析） | `utils.runContext` | ✅ |

## 快速开始

### 安装

```bash
npm i -D s-auto-e2e-kit
# 或：pnpm add -D s-auto-e2e-kit
# 或：yarn add -D s-auto-e2e-kit
```

Peer 依赖：`@playwright/test >=1.55.0 <2.0.0`。Node ≥ 14（增强版 HTML reporter 用到 `playwright/lib/runner`，建议 Node ≥ 18）。

### 接入 reporter

```js
// playwright.config.js
const { reporters } = require('s-auto-e2e-kit');

module.exports = {
  reporter: [
    ['list'],

    // 增强版 HTML 报告 —— 继承 Playwright 自带 HtmlReporter，
    // 自动把每个 test 的 quantified.json 挂为可下载 attachment。
    reporters.html.resolveHtmlReporter({
      outputFolder: 'playwright-report-enhanced',
      open: 'never',
      title: '我的项目 E2E',
      attachQuantifiedJson: true,
      resultsRoot: 'test-results',
    }),

    // 自完备的 tab 化详情 HTML（5 个 tab：详情 / 截图 / 错误 / 信号 / Trace）。
    reporters.quantifiedSummary.resolve({
      outputFile: 'playwright-report-enhanced/<runStamp>/quantified-summary.html',
      testResultsDir: 'test-results/<runStamp>',
      title: '我的项目 E2E · 量化报告',
    }),
  ],
};
```

### 在 spec 中驱动量化 reporter

```js
const { test, expect } = require('@playwright/test');
const { reporters, utils } = require('s-auto-e2e-kit');

test('TC-LOGIN-P0-01 · 登录主流程', async ({ page }) => {
  const reporter = new reporters.quantified.QuantifiedReporter({
    sceneName: 'login',
    caseId: 'TC-LOGIN-P0-01',
    title: '登录主流程',
    priority: 'P0',
    projectRoot: process.cwd(),
    // blueprintLookup 是「可选」 —— 不传走「无蓝图降级模式」。
    // 想要 phase 分组、中文语义步骤标题、失败手册等增强能力，
    // 由调用方注入业务专属字典 —— 业务相关数据始终由调用方持有。
  });

  await reporter.runStep('open-page', async () => {
    await page.goto('https://example.com/login');
    await utils.wait.waitVisible(page, '#login-form');
  });

  // ... 更多 step ...

  await reporter.finalize();
});
```

### 单独使用 utils

```js
const { utils } = require('s-auto-e2e-kit');

// 6 种等待策略
await utils.wait.waitVisible(page, '#hero');
await utils.wait.waitText(page, '#switcher', '中文');

// 网络 mock（规则由调用方决定）
await utils.mocks.applyMockRules(page, [
  { url: /\/api\/user$/, body: { id: 1, name: 'alice' } },
]);
await utils.mocks.silenceStaticResources(page, ['cdn.example.com']);

// 持久化（channel 由调用方声明）
const snapshot = await utils.persistence.readPersistence(page, {
  localStorage: ['app:locale', 'app:theme'],
  cookie: ['session_id'],
});

// 运行戳：YYYYMMDD_<gitBranch>，用于测试产物分目录
const { stamp } = utils.runContext.getRunStamp({ projectRoot: process.cwd() });
```

## API 参考

### Reporters

#### `reporters.quantified`

```ts
new QuantifiedReporter(opts: {
  sceneName: string;          // 例 'login' —— 决定输出目录
  caseId: string;             // 例 'TC-LOGIN-P0-01'
  title: string;
  priority: 'P0' | 'P1' | 'P2';
  dimensions?: string[];      // 覆盖维度，如 ['F2', 'P1-P5']
  entryUrl?: string;
  projectRoot: string;
  blueprintLookup?: BlueprintLookup;  // 可选 —— 调用方注入的业务字典
});
```

产物：

- `docs/qa-reports/<runStamp>/<scene>/<caseId>.md` —— 给人看的 Markdown
- `test-results/<runStamp>/<scene>/<caseId>.json` —— 给机器解析的 JSON（含 `shotIndex`、`shotsByStep`、持久化快照、console / pageError / 网络失败时间线）

不传 `blueprintLookup` 时进入"无蓝图降级"模式：数据采集和基础渲染照常工作，只是没有 phase 分组、语义步骤标题、失败手册。**业务专属蓝图永远留在消费方仓库**，绝不进包。

#### `reporters.sceneIndex`

```ts
buildSceneIndex(opts: { projectRoot: string; runStamp?: string }): Promise<void>
```

遍历 `docs/qa-reports/<runStamp>/*`，在顶层写一份 `INDEX.md` 把所有场景报告链起来。

#### `reporters.html`

```ts
reporters.html.resolveHtmlReporter(opts: {
  outputFolder?: string;          // 默认 'playwright-report-enhanced'
  open?: 'always' | 'never' | 'on-failure';
  title?: string;
  attachQuantifiedJson?: boolean; // 默认 true
  resultsRoot?: string;           // 默认 'test-results'
}): [bridgePath: string, opts: object]
```

返回 Playwright reporter 数组项。内部通过 `require('playwright/lib/runner').html` 拿到官方 `HtmlReporter`（Playwright ≥ 1.60），再 `extends` 出来注入业务 attachment。环境不可用时降级为占位 reporter，只 warning 一次，不 crash 测试。

进阶/单测用法还可拿到：`bridgePath`、`createEnhancedHtmlReporter(BaseHtmlReporter)`、`tryLoadPlaywrightHtml()`。

#### `reporters.quantifiedSummary`

```ts
reporters.quantifiedSummary.resolve(opts: {
  outputFile: string;       // 支持 '<runStamp>' 占位符
  testResultsDir: string;   // 支持 '<runStamp>' 占位符
  title?: string;
}): [reporterPath: string, opts: object]
```

在 `outputFile` 处生成一份完全自完备的 HTML：内联自己的 JS / CSS，把所有引用到的截图、Playwright 产物（trace.zip / video.webm / test-failed-N.png）拷贝到 `<outputDir>/_assets/<caseId>/{shots,pw}/`，并把所有引用改写成相对路径 —— 整个 `playwright-report-enhanced/<runStamp>/` 目录可以**整包打包发同事 / 上传 CI artifact**，在任何机器上打开都还能正常加载。

右侧详情区分 5 个 tab：

| Tab | 内容 |
|---|---|
| 📝 详情 | 步骤的 Markdown 详情（已渲染） |
| 📷 截图 | reporter 自拍截图（success / error）+ Playwright 自动 `test-failed-N.png`，缩略图 + 点开大图，懒加载 |
| ⚠️ 错误 | fail step 的 actual + 时间窗口内的 pageError（带堆栈折叠） |
| 📋 信号 | 时间窗口内的 console / requestfailed（按 step.startTs ± 200ms 切片） |
| 📦 Trace | 一键复制 `npx playwright show-trace <abs-path>` + 跳同目录 PW 原生报告 + 下载本地 trace.zip 副本 |

进阶/单测用法还可拿到：`QuantifiedSummaryReporter`、`scanQuantifiedJsons`、`renderSummaryHtml`。

### Utils

#### `utils.wait` —— 6 种策略

```ts
waitVisible(page, selector, opts?)              // VIS —— 元素可见 + 稳定
waitText(page, selector, expectedText, opts?)   // TXT —— 文本匹配
waitCount(page, selector, expectedCount, opts?) // CNT —— 元素数量
waitResponse(page, urlMatcher, opts?)           // RES —— 网络响应
waitNavigation(page, urlMatcher?, opts?)        // NAV —— URL 变化
waitEvent(page, eventName, predicate?, opts?)   // EVT —— 页面事件
```

#### `utils.persistence` —— 通用原语

```ts
readPersistence(page, channels: { localStorage?: string[]; sessionStorage?: string[]; cookie?: string[]; window?: string[] }): Promise<Snapshot>
clearAllPersistence(page): Promise<void>
presetLocalStorage(page, kv: Record<string, string>): Promise<void>
presetCookies(context, cookies: Cookie[]): Promise<void>
injectNavigatorLanguage(context, lang: string): Promise<void>
installEventBuffer(context, opts: { storageKey: string }): Promise<void>
```

> 项目专属的 `readI18nPersistence` / `installLocaleEventCapture` 之类**不在**本包内 —— 它们以适配层形式留在消费方仓库。

#### `utils.mocks` —— 三原语

```ts
mockJson(page, urlMatcher, body, opts?): Promise<void>
applyMockRules(page, rules: MockRule[]): Promise<void>
silenceStaticResources(page, domains: string[]): Promise<void>
```

> 项目专属的聚合（如某产品线的 `mockHeaderApis`）应留在消费方仓库的适配层。

#### `utils.eventCapture` —— reload 安全的事件缓冲

```ts
new EventCapture({ eventName: string; storageKey?: string })
  .install(context): Promise<void>
  .read(page): Promise<Event[]>
  .clear(page): Promise<void>
```

旧版 `STORAGE_KEY` 别名向后兼容导出。

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

## 架构

```
┌──────────────────────────────────────────────────────────┐
│                  消费方（宿主仓库）                        │
│  playwright.config.js     spec.js     reporter 适配层      │
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
│   ├─ scene-index-reporter.js         (多场景汇总)          │
│   ├─ html-reporter.js  ─►  html-reporter-bridge.js       │
│   │                       (通过 playwright/lib/runner     │
│   │                        继承 HtmlReporter)             │
│   ├─ quantified-summary-reporter.js  (5 tab 自完备 HTML，  │
│   │                                    资产复制)           │
│   └─ _summary-template/{html,css,js}（渲染模板）          │
│                                                           │
│  utils/                                                   │
│   ├─ wait-strategies.js     (6 种策略)                    │
│   ├─ persistence-helpers.js (通用原语)                    │
│   ├─ network-mocks.js       (3 原语)                      │
│   ├─ event-capture.js       (reload-safe buffer)         │
│   ├─ visible-text.js                                     │
│   └─ run-context.js         (YYYYMMDD_<branch> 戳)        │
└──────────────────────────────────────────────────────────┘
                              │
                              ▼
            @playwright/test  (peer dep, ≥1.55 <2)
```

## 仓库结构

```
s-auto-e2e-kit/
├── lib/
│   ├── index.js                        # 顶层入口 —— { reporters, utils, version }
│   ├── reporters/
│   │   ├── index.js                    # reporter 子入口
│   │   ├── quantified-reporter.js
│   │   ├── scene-index-reporter.js
│   │   ├── html-reporter.js
│   │   ├── html-reporter-bridge.js
│   │   ├── quantified-summary-reporter.js
│   │   ├── quantified-summary-reporter-bridge.js
│   │   └── _summary-template/{summary.html, summary.css, summary.js}
│   └── utils/
│       ├── index.js                    # utils 子入口
│       ├── wait-strategies.js
│       ├── persistence-helpers.js
│       ├── network-mocks.js
│       ├── event-capture.js
│       ├── visible-text.js
│       └── run-context.js
├── scripts/
│   └── sync-vendor.js                  # Phase 4 Plan A 历史占位；Plan F 已不再需要
├── package.json
├── README.md / README.zh.md
├── CHANGELOG.md
└── LICENSE
```

## 从源码构建

### 环境要求

- Node.js **≥ 14**（建议 ≥ 18 —— `reporters.html` 用到 `playwright/lib/runner`，对 Node 版本有要求）
- 宿主仓库需有 `@playwright/test` `>=1.55.0 <2.0.0`
- 唯一运行时依赖：[`marked`](https://www.npmjs.com/package/marked) `^18.0.0`（`quantifiedSummary` 用来渲染 step detail Markdown）

### 在宿主仓库本地开发

```bash
# 1. 宿主仓库 package.json 通过 file: 协议链接
#    "devDependencies": {
#      "s-auto-e2e-kit": "file:../path/to/s-auto-e2e-kit"
#    }
npm install

# 2. 改包内代码，重跑 e2e
npx playwright test
```

> 因为 `lib/` 是纯 CommonJS，**无构建步骤**。包内改完代码下次 `require()` 立即生效。

### 本地打包验证

```bash
npm pack
# 产出 s-auto-e2e-kit-<version>.tgz
# 在沙箱里安装验证：
mkdir /tmp/saek-test && cd /tmp/saek-test && npm init -y
npm install /path/to/s-auto-e2e-kit-*.tgz
node -e "console.log(require('s-auto-e2e-kit').version)"
```

### 发布到 npm

```bash
# 升 package.json 版本号
npm version patch     # 或 minor / major
# 发布 —— package.json 的 publishConfig 强制走 registry.npmjs.org 并以 public 访问
npm publish
```

`.npmignore` 把发包内容收紧：只有 `lib/`、`scripts/`、`README*.md`、`CHANGELOG.md`、`LICENSE` 进 tarball。

## 设计原则 —— 5 条铁律

1. **物理隔离**。包内代码绝不依赖宿主仓库 webpack alias、`@/` 路径或目录约定。
2. **零项目硬编码**。所有项目相关数据（项目名、输出路径、域名、mock 规则、Cookie 键、step 蓝图）一律通过 reporter `options` / util 参数注入。包内源码 grep 任何产品线关键字都应 0 命中。
3. **包内自洽**。依赖只声明在本包 `package.json`，绝不"借用"宿主仓库的 `node_modules`。
4. **派生产物不入库**。原本要 vendor 的需求（如 Phase 4 Plan A：拷贝 Playwright HTML reporter 产物）改为通过 `playwright/lib/runner` 公开 exports 继承官方实现（Plan F），无需 vendor，无路径 hack。
5. **接入路径 = 发包后路径**。调用方一律 `require('s-auto-e2e-kit')`。从 `file:` 链接切到 npm 发布版只需改 `package.json` 一行，业务侧 0 改动。

## 常见问题

**Q：4 个 reporter 必须一起用吗？**
不需要。它们可自由组合。最小配置就是 `['list', reporters.html.resolveHtmlReporter({...})]`。需要 tab 化自完备 HTML 时再加 `quantifiedSummary`；需要每个用例的 Markdown 报告时再在 spec 内驱动 `quantified`。

**Q：业务专属的 step 蓝图 / mock 规则 / Cookie 键放哪里？**
留在宿主仓库的**适配层**（如 `tests/e2e/_<product>/`），基于本包的通用原语组装出业务专属字典。包本身保持产品线 grep-clean。

**Q：宿主环境拿不到 `playwright/lib/runner` 怎么办？**
`reporters.html` 会优雅降级：bridge 打印一次 warning，给一个 noop reporter —— 测试**不会**因此 crash。其他 3 个 reporter（`quantified` / `sceneIndex` / `quantifiedSummary`）不依赖该路径，在任何 Node ≥ 14 的环境都能用。

**Q：既然 Plan F 不用 vendor，为什么 `.gitignore` 里还有 `vendor/`、`scripts/sync-vendor.js` 还在？**
历史原因：Phase 4 Plan A 计划 vendor Playwright HTML report 产物。Plan F（直接继承 `HtmlReporter`）落地后该路径作废。脚本和忽略规则保留作为决策记录，但当前实现里没有任何代码会触发它们。

**Q：在 monorepo / 嵌套 workspace 里能用吗？**
可以 —— 所有路径以调用方传入的 `projectRoot`（缺省为 `process.cwd()`）为锚，绝不基于 `__dirname`。

**Q：有构建步骤吗？**
没有。`lib/` 直接发 CommonJS，`npm publish` 原样打包。

## 版本策略

s-auto-e2e-kit 遵循语义化版本，从 `0.0.x` 起步。`1.0.0` 之前 minor 版本之间可能引入 break change，CHANGELOG 会显式标注（见 [CHANGELOG.md](./CHANGELOG.md)）。`1.0.0` 之后会锁定公开 API。

## 许可证

[MIT](./LICENSE) © s-auto-e2e-kit contributors。
