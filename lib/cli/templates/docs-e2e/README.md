# E2E 测试业务文档

> 这个目录是 **auto-e2e skill** 用来理解你项目的"知识库"。
>
> 当你在 Claude / CodeBuddy 里说 "测一下登录流程"、"跑一遍下单"，skill 会读这里的 md 文件，
> 把里面的业务约定（账号、selectors、流程顺序、文案）翻译成可执行的 Playwright 步骤。

## 文件清单

| 文件 | 作用 | 何时改 |
| --- | --- | --- |
| [README.md](./README.md) | 入口（你在看） | 团队接入或重构时 |
| [auth.md](./auth.md) | 登录 / 鉴权 / 测试账号 | 登录流程变化、新增测试账号 |
| [flows.md](./flows.md) | 核心业务流程清单 | 新增功能、改主流程 |
| [selectors.md](./selectors.md) | 关键元素定位约定 | 改 UI 结构、统一 data-testid |
| [i18n.md](./i18n.md) | 多语言键值 / 文案 | 新增语种、改文案 |

## 写作原则

1. **少即是多**：写 skill 看得懂的关键信息，不要堆产品需求。
2. **能贴 selector 就贴**：`data-testid="login-submit"` 比 "登录按钮" 准确十倍。
3. **用真实账号**：测试环境账号写在 [auth.md](./auth.md) 里，密码用占位符（`$E2E_PASSWORD`）。
4. **分流程不分页面**：[flows.md](./flows.md) 按"用户要做的事"组织，不按"哪个 URL"组织。

## 与 skill 的契约

skill 读取顺序固定为：
1. `README.md` —— 拿到整体结构
2. `auth.md` —— 拿到登录怎么做
3. `flows.md` —— 拿到要测的流程
4. 用到时按需加载 `selectors.md` / `i18n.md`

所以**不要**改文件名；如需新增主题，加新文件并在本表格里登记。
