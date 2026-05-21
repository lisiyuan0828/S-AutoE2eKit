# Changelog

本文档记录 `s-auto-e2e-kit` 的版本变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.1.2] - 2026-05-21

### ✨ Changed · docs/e2e 改为按需生成 + scripts 精简

针对用户反馈"`docs/e2e/` 默认 5 个文件不够个性化、`scripts` 4 个太冗余"，本次按"工业标准 = 默认值精准、可选项明确"原则做了一次精简：

#### 📂 docs/e2e/ 业务文档骨架

- **核心 4 件套继续默认生成**（覆盖 99% 项目场景）：
  - `README.md` —— 元说明（所有项目通用）
  - `auth.md` —— 登录 / 鉴权 / 测试账号
  - `flows.md` —— 核心业务流程清单
  - `selectors.md` —— 关键元素定位约定
- **`i18n.md` 改为 detect-driven**：仅当 `detectProject` 在 `package.json` 里检测到 i18n 库（`i18next` / `react-i18next` / `next-i18next` / `vue-i18n` / `@nuxtjs/i18n` / `react-intl` / `@formatjs/intl` / `@lingui/core` / `svelte-i18n` 等）时才生成。
  - 没装 i18n 的纯业务系统不再被强加无关模板。
  - 后期想补：`cp node_modules/s-auto-e2e-kit/lib/cli/templates/docs-e2e/i18n.md docs/e2e/`
- **新增"不需要可直接删"原则**写入 `docs/e2e/README.md` 模板：skill 检测到文件不存在会自动跳过该维度，不会报错。
- 完成提示中 `docs` 步骤的 label 会动态显示"核心 4 + i18n.md"或"核心 4 个文件"，让用户对生成内容心里有数。

#### 📦 npm scripts 精简

- **从 4 条砍到 2 条**（`e2e` + `e2e:ui` 必装）：
  - ✅ `e2e` ：`playwright test`（CI 必备）
  - ✅ `e2e:ui`：`playwright test --ui`（开发时极好用）
  - ❌ ~~`e2e:headed`~~ ：playwright 原生 `--headed` 一参数即可，不必 alias
  - ❌ ~~`e2e:report`~~ ：`npx playwright show-report` 一行命令，不必 alias
- **教学不丢**：被砍的两条以 hint 形式出现在 init 完成提示，并写入 `docs/e2e/README.md` 的"常用命令速查"表中，用户随用随查。

### 🔧 Internal

- `detect-project.js` 新增 `hasI18n` 字段（向后兼容；未使用方不受影响）。
- `ensure-docs.js` 拆分 `CORE_FILES` / `OPTIONAL_FILES`，模板新增可选维度更清晰。
- `init.js` 完成提示改为只列核心两条 + hint 行教 playwright 原生 CLI；`docs` 步骤 label 根据 `project.hasI18n` 动态显示。
- `templates/docs-e2e/README.md` 增加"默认"列、"不需要可删"原则段、"常用命令速查"表。

### 📝 Rationale

- **docs**：kit 的职责是"装环境"而不是"假装懂业务"。i18n 模板对没多语言需求的项目是噪声，对有需求的项目可以靠 `package.json` 一票否决式探测精准命中——这才是 init 该做的事。
- **scripts**：playwright 自身就是合格的 CLI 工具，alias 一条参数搞定的命令是过度设计。`create-playwright` 官方脚手架也只装一个 `e2e`。

### ⏩ Migration

- 已用 0.1.1 跑过 init 的项目：**无需任何操作**。已生成的 `i18n.md` 和 4 条 scripts 全部保留（init 幂等，重跑不会删）。如果想手动精简：
  ```bash
  # 没多语言项目可以删 i18n.md
  rm docs/e2e/i18n.md
  # 删掉用不到的 scripts
  npm pkg delete scripts.e2e:headed scripts.e2e:report
  ```

## [0.1.1] - 2026-05-21

### 🔥 Removed · 移除 init 中的 skill 引导步骤

- **删除 step**：`ensure-skill` 不再作为 init 的一环（原为 checklist 第 7 项 `引导安装 auto-e2e Claude skill（可选）`）。
- **删除文件**：`lib/cli/steps/ensure-skill.js`。
- **删除 flag**：`--skip-skill`（已无意义；同步从 `BOOLEAN_FLAGS` / `help.js` 文案 / `ci-smoke.mjs` 用例中清除）。
- **删除 `--only=skill`**：可选步骤列表中不再出现 `skill`。

### ✨ Changed · skill 安装降级为完成提示

- init 全流程跑完后，在末尾"下一步"之后追加一段**强提示**：
  ```
  配套 Claude / CodeBuddy skill（强烈推荐）:
    npx skills add lisiyuan0828/S-AutoE2eSkill
  ```
- 用意：kit 只负责"装环境"，skill 是用户**自己用 `npx skills add` 装**的事——两边各司其职，避免在 init 里再做重复/不可控的引导动作。

### 📝 Rationale

- 之前 `ensureSkill` step 在不同 AI 环境（Claude / CodeBuddy / Cursor）下检测路径不同、容易误判"已装"或"装失败"，导致用户体验割裂。
- skill 由 `npx skills add` 这一**官方标准入口**安装，行为可预期、可重入、可锁定（`skills-lock.json`），无需 kit 介入。
- 移除后 init 流程从 6 个 step 精简为 5 个，幂等性 / CI 友好性不变。

## [0.1.0] - 2026-05-21

### ✨ Added · CLI 一键初始化（最大亮点）

新增 `npx s-auto-e2e-kit init` —— 在任意 Playwright 项目根目录跑一行命令，即可完成：

