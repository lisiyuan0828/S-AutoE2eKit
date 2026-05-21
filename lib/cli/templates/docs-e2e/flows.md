# 核心业务流程

> 这里登记**用户要做的事**，每个流程一段，skill 会按这里的描述生成测试。
>
> 写作风格：动词开头、一句一步、能贴 selector 就贴。

---

## 流程 1：登录后查看个人主页

**前置**：已登录（见 [auth.md](./auth.md)）。

```
1. goto /dashboard
2. 期望 [data-testid="user-name"] 文本不为空
3. 期望 [data-testid="welcome-banner"] 可见
```

**断言**：进入个人主页 1 秒内 [data-testid="user-name"] 出现。

---

## 流程 2：（占位）下单

**前置**：已登录、购物车非空。

```
1. goto /cart
2. 期望购物车列表 [data-testid="cart-item"] 至少 1 项
3. 点击 [data-testid="checkout-btn"]
4. 选择默认地址（点 [data-testid="address-default"]）
5. 选择支付方式（点 [data-testid="pay-method-balance"]）
6. 点击 [data-testid="confirm-order"]
7. 期望 URL 跳转到 /order/success
8. 期望 [data-testid="order-no"] 文本以 "ORD" 开头
```

**断言**：订单号生成、跳转成功、3 秒内完成。

---

## 流程 3：（占位）退出登录

```
1. 在任意已登录页面点击 [data-testid="user-menu"]
2. 点击 [data-testid="logout"]
3. 期望 URL 变为 /login
4. 期望 cookie 中不再含 SESSION_ID
```

---

## 写新流程的模板

复制下面这一段到本文件最下方填空，skill 就能直接读懂：

```
## 流程 N：<一句话标题>

**前置**：<进入流程前页面状态、登录态、数据准备>

```
1. <动作>
2. <动作>
...
```

**断言**：<怎么算成功>
```
