/**
 * 等待策略库（场景无关 · 工厂资产）
 *
 * 用途：把 5+ 种异步等待姿势收敛为统一 API，避免每条 spec 重新发明轮子。
 *
 * 6 种代号：
 *   VIS  - 等元素可见（DOM mount）
 *   TXT  - 等元素文本变成预期值
 *   CNT  - 等元素数量等于预期值（常用于负向断言）
 *   RES  - 等单个网络请求返回（按 url 匹配）
 *   NAV  - 等整页导航完成（reload / goto 后）
 *   EVT  - 等业务自定义事件派发（任意 CustomEvent 名称，由调用方传入）
 *
 * 设计原则：
 *   1. 所有策略都暴露 timeout 选项，默认 10s
 *   2. 所有策略都返回值或 Locator，可链式
 *   3. 不引入 Playwright 之外的依赖
 *   4. 业务无关：waitEvent 接受任意事件名，不绑定任何具体业务事件
 */

const { expect } = require('@playwright/test');

const DEFAULT_TIMEOUT = 10_000;

/**
 * VIS - 等元素可见
 * @param {import('@playwright/test').Page} page
 * @param {string} selector
 * @param {{ timeout?: number }} [opts]
 */
async function waitVisible(page, selector, opts = {}) {
  const locator = page.locator(selector);
  await expect(locator).toBeVisible({ timeout: opts.timeout ?? DEFAULT_TIMEOUT });
  return locator;
}

/**
 * TXT - 等元素文本等于预期
 */
async function waitText(page, selector, expectedText, opts = {}) {
  const locator = page.locator(selector);
  await expect(locator).toHaveText(expectedText, { timeout: opts.timeout ?? DEFAULT_TIMEOUT });
  return locator;
}

/**
 * CNT - 等元素数量等于预期（常用于"应不存在"的负向断言）
 */
async function waitCount(page, selector, expectedCount, opts = {}) {
  const locator = page.locator(selector);
  await expect(locator).toHaveCount(expectedCount, { timeout: opts.timeout ?? DEFAULT_TIMEOUT });
  return locator;
}

/**
 * RES - 等单个网络请求返回
 * @param {import('@playwright/test').Page} page
 * @param {string|RegExp|((res:any)=>boolean)} matcher
 */
async function waitResponse(page, matcher, opts = {}) {
  return page.waitForResponse(matcher, { timeout: opts.timeout ?? DEFAULT_TIMEOUT });
}

/**
 * NAV - 等整页导航完成
 */
async function waitNavigation(page, opts = {}) {
  await page.waitForLoadState(opts.state ?? 'load', { timeout: opts.timeout ?? 30_000 });
}

/**
 * EVT - 等业务自定义事件
 *
 * ⚠️ 注意：因为 reload 会清空 inline 监听器，本工具搭配 EventCapture 使用，
 * 在 addInitScript 中预先注册监听并把事件持久化到 localStorage，本函数轮询读取。
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} eventName 事件名，由调用方决定（不绑定任何具体业务）
 * @param {{ timeout?: number, storageKey?: string }} [opts]
 *   storageKey: 自定义事件 buffer 的 localStorage key，默认 '__e2e_captured_events__'
 *               与 EventCapture 的 STORAGE_KEY 保持一致即可
 */
async function waitEvent(page, eventName, opts = {}) {
  const timeout = opts.timeout ?? DEFAULT_TIMEOUT;
  const storageKey = opts.storageKey ?? '__e2e_captured_events__';
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const captured = await page.evaluate(
      ({ key, name }) => {
        try {
          const raw = window.localStorage.getItem(key);
          const arr = raw ? JSON.parse(raw) : [];
          return arr.filter((e) => e.name === name);
        } catch (_e) {
          return [];
        }
      },
      { key: storageKey, name: eventName },
    );
    if (captured.length > 0) return captured;
    await page.waitForTimeout(100);
  }
  throw new Error(`waitEvent: 超时 ${timeout}ms 未捕获到事件 "${eventName}"`);
}

module.exports = {
  DEFAULT_TIMEOUT,
  waitVisible,
  waitText,
  waitCount,
  waitResponse,
  waitNavigation,
  waitEvent,
};