- ✅ 探测：node 版本 / 包管理器（npm/pnpm/yarn）/ monorepo / framework（react/vue/svelte/next/nuxt）/ TS-or-JS / dev script / baseURL（vite=5173 / next=3000 / webpack=8080）
- ✅ 装 `@playwright/test` + `s-auto-e2e-kit`（按探测到的包管理器选命令）
- ✅ 装 chromium 浏览器（可 `--skip-browsers`）
- ✅ 生成 `playwright.config.js`（reporter / projects / baseURL 占位符自动替换）
- ✅ 创建 `docs/e2e/` 业务文档骨架（5 个 md：README / auth / flows / selectors / i18n —— 给 `auto-e2e` skill 当知识库用）
- ✅ 注入 `package.json#scripts.{e2e, e2e:ui, e2e:headed, e2e:report}`
- ✅ 引导安装 [auto-e2e Claude skill](https://github.com/lisiyuan0828/S-AutoE2eSkill)（已装自动识别并跳过）

#### CLI 子命令

- `init` —— 一键初始化（核心命令）
- `doctor` —— 9 项环境体检（只读，不修复）
- `help` / `--help` / `--version`

#### Init 选项（覆盖默认行为）

`--yes` / `-y` · `--auto` · `--manual` · `--dry-run` · `--force` · `--only=<id>` · `--skip-browsers` · `--skip-skill` · `--pkg-manager <npm|pnpm|yarn>`

#### 设计原则

- **零第三方依赖**（不引 commander / inquirer / chalk / ora / picocolors） —— `npx` 启动快，包体积稳
- **幂等** —— 重跑所有 step 智能跳过（除非 `--force`）
- **CI 友好** —— 非 TTY 自动按默认值通过，绝不 hang
- **跨平台** —— Windows shell 模式 + `.mjs` shebang
- **可独立单跑** —— `--only=<id>` 让任意失败步骤可以单独重试，不必从头来

#### 新增文件

```
bin/
└── auto-e2e.mjs                          # 薄壳入口（双 bin 别名：auto-e2e / auto-e2e-kit）
lib/cli/
├── index.js                              # 路由 + 极简 arg parser
├── commands/{help,init,doctor}.js
├── steps/                                # 8 个独立、可单跑的 step
│   ├── detect-env.js / detect-project.js
│   └── ensure-{dependencies,browsers,config,docs,scripts,skill}.js
├── utils/{logger,prompt,exec,paths}.js   # 4 个零依赖小工具
└── templates/
    ├── playwright.config.js              # 含 __TEST_DIR__ / __BASE_URL__ / __DEV_COMMAND__ 占位符
    └── docs-e2e/{README,auth,flows,selectors,i18n}.md
```

### 🔧 Changed

- `package.json` 加 `bin` 字段（双别名 `auto-e2e` / `auto-e2e-kit`）
- `package.json#files` 白名单加入 `bin/`
- 新增 `cli` / `cli:init` / `cli:doctor` / `cli:help` 4 条调试用 npm scripts

### 📝 Notes

- 包名重命名：从 `@tencent/e2e-kit` 改为 `s-auto-e2e-kit`（unscoped，公开发布到 npm）。所有内部 require 路径已同步更新；调用方 import 路径也由 `require('@tencent/e2e-kit')` 改为 `require('s-auto-e2e-kit')`。
- `[0.0.1]` 之前的内容（含 Phase 1~8）保留在下方作为历史归档。

---

## [0.0.1] - 历史归档

> 以下条目是包从 `@tencent/e2e-kit` 公开发布前的内部迭代历史（Phase 1~8），按时间倒序排列。0.1.0 起改名为 `s-auto-e2e-kit`。

### Phase 8 · quantified-summary 详情 tab 化（🅵 方案 · 已完成）

**核心成果**：quantified-summary 升级为**唯一报告入口**，右侧详情区按数据语义分 5 个 tab，PW 原生 trace/video/失败截图被关联到对应 step 上，截图全部复制到 `_assets/` 实现报告便携。

**🅵 方案要点**：

- 📝 **业务详情**：保留原 markdown 渲染
- 📷 **截图墙**：按 step 聚合 reporter 自拍（success/error）+ PW 自动 `test-failed-N.png`，缩略图 + 点开大图，懒加载
- ⚠️ **错误**：fail step 的 actual + 时间窗口内的 pageError（带堆栈折叠）
- 📋 **运行期信号**：时间窗口内的 console / requestfailed（按 step.startTs ± 200ms 切片）
- 📦 **Trace & PW**：`npx playwright show-trace <abs-path>` 一键复制 + 跳同目录 PW 原生报告（trace viewer 入口）+ 下载本地 trace.zip 副本

**改动文件**：

- 🔄 `lib/reporters/quantified-reporter.js`：
  - constructor 给 PW test 注入 `qd:caseId` / `qd:scene` annotations，让下游 reporter 反查
  - `finalize()` 写 JSON 时新增 `shotIndex` / `shotsByStep` 字段（按 stepId 聚合截图清单）
- 🔄 `lib/reporters/quantified-summary-reporter.js`：
  - 新增 `onTestEnd(test, result)` hook：从 `result.attachments` 收 trace.zip / test-failed-N.png / video.webm，按 caseId 索引（启发式分类：trace / failedShot / video / screenshot / other）
  - 新增 `copyAssetsAndRewritePaths(cases, outputFile)`：把所有引用到的本地图片 + PW 产物复制到 `<outputDir>/_assets/<caseId>/{shots,pw}/`，用 `${size}-${mtime}` 去重前缀；改写 JSON 路径为相对路径（HTML 同目录可寻址）
  - PW attachment 同时保留 `originalPath`（绝对，给命令行）和 `path`（相对，给 HTML），避免复制路径冲掉命令行可用性
- 🆕 `lib/reporters/_summary-template/summary.js`（重写）：
  - `renderDetail()` tab 化（5 个 tab）+ 数字角标
  - 左侧 step item 增加旁标小徽章（📷N / ⚠️ / 📋N）一眼看到该 step 哪个 tab 有料
  - 时间窗口切片 helper：`collectStepSignals` / `collectStepShots`
  - 复制到剪贴板：`navigator.clipboard.writeText` + `execCommand` 兜底
- 🔄 `lib/reporters/_summary-template/summary.css`：新增 ~200 行（tab 栏 / 截图墙 grid / 错误卡 / 信号表 / Trace 操作按钮）

**便携性升级**：报告目录 `playwright-report-enhanced/<runStamp>/` 现在可以**整包搬走**（zip 给同事 / 上传 CI artifact），打开 `quantified-summary.html` 所有截图都还能加载（路径相对）。trace.zip 复制了一份在 `_assets/<caseId>/pw/`，但命令行仍用 PW 原始绝对路径（trace viewer 命令更短，且原路径在 CI 上更稳定）。

### Phase 1 · 包骨架（已完成）

- ✨ 初始化包结构 `packages/e2e-kit/`（参照 `packages/qd-lib/` 范式）
- ✨ 添加 `package.json`：完整 npm 包元信息、`exports` 多入口、`peerDependencies` 锁 Playwright `>=1.55.0 <2.0.0`
- ✨ 添加 `README.md`：使用说明、5 条设计铁律、目录结构
- ✨ 添加 `lib/index.js`、`lib/reporters/index.js`、`lib/utils/index.js`：3 层入口骨架（占位）
- ✨ 添加 `scripts/sync-vendor.js`：Phase 4 vendor 同步入口（当前为占位）
- 📝 新增专题文档 `docs/e2e-kit-index.md`
- 📝 主仓库 `docs/project-map.md` 同步更新 §3、§9、§11
- 🔗 主仓库 `package.json` 通过 `file:` 协议引入：`"@tencent/e2e-kit": "file:./packages/e2e-kit"`

### Phase 2 · 迁移 utils（已完成）

**核心成果**：6 个 util 全部入包，**包内 0 企点专属信息**（铁律 2 强制执行），主仓库 spec/setup/reporter 0 改动。

包内新增（`packages/e2e-kit/lib/utils/`）：
- ✨ `wait-strategies.js`：6 种等待策略 VIS/TXT/CNT/RES/NAV/EVT，**100% 平移**（本来就业务无关）
- ✨ `run-context.js`：`getRunStamp` / `sanitizeBranch` / `todayYYYYMMDD`，**修硬编码**：`path.resolve(__dirname,'../../..')` → `process.cwd()` 兜底（npm 包模式适配）
- ✨ `visible-text.js`：`collectVisibleTexts` / `classifyTranslation`，**100% 平移**
- ✨ `event-capture.js`：从旧 `locale-event-capture.js` **去 'locale' 前缀重命名**为通用版；构造函数接受任意事件名 + 可配 `storageKey`；`STORAGE_KEY` 别名兼容旧调用
- ✨ `persistence-helpers.js`：**通用化重写** —— 移除企点专属 `readI18nPersistence` / `installLocaleEventCapture`，新增通用 `readPersistence(page, channels)` 和 `installEventBuffer(context, opts)`；保留 `clearAllPersistence` / `presetLocalStorage` / `presetCookies` / `injectNavigatorLanguage` 等业务无关函数
- ✨ `network-mocks.js`：**通用化重写** —— 移除企点专属 `mockHeaderApis`（含 `bqq.gtimg.com` / `/v1/menu/*` 等所有企点接口路径和域名），仅保留三个通用原语 `mockJson` / `applyMockRules` / `silenceStaticResources`
- 🔄 `lib/utils/index.js`：占位 Proxy → 真实命名空间导出（`wait` / `persistence` / `mocks` / `eventCapture` / `visibleText` / `runContext`）

主仓库改造（`tests/e2e/_utils/`）：
- 🔄 4 个文件改为**一行转发桩**：`wait-strategies.js` / `run-context.js` / `visible-text.js` / `locale-event-capture.js`
- 🔄 2 个文件改为**企点适配层**：
  - `persistence-helpers.js`：基于包内通用 `readPersistence` / `installEventBuffer` 组装出企点专属 `readI18nPersistence` / `installLocaleEventCapture`，**保留与旧版完全一致的扁平返回结构**（`scenarios.js` 0 改动）
  - `network-mocks.js`：基于包内 `applyMockRules` / `silenceStaticResources` 组装出企点专属 `mockHeaderApis`，**保留所有企点接口规则、CDN 域名清单**（`_setup.js` 0 改动）
- 📌 企点专属命名常量集中暴露（`QIDIAN_I18N_CHANNELS` / `QIDIAN_HEADER_API_RULES` / `QIDIAN_STATIC_NOISY_DOMAINS`），便于审阅和未来抽出"企点 e2e adapter"包

兼容性验证（已通过）：
- ✅ 包内 6 个 util 通过命名空间 + 子路径两种形式 require 均成功
- ✅ 7 个调用方（3 reporter + 2 main-flow + 1 spec + 1 README）所有解构 import 0 报错
- ✅ `getRunStamp({ projectRoot: process.cwd() })` 正确识别当前 git 分支
- ✅ `classifyTranslation('你好','Hello')` 返回 `'✅ 已翻译'`，逻辑无回归

铁律审计：
- ✅ 铁律 2 「零项目硬编码」：包内 grep `qidian` / `bqq.gtimg.com` / `__QIDIAN_LOCALE__` / `qidianLocale` 等关键字 0 命中
- ⏭️ 铁律 1 「包内 0 项目代码」：本 Phase 不引入业务代码，符合
- ⏭️ 铁律 3 「Playwright 版本兼容」：本 Phase 仅依赖 Playwright 公共 API（`route` / `page.evaluate` / `addInitScript` / `expect`），无版本敏感
- ⏭️ 铁律 4 「向后兼容」：旧路径全部保留为转发/适配层，调用方 0 改动
- ⏭️ 铁律 5 「文档同步」：见下方文档同步条目

文档同步：
- 📝 本 CHANGELOG 追加 Phase 2 条目
- 📝 `docs/e2e-kit-index.md` §6.3 填充真实 API 签名（待更新）
- 📝 `docs/project-map.md` §14 更新 _utils 6 个文件状态（待更新）

### Phase 3 · 迁移 reporters（已完成 · 待运行时验证）

> ⚠️ **运行时验证状态**：当前主仓库 Node 环境为 14（不支持 `??=`），无法跑 `npx playwright test` 真实回归。本 Phase 完成代码 + 适配层逻辑验证（require 链通畅 + 解构兼容 + step-blueprints 默认注入），运行时回归待 Node 18+ 环境跑通后补充。

**核心成果**：把 3 个 reporter 中的**通用部分**迁入包，业务部分留主仓库。明确划分"工具/能力"与"业务测试代码"的边界。

**关键设计决策**（修正过一次）：`i18n-audit-reporter.js` **不进包**，留在主仓库 `tests/e2e/_reporters/` 完全不动。理由：它是企点 i18n 用例专属的业务测试代码，不是通用 reporter 工厂。判断标准——任何只有"做企点 i18n 业务"才能用上的代码，都属于业务测试代码而非工具。

包内新增（`packages/e2e-kit/lib/reporters/`）：
- ✨ `quantified-reporter.js`：1180 行，**业务无关版** —— 移除原 35-43 行 `step-blueprints` 软依赖兜底；构造函数 `opts.blueprintLookup` 不传则进入"无蓝图降级"模式，由调用方注入业务专属蓝图
- ✨ `scene-index-reporter.js`：100% 平移（仅 require 路径改 `'../_utils/run-context'` → `'../utils/run-context'`），本来就业务无关
- 🔄 `lib/reporters/index.js`：占位 → 真实 require（quantified / sceneIndex 实装；html 仍占位待 Phase 4；**移除 i18nAudit 占位** —— 它本来就不该在包里）

主仓库改造（`tests/e2e/_reporters/`）：
- 🧩 `quantified-reporter.js` → **薄适配层**：继承包内 `BaseQuantifiedReporter`，构造时若调用方未传 `blueprintLookup` 则注入企点 `step-blueprints` 作为默认值；显式传入（包括 `null`）时尊重调用方
- 🔁 `scene-index-reporter.js` → **一行转发桩**：`module.exports = require('@tencent/e2e-kit/reporters/scene-index-reporter')`
- ⛔ `i18n-audit-reporter.js` → **0 改动**（它依赖的 `classifyTranslation` / `getRunStamp` 已通过 Phase 2 转发桩走包内）

兼容性验证（已通过）：
- ✅ 包内通用 reporter 通过命名空间 + 子路径两种形式 require 均成功
- ✅ 6 个调用方（5 个 main-flow spec + README）的 `new QuantifiedReporter(...)` / `buildSceneIndex(...)` 0 改动可用
- ✅ step-blueprints 默认注入逻辑验证通过（`reporter.blueprintLookup.getBlueprint` 是 function）
- ✅ 适配层精修：显式传 `blueprintLookup: null` 被正确尊重（destructure + rest 模式，避免 `...opts` 把默认值覆盖回 undefined）
- ⏭️ 真实 e2e 运行时回归 → 待 Node 18+ 环境

铁律审计：
- ✅ 铁律 1「包内 0 项目代码」：包内 `lib/` 通过 grep `qidian|bqq.gtimg|__QIDIAN_LOCALE__|qidianLocale|qidian-locale-change|gtimg|qlogo|codesign.qq|step-blueprints|main-flow` **0 命中**
- ✅ 铁律 2「零项目硬编码」：通用 reporter 不再 require 任何项目专属路径
- ⏭️ 铁律 3「Playwright 版本兼容」：仅依赖 `@playwright/test` 公共 API（`test.info()` / `test.step` / `test.step.skip` / `attach`）
- ✅ 铁律 4「向后兼容」：5 个 main-flow spec + README 调用方 0 改动
- ✅ 铁律 5「文档同步」：见下方文档同步条目

文档同步：
- 📝 本 CHANGELOG 追加 Phase 3 条目
- 📝 `docs/e2e-kit-index.md` §6 API 索引补 quantified / sceneIndex 真实签名（待更新）
- 📝 `docs/project-map.md` §14 reporter 状态从"待 Phase 3"改为"已迁移 / 已转发 / 0 改动"（待更新）

### Phase 4 · 自建 HTML Reporter 方案 F（已完成 · 静态验证通过 · 待用户运行时回归）

> ⚠️ **运行时回归状态**：本 Phase 完成所有代码 + 5 项静态链路验证（命名空间 / bridge 文件 / Playwright HtmlReporter 加载 / 类继承 / 推导工具）。真实 `npx playwright test` 运行时回归需用户在本地终端跑（参见下方"用户验收清单"）。

**核心成果**：以"方案 F + D1 + I1 + V2 + R1 + C1"组合落地自建 HTML Reporter——继承 Playwright 内置 HtmlReporter 全部 UI / 数据契约 / 交互，钩入 `onTestEnd` 把 quantified-reporter 产出的业务 JSON 自动作为 attachment 注入测试报告。

**关键技术发现**（决定了方案 F 的可行性）：
- Playwright 1.60+ 的 `playwright/package.json` exports 白名单**官方暴露** `./lib/runner` 入口（不是 hack 内部路径）
- `require('playwright/lib/runner').html` 直接得到 `{ default: HtmlReporter, showHTMLReport }`
- HtmlReporter 是 v2 reporter 协议的标准 class，`extends` 后覆盖 `onTestEnd` 即可注入业务 attachment
- 数据契约稳定：`report.json` schema 跨版本兼容，attachments 走 Playwright 标准 attachment 通道

包内新增（`packages/e2e-kit/lib/reporters/`）：
- ✨ `html-reporter.js`（268 行）：定义 `createEnhancedHtmlReporter(BaseHtmlReporter)` 工厂、`tryLoadPlaywrightHtml()` 探测器、`resolveHtmlReporter(opts)` 接入工厂、quantified JSON 路径推导工具
- ✨ `html-reporter-bridge.js`（48 行）：Playwright reporter 进程 require 的入口模块；运行时取 BaseHtmlReporter 生成增强类；require 失败时降级为占位 reporter（只 warning，不 crash）
- 🔄 `lib/reporters/index.js`：`html` 占位 → 真实 `require('./html-reporter')`，命名空间含 `resolveHtmlReporter` / `bridgePath` / `createEnhancedHtmlReporter` / `tryLoadPlaywrightHtml` / `_internal`

主仓库改造：
- 🔄 `playwright.config.js`：reporter 数组追加增强版 HTML reporter，与原 `['html', ...]` 并存
  - 原内置 → `playwright-report/<runStamp>/`
  - 增强版 → `playwright-report-enhanced/<runStamp>/`（同一份测试，两份 HTML，可一键对比）

业务数据注入机制（决策点 3 · I1）：
- `EnhancedHtmlReporter.onTestEnd(test, result)` 在父类 `super.onTestEnd` 把 result 序列化进 zip 之前，根据 `test.title`（提取 `TC-XXX-...` caseId）+ `test.location.file`（提取 sceneName）+ 自动扫 latest runStamp，定位 `<resultsRoot>/<runStamp>/<sceneName>/<caseId>.json`，作为 `application/json` attachment 推入 `result.attachments`
- 用户在 HTML UI 里能直接下载 `quantified.json`，里面是 quantified-reporter 采集的全部业务数据（步骤 / 蓝图 / 持久化快照 / 视觉证据 / console 事件 / pageerror / 网络失败）
- 推导失败时只警告**一次**（避免日志风暴），不影响测试主流程

降级与容错：
- 若 `require('playwright/lib/runner')` 失败（环境只装 `@playwright/test` 没装 `playwright` 顶级包）→ bridge 导出占位 reporter，所有钩子 noop，不抛错
- 若推导 quantified 路径失败 → 跳过该 test 的注入，仅在首次失败时打印一次警告
- 若读取 quantified JSON 失败 → 跳过 attach，不影响 HTML 生成

API 契约（消费方接入）：

```js
// playwright.config.js
const { reporters } = require('@tencent/e2e-kit');
module.exports = defineConfig({
  reporter: [
    ['list'],
    reporters.html.resolveHtmlReporter({
      outputFolder: 'playwright-report-enhanced',
      open: 'never',
      title: '我的项目 E2E 报告',
      attachQuantifiedJson: true,    // 默认 true
      resultsRoot: 'test-results',   // 默认 'test-results'
    }),
  ],
});
```

静态验证（已通过）：
- ✅ `reporters.html.resolveHtmlReporter()` 返回 `[bridgePath, opts]` 格式正确，bridgePath 真实存在
- ✅ `tryLoadPlaywrightHtml()` 在主仓库环境真实拿到 `HtmlReporter` class + `showHTMLReport` 函数
- ✅ bridge 导出的 EnhancedHtmlReporter 继承自 Playwright BaseHtmlReporter，version='v2'，钩子方法齐全
- ✅ 业务字段 `_e2eKitAttachQuantifiedJson` / `_e2eKitResultsRoot` 在构造时正确就位
- ✅ `resolveQuantifiedJsonPath` 工具能正确从 `test.title + test.location.file` 推导路径

用户运行时回归清单（手工执行）：
1. `npx playwright test tests/e2e/main-flow/header-i18n-toggle.spec.js` 跑一个 main-flow spec
2. 验证 `playwright-report/<runStamp>/index.html` 与 `playwright-report-enhanced/<runStamp>/index.html` 都生成
3. 在浏览器打开 `playwright-report-enhanced/<runStamp>/index.html`，找到该测试用例
4. 验证 attachments 区域有 `quantified.json`，下载查看内容是否含完整 step/screenshot/persistence 数据
5. 验证两份报告的 UI / 测试结果完全一致（增强版只是多了 attachment）

铁律审计：
- ✅ 铁律 1「包内 0 项目代码」：`html-reporter.js` 全文 grep `qidian|bqq.gtimg|main-flow|i18n` **0 命中**（推导工具用的是通用模式 `tests/e2e/<scene>/`，不绑定具体场景名）
- ✅ 铁律 2「零项目硬编码」：所有路径来自 opts / config.rootDir / 推导
- ✅ 铁律 3「Playwright 版本兼容」：通过官方 `./lib/runner` exports 白名单 require；require 失败时降级
- ✅ 铁律 4「向后兼容」：与原 `['html', ...]` reporter 并存，0 改动现有 spec
- ✅ 铁律 5「文档同步」：见下方文档同步条目

文档同步：
- 📝 本 CHANGELOG 追加 Phase 4 条目
- 📝 `docs/e2e-kit-index.md` §6.3 占位 → 真实 API（含接入示例 + 降级行为说明）
- 📝 `docs/project-map.md` §14 reporter 状态加上 HTML reporter 行

### Phase 5 · 切换 import 路径（已完成 · 待运行时回归）

> ⚠️ **运行时验证状态**：本 Phase 全部为代码层迁移 + 静态验证。待用户在 Node 18+ 跑 `npx playwright test` 后补充运行时回归记录。

**核心成果**：调用方 spec / config / reporter 的 import 路径全部切换到 `@tencent/e2e-kit/...`，主仓库纯转发桩物理删除。`_utils/` 与 `_reporters/` 仅留**含企点常量的适配层**与**企点专属业务测试代码**。

代码改动（4 个文件，5 处 require 切换）：
- 🔄 [playwright.config.js](../../playwright.config.js) L16：`require('./tests/e2e/_utils/run-context')` → `require('@tencent/e2e-kit/utils/run-context')`
- 🔄 [tests/e2e/header-i18n-toggle.spec.js](../../tests/e2e/header-i18n-toggle.spec.js) L27：`require('./_utils/run-context')` → `require('@tencent/e2e-kit/utils/run-context')`
- 🔄 [tests/e2e/_reporters/i18n-audit-reporter.js](../../tests/e2e/_reporters/i18n-audit-reporter.js) L19-20：双双切换为包路径（`classifyTranslation` / `getRunStamp`）
- 🔄 [tests/e2e/README.md](../../tests/e2e/README.md)：4 处示例代码（`wait-strategies` / `event-capture` 等）同步更新；目录约定措辞由"工厂级工具层"改为"企点专属适配层"

转发桩删除（5 个文件）：
- 🗑️ `tests/e2e/_utils/wait-strategies.js`
- 🗑️ `tests/e2e/_utils/run-context.js`
- 🗑️ `tests/e2e/_utils/visible-text.js`
- 🗑️ `tests/e2e/_utils/locale-event-capture.js`
- 🗑️ `tests/e2e/_reporters/scene-index-reporter.js`

> 实际由 `mv` 挪到 `.trash/phase5/` 暂存（受 shell 白名单限制 `rm` 不可用）；运行时回归通过后由用户 `rm -rf .trash` 一键清理。

主仓库剩余资产清单（**保持 0 改动**）：
- 🧩 `_utils/network-mocks.js`：企点接口 mock 适配层（`bqq.gtimg.com` / `mockHeaderApis` 等）
- 🧩 `_utils/persistence-helpers.js`：企点持久化适配层（`readI18nPersistence` / 企点 localStorage 键名常量等）
- 🧩 `_reporters/quantified-reporter.js`：企点 step-blueprints 默认值注入薄适配层
- ⛔ `_reporters/i18n-audit-reporter.js`：i18n 用例专属业务测试代码

新增目录索引（2 份）：
- 📝 `tests/e2e/_utils/README.md`：说明本目录在 Phase 5 后的定位、剩余文件性质、已迁移路径映射、新增工具决策树
- 📝 `tests/e2e/_reporters/README.md`：同上结构

兼容性验证（已通过）：
- ✅ 全仓库 grep 已删的 4 个 `_utils/*` 模块路径 → 仅在新建索引 README 的"已迁移路径表"和历史 CHANGELOG 出现，**无任何代码侧引用残留**
- ✅ 全仓库 grep `_reporters/scene-index-reporter` → 仅在新建索引 README 出现
- ✅ `quantified-reporter` 适配层依然正确 `require('@tencent/e2e-kit/reporters/quantified-reporter')`，5 个 main-flow spec + `_setup.js` + `scenarios.js` 0 改动
- ⏭️ 真实 e2e 运行时回归 → 待用户 `npx playwright test`

铁律审计：
- ⏭️ 铁律 1「包内 0 项目代码」：本 Phase 不涉及包内修改
- ⏭️ 铁律 2「零项目硬编码」：本 Phase 不涉及包内修改
- ⏭️ 铁律 3「Playwright 版本兼容」：本 Phase 不涉及包内修改
- ✅ 铁律 4「向后兼容」：调用方解构 import 与函数签名不变；`scenarios.js` / `_setup.js` / 5 个 main-flow spec 0 改动
- ✅ 铁律 5「文档同步」：见下方文档同步条目

文档同步：
- 📝 本 CHANGELOG 追加 Phase 5 条目
- 📝 `docs/e2e-kit-index.md` §5 路线图：Phase 5 状态 → "已完成 · 待运行时回归"
- 📝 `docs/project-map.md` §9.2 概要：进度表加 "Phase 5 import 路径切换 ✅"
- 📝 `docs/project-map.md` §14.1 表格：4 个删除文件标 🗑️、新增 2 份 README 索引
- 📝 主仓库 `tests/e2e/README.md`：示例代码 + 目录约定措辞更新

### Phase 6 · 清理（已完成 · 发包按用户决策暂缓）

> ⚠️ **本 Phase 仅做"清理"，发包动作完全暂停**（按用户决策："Phase 6 清理，打包先等等，然后我们开始调试细节"）。

**核心成果**：完成主仓库目录大整理。`@tencent/e2e-kit` = 通用能力（npm 包），`tests/e2e/_qidian/` = 企点专属适配层，**两者物理隔离 + 命名隔离**。任何后人维护代码时扫一眼目录就能精准定位"通用还是业务"。

**关键设计决策**：用户明确指示——**"通用流程意思就是不要放在 npm 包里"**——任何带企点常量（域名 / API 路径 / Cookie 键名 / 业务规则）的代码**绝不能**进 `@tencent/e2e-kit`。原 `_utils/` `_reporters/` 命名带"工厂层"暗示但实际只剩企点专属内容，**目录名实不符必须正名**。最终选择方案 X：建容器目录 `tests/e2e/_qidian/{utils,reporters}/`，旧目录整体删除。

物理迁移（4 个 .js + 2 份子 README + 1 份新顶级 README）：
- 🚚 `tests/e2e/_utils/network-mocks.js` → `tests/e2e/_qidian/utils/network-mocks.js`
- 🚚 `tests/e2e/_utils/persistence-helpers.js` → `tests/e2e/_qidian/utils/persistence-helpers.js`
- 🚚 `tests/e2e/_utils/README.md` → `tests/e2e/_qidian/utils/README.md`（同时按新位置重写内容）
- 🚚 `tests/e2e/_reporters/quantified-reporter.js` → `tests/e2e/_qidian/reporters/quantified-reporter.js`
- 🚚 `tests/e2e/_reporters/i18n-audit-reporter.js` → `tests/e2e/_qidian/reporters/i18n-audit-reporter.js`
- 🚚 `tests/e2e/_reporters/README.md` → `tests/e2e/_qidian/reporters/README.md`（同时按新位置重写内容）
- ✨ 新建 `tests/e2e/_qidian/README.md`：顶级索引，含设计意图、子目录速览、决策树、与 npm 包关系架构图

代码 import 改动（7 处）：
- 🔄 `tests/e2e/main-flow/_setup.js` L19, L24：`'../_utils/...'` → `'../_qidian/utils/...'`
- 🔄 `tests/e2e/main-flow/_shared/scenarios.js` L20：`'../../_utils/persistence-helpers'` → `'../../_qidian/utils/persistence-helpers'`
- 🔄 5 个 main-flow spec：`'../_reporters/quantified-reporter'` → `'../_qidian/reporters/quantified-reporter'`

文件头注释同步（3 个 .js）：
- 🔄 `network-mocks.js` / `persistence-helpers.js` / `quantified-reporter.js` 头部 `@file` JSDoc 注释路径更新

旧目录骨架清理：
- 🗑️ `tests/e2e/_utils/` 空目录 → 挪到 `.trash/phase6/`（`rm` 不在 shell 白名单，由用户本地一键 `rm -rf .trash` 清理）
- 🗑️ `tests/e2e/_reporters/` 空目录 → 同上

文档同步（5 份）：
- 📝 本 CHANGELOG 追加 Phase 6 段
- 📝 `docs/e2e-kit-index.md` §5：Phase 6 状态 → "✅ 清理已完成 · 发包按用户决策暂缓"；§7 Q3 FAQ 加 `_qidian/` 示例
- 📝 `docs/project-map.md` §9.2 概要 + §14.1 引语和表格全套更新（4 个迁入 `_qidian/` 的文件 + 1 个删除目录占位行）
- 📝 `docs/e2e/README.md` 表格：`tests/e2e/_utils/` `_reporters/` 行 → `_qidian/utils/` `_qidian/reporters/` + 新增 `packages/e2e-kit/` 行
- 📝 `tests/e2e/README.md` 大改：开头引语、目录结构图、persistence/quantified 示例代码全部切到 `_qidian/...` 路径

兼容性验证（已通过）：
- ✅ 全仓 grep `_utils/` `_reporters/` 在 `.js` `.json` 代码中 **0 命中**
- ✅ 7 个改动文件 lint 全绿（read_lints 返回 7 个空数组）
- ✅ 残留 `_utils/` `_reporters/` 提及仅在 `.md` 历史性描述中（迁移历史表 / 删除线占位 / 阶段性快照），均为合理保留
- ⏭️ 真实 e2e 运行时回归 → 待用户 `npx playwright test`

铁律审计：
- ⏭️ 铁律 1「包内 0 项目代码」：本 Phase 不涉及包内修改
- ⏭️ 铁律 2「零项目硬编码」：本 Phase 不涉及包内修改
- ⏭️ 铁律 3「Playwright 版本兼容」：本 Phase 不涉及包内修改
- ✅ 铁律 4「向后兼容」：调用方解构 import 与函数签名不变；`scenarios.js` / `_setup.js` / 5 个 main-flow spec 仅改了 require 路径
- ✅ 铁律 5「文档同步」：见上方"文档同步"

**发包动作**（暂停）：
- ⏸️ 申请内部 npm registry 发布权限
- ⏸️ 发布 `@tencent/e2e-kit@1.0.0`
- ⏸️ 主仓库 `package.json` 把 `"file:./packages/e2e-kit"` 改为 `"^1.0.0"`

> 用户决策：先进入「调试细节」阶段，发包动作未来另行启动。

### Phase 7 · 量化总览 HTML（已完成 · 方案 D3）

**问题背景**：Playwright 内置 HTML reporter 的 step 节点点击展开行为前端硬编码 `(step.steps.length || step.snippet)`，与 attachments 无关——`step.attach()` 挂的 `<stepId>.md` 只能从标题右侧 📎 跳转到 test 顶部 Attachments 区，无法在 step 节点内联展开。多次方案尝试（B1 关 snippet · B1.1 取消 box · C1 内嵌 inner step）后确认这是 PW HTML reporter 的设计限制。

**方案 D3 决策**：跳出 PW 框架，提供独立的 quantified-summary HTML — 左侧用例/步骤树 + 右侧 markdown 详情，单文件 self-contained。

**包内新增**：

- ✨ `lib/reporters/quantified-summary-reporter.js`：PW Reporter 实现 — onEnd 扫 `testResultsDir/<scene>/<caseId>.json`，内嵌 marked UMD + 全部数据，调用模板渲染 → 写 summary HTML
- ✨ `lib/reporters/quantified-summary-reporter-bridge.js`：PW reporter 桥接，同 `html-reporter-bridge.js` 模式
- ✨ `lib/reporters/_summary-template/summary.html`：HTML 骨架（含 4 个占位符：__INJECT_TITLE__ / CSS / MARKED / DATA / JS）
- ✨ `lib/reporters/_summary-template/summary.css`：深色主题样式（与 PW 报告一致），约 180 行
- ✨ `lib/reporters/_summary-template/summary.js`：原生 JS 渲染层 — 左侧用例树 / 右侧 markdown / 过滤栏（PASS/FAIL/SKIP）/ 关键词搜索 / 自动选中第一步，约 200 行
- ✨ `package.json` 加 `"dependencies": { "marked": "^18.0.0" }`（reporter 运行时通过 `require.resolve('marked/package.json')` 拿 UMD 路径，内嵌进 summary HTML）
- ✨ `lib/reporters/index.js` 命名空间导出 `quantifiedSummary`

**包内修改**：

- 🔧 `lib/reporters/quantified-reporter.js` — `finalize()` 给每个 step 注入 `detail` markdown 字段（用 `blueprintLookup.renderStepDetail`），让 quantified JSON 自完备，summary 直接读 detail 渲染
- 🔧 `lib/reporters/quantified-reporter.js` — `flushUISteps()` 撤销 C1 内嵌 inner step（PW 原生报告恢复扁平形态，避免"假展开"诱导用户）

**主仓库改造**：

- 🔧 `playwright.config.js` 加第 3 个 reporter 入口（list / html-enhanced / quantifiedSummary），title `企点 E2E 量化总览`，输出到 `playwright-report-enhanced/<runStamp>/quantified-summary.html`
- 🔧 主仓库 `package.json` 加 `marked@^18.0.4`（npm install 已写入）

**关键技术取舍**：

| 取舍 | 选择 | 拒绝 | 理由 |
|---|---|---|---|
| markdown 解析 | `marked@18`（NPM 标准依赖）| vendored .min.js | 不污染 git；npm 标准依赖管理 |
| 前端框架 | 原生 JS | React/Vue | 单文件 < 130KB；无构建；file:// 直接可开 |
| 数据传递 | `<script id="quantified-data" type="application/json">` 内嵌 | fetch JSON | file:// 下 fetch 跨域被阻塞；零网络依赖 |
| reporter 顺序 | 必须放最后 | 放中间 | 它要扫 quantified-reporter 已写盘的 JSON |

**静态验证（全通）**：

- ✅ `reporters` 命名空间含 `quantifiedSummary`
- ✅ `resolve()` 返回 `[bridgePath, opts]`，bridge 路径正确
- ✅ bridge 文件 `module.exports = QuantifiedSummaryReporter`（PW 兼容）
- ✅ `loadMarkedUmd()` 加载 marked.umd.js 42KB
- ✅ 空目录优雅降级（warn + skip 生成）
- ✅ Mock 数据端到端：1 个 case → 59KB HTML（含 marked + 模板 + 数据 + 全部 step.detail）
- ✅ 6 个改动文件 Lint 0 报错

**铁律审计**：
- ✅ 铁律 1「包内 0 项目代码」：reporter / 模板 / CSS / JS 全部业务无关，blueprintLookup 由调用方注入
- ✅ 铁律 2「零项目硬编码」：路径、标题、testResultsDir 全部从 opts 读取，无任何 "qidian/main-flow" 字样
- ✅ 铁律 3「Playwright 版本兼容」：仅用公开 Reporter 接口（onEnd / onTestEnd / onError），无 PW 内部 API 依赖
- ✅ 铁律 4「向后兼容」：纯增量 — 不接 quantifiedSummary 的项目零影响
- ✅ 铁律 5「文档同步」：CHANGELOG（本段）+ `docs/e2e-kit-index.md` Phase 7 段 + `docs/project-map.md` §9.2 reporter 链路图

**用户运行时回归**：
- ⏭️ `npx playwright test`
- ⏭️ 打开 `playwright-report-enhanced/<runStamp>/quantified-summary.html`
- ⏭️ 验证：左侧步骤树点击 → 右侧 markdown 详情完整渲染（含 # 标题 / 表格 / 列表 / 加粗 / 代码块）
- ⏭️ 验证：过滤栏 PASS/FAIL/SKIP 切换 + 关键词搜索


### 待启动

- 🔧 调试细节阶段（当前进行中，由用户驱动）
- Phase 4.x 增量（可选）：业务专属 tab 注入（决策点 3 的 I3 方案，覆盖 vendor `index.html` 添加业务面板）
- Phase 6 发包尾声：申请 npm 权限 + 发布 1.0.0 + 主仓库依赖切版本号（按用户决策暂缓）
