# 关键元素定位约定

> 这个文件告诉 skill：**项目里关键元素如何稳定定位**。
>
> 优先级（强 → 弱）：`data-testid` ＞ `role + name` ＞ 文本 ＞ CSS class。
> **请不要**用 `:nth-child()` 这种位置选择器——它会随 UI 调整随机失败。

## 1. 全局约定

- 所有可交互的关键元素都应该带 `data-testid`，命名规则：`<scope>-<element>`，例如 `login-submit` / `cart-item`。
- 表单输入框：`data-testid="<field-name>-input"`，例如 `email-input`。
- 操作按钮：`data-testid="<verb>-<noun>"`，例如 `confirm-order`、`add-to-cart`。

## 2. 已登记的关键 selector

| 元素 | selector | 出现位置 |
| --- | --- | --- |
| 登录账号输入 | `[data-testid="email-input"]` | `/login` |
| 登录密码输入 | `[data-testid="password-input"]` | `/login` |
| 登录提交按钮 | `[data-testid="login-submit"]` | `/login` |
| 用户菜单入口 | `[data-testid="user-menu"]` | 全局头部 |
| 退出登录 | `[data-testid="logout"]` | 用户菜单 |
| 购物车列表项 | `[data-testid="cart-item"]` | `/cart` |
| 结算按钮 | `[data-testid="checkout-btn"]` | `/cart` |
| 订单号 | `[data-testid="order-no"]` | `/order/success` |

## 3. 等待策略

- 进页面后默认 `waitFor: 'load'`；若有 SPA 路由，改 `waitForSelector('[data-testid=page-ready]')`。
- 异步加载列表：等 `[data-testid="<list>-loaded"]` 出现，而不是固定 `setTimeout`。

## 4. 反例（请勿这样写）

```
❌ page.locator('button.btn.btn-primary')          // class 容易随主题改
❌ page.locator('div:nth-child(3) > button')        // 位置 fragile
❌ page.getByText('登录')                           // 多语言下会断
✅ page.locator('[data-testid="login-submit"]')    // 稳定
```
