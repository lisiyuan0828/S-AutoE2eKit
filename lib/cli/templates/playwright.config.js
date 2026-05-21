/**
 * playwright.config.js · s-auto-e2e-kit 默认模板
 *
 * 这份 config 由 `npx s-auto-e2e-kit init` 生成。
 * 你可以自由修改 —— 之后再次跑 init 不会覆盖（除非 --force）。
 *
 * 设计要点：
 *   - 默认只跑 chromium 单浏览器，跑得快；要跨浏览器解开下面 firefox/webkit
 *   - reporter 同时输出 list（终端）+ html（HTML 报告，npm run e2e:report 打开）
 *   - testDir 默认 e2e/，可改
 *   - baseURL 由 init 时探测得到（vite=5173 / next=3000 / webpack=8080）
 *   - webServer 注释掉，需要时打开自动起本地 dev
 *
 * 文档：https://playwright.dev/docs/test-configuration
 */

// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '__TEST_DIR__',
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: process.env.E2E_BASE_URL || '__BASE_URL__',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10 * 1000,
    navigationTimeout: 15 * 1000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // 解开下面两个 project 即可在 firefox / webkit 上也跑
    // { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    // { name: 'webkit',  use: { ...devices['Desktop Safari']  } },
  ],

  // 需要 init 自动跑你的 dev server 时解开这一段：
  // webServer: {
  //   command: '__DEV_COMMAND__',
  //   url: '__BASE_URL__',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120 * 1000,
  // },
});
