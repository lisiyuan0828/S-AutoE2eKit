/**
 * 业务自定义事件捕获（场景无关 · 工厂资产）
 *
 * 解决问题：
 *   Playwright 在 reload 后，inline 注册的 page.on('console') 或
 *   evaluate 中 addEventListener 的监听器都会丢失。
 *   对于"reload 后才派发的事件"，必须靠 addInitScript 提前在每个新文档
 *   注入监听器，并把事件结构化地存到 localStorage，再由测试侧轮询读取。
 *
 * 业务无关：
 *   构造函数接受任意 CustomEvent 名称数组，**不绑定任何具体业务事件**。
 *   storageKey 也支持自定义，便于多个 EventCapture 实例共存。
 *
 * 用法：
 *   const cap = new EventCapture(['my-custom-event']);
 *   await cap.attach(context);     // 必须在 page.goto 之前
 *   await page.goto(...);          // navigation
 *   // ... 触发事件
 *   const events = await cap.collect(page, 'my-custom-event');
 */

const DEFAULT_STORAGE_KEY = '__e2e_captured_events__';

class EventCapture {
  /**
   * @param {string[]} eventNames 要捕获的 CustomEvent 名称列表
   * @param {{ storageKey?: string }} [opts]
   */
  constructor(eventNames, opts = {}) {
    this.eventNames = eventNames;
    this.storageKey = opts.storageKey || DEFAULT_STORAGE_KEY;
  }

  /**
   * 在 BrowserContext 层注入捕获器，所有后续新页面（含 reload）都会自动监听
   * @param {import('@playwright/test').BrowserContext} context
   */
  async attach(context) {
    await context.addInitScript(
      ({ key, names }) => {
        try {
          const push = (evt) => {
            try {
              const raw = window.localStorage.getItem(key);
              const arr = raw ? JSON.parse(raw) : [];
              arr.push({
                name: evt.type,
                detail: evt.detail !== undefined ? evt.detail : null,
                timestamp: Date.now(),
              });
              window.localStorage.setItem(key, JSON.stringify(arr));
            } catch (_e) {
              /* noop */
            }
          };
          names.forEach((name) => {
            window.addEventListener(name, push);
          });
        } catch (_e) {
          /* noop */
        }
      },
      { key: this.storageKey, names: this.eventNames },
    );
  }

  /**
   * 读取已捕获的事件
   * @param {import('@playwright/test').Page} page
   * @param {string} [filterName] 可选：只返回某一种事件
   */
  async collect(page, filterName) {
    return page.evaluate(
      ({ key, name }) => {
        try {
          const raw = window.localStorage.getItem(key);
          const arr = raw ? JSON.parse(raw) : [];
          return name ? arr.filter((e) => e.name === name) : arr;
        } catch (_e) {
          return [];
        }
      },
      { key: this.storageKey, name: filterName },
    );
  }

  /**
   * 清空已捕获事件（在用例之间重置）
   */
  async reset(page) {
    await page.evaluate((key) => {
      try {
        window.localStorage.removeItem(key);
      } catch (_e) {
        /* noop */
      }
    }, this.storageKey);
  }
}

// 旧名导出兼容（别名 STORAGE_KEY 指向默认 key），便于上层 require('@tencent/e2e-kit/utils/event-capture').STORAGE_KEY 使用
module.exports = {
  EventCapture,
  DEFAULT_STORAGE_KEY,
  STORAGE_KEY: DEFAULT_STORAGE_KEY, // 兼容旧调用
};
