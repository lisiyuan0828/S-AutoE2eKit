# 鉴权 / 登录

> 这个文件告诉 skill：**怎么登录、用什么账号、登录后怎么判断成功**。

## 1. 登录入口

- 登录页 URL：`/login`（相对 baseURL）
- 是否需要在每个用例前都登录：**是 / 否**（请二选一）
- 登录方式：账号密码 / 短信 / SSO / OAuth（请删除不适用的）

## 2. 测试账号

| 用途 | 账号 | 密码（环境变量） | 备注 |
| --- | --- | --- | --- |
| 普通用户 | `e2e-user@example.com` | `$E2E_USER_PASSWORD` | 可下单、不可管理 |
| 管理员 | `e2e-admin@example.com` | `$E2E_ADMIN_PASSWORD` | 全权限 |

> ⚠️ **不要** 在这里写真实密码。skill 会从环境变量读取（在 `.env.e2e` 或 CI secret 里配置）。

## 3. 登录流程（步骤）

```
1. goto /login
2. 在 [data-testid="email-input"]  填入 账号
3. 在 [data-testid="password-input"] 填入 密码
4. 点击 [data-testid="login-submit"]
5. 等待 URL 变为 /dashboard，且 [data-testid="user-menu"] 可见 ⇒ 登录成功
```

## 4. 退出 / 清理

- 退出按钮：`[data-testid="logout"]`
- 用例之间是否需要清理 cookie：**需要 / 不需要**

## 5. 已知坑（写给 skill）

- 第一次登录会跳到 `/welcome` 引导页，需要点击"跳过"再继续。
- SSO 模式下 `/login` 会 302，登录用例请直接 goto `/sso-mock-login`。
