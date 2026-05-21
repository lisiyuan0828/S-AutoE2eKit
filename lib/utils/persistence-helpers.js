/**
 * 持久化读写工具（场景无关 · 工厂资产）
 *
 * 用途：统一 localStorage / sessionStorage / cookie / window 全局变量的读写 API
 *
 * 设计原则：
 *   1. 所有写操作必须**幂等**（多次写入结果一致）
 *   2. 所有读操作返回 null 而非抛错（便于断言"应该为空"）
 *   3. 提供"全清"原子方法，用于 beforeEach setup
 *   4. 所有需要 page.evaluate 的函数都退进 test.step 包裹中，
 *      避免 Playwright UI 渲染出 "Evaluate × N - persistence-helpers.js:N" 这种带
 *      红色 ^ 源码定位符的裸调用节点（看起来像报错但其实是成功的）。
 *   5. 业务无关：所有 key / 名称由调用方传入，包内不写死任何业务专属命名。
 */

const { test } = require('@playwright/test');

/**
 * 轻量包装器：在可能的情况下用 test.step 带上中文语义标题，
 * 不在 Playwright runner 上下文时退化为直接调用。
 *
 * box: true —— Playwright 官方 "盒装 step" 选项（1.39+）：
 *   - 把内部所有 page.evaluate / page.screenshot 等子 step 折叠到本 step 之内，
 *     不再单独显示成 "Evaluate — persistence-helpers.js:N" 这种指向 reporter 内部的位置。
 *   - 本 step 自身的 location 重定向到 spec 调用方（如 scenarios.js:198），导航更有意义。
 *   - 失败时错误位置也会冒泡到 spec 真实调用方，调试体验更好。
 */
async function withSemanticStep(title, fn) {
  try {
    return await test.step(title, fn, { box: true });
  } catch (e) {
    // 不在 Playwright runner 中（如独立跑 unit test）
    if (e && e.message && e.message.includes('test.step')) {
      return fn();
    }
    throw e;
  }
}

/**
 * 清空所有持久化（localStorage + sessionStorage + cookie）
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').BrowserContext} context
 */
async function clearAllPersistence(page, context) {
  return withSemanticStep('🧹 清空所有持久化（localStorage / sessionStorage / cookie）', async () => {
    await context.clearCookies();
    if (page && page.url() !== 'about:blank') {
      await page.evaluate(() => {
        try {
          window.localStorage.clear();
        } catch (_e) {
          /* noop */
        }
        try {
          window.sessionStorage.clear();
        } catch (_e) {
          /* noop */
        }
        // 兜底清 cookie
        document.cookie.split(';').forEach((c) => {
          const eq = c.indexOf('=');
          const name = (eq > -1 ? c.substr(0, eq) : c).trim();
          if (!name) return;
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${location.pathname}`;
        });
      });
    }
  });
}

/**
 * 在 page navigation 之前预置 localStorage（搭配 addInitScript）
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @param {Record<string,string>} kv
 */
async function presetLocalStorage(context, kv) {
  await context.addInitScript((data) => {
    try {
      Object.entries(data).forEach(([k, v]) => {
        window.localStorage.setItem(k, v);
      });
    } catch (_e) {
      /* noop */
    }
  }, kv);
}

/**
 * 在 page navigation 之前预置 cookie
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @param {Array<{name:string,value:string,domain?:string,path?:string}>} cookies
 * @param {string} fallbackUrl 用于推断 domain 的 URL
 */
async function presetCookies(context, cookies, fallbackUrl) {
  const url = new URL(fallbackUrl);
  const enriched = cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain ?? url.hostname,
    path: c.path ?? '/',
  }));
  await context.addCookies(enriched);
}

/**
 * 通用持久化读取器（业务无关）
 *
 * 由调用方声明要读哪些通道的哪些 key，本函数批量读出来。
 * 这是 i18n / 鉴权 / 主题 / 任何持久化场景的统一入口。
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} channels
 * @param {string[]} [channels.localStorage] LS key 列表
 * @param {string[]} [channels.sessionStorage] SS key 列表
 * @param {string[]} [channels.cookies] Cookie 名列表
 * @param {string[]} [channels.windowProps] window.<prop> 列表
 * @param {string|null} [channels.eventBuffer] 业务事件 buffer 的 window 变量名
 *                                              （如 '__E2E_LOCALE_EVENTS__'，传 null/不传 表示不读）
 * @param {string} [stepTitle] test.step 标题，可定制
 *
 * @returns {Promise<{
 *   localStorage: Record<string,string|null>,
 *   sessionStorage: Record<string,string|null>,
 *   cookies: Record<string,string|null>,
 *   windowProps: Record<string,*>,
 *   events: { count: number, last: any } | null,
 * }>}
 */
async function readPersistence(page, channels = {}, stepTitle = '📊 采集持久化通道') {
  return withSemanticStep(stepTitle, async () =>
    page.evaluate((cfg) => {
      const readCookie = (name) => {
        const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
        return m ? decodeURIComponent(m[1]) : null;
      };
      const out = {
        localStorage: {},
        sessionStorage: {},
        cookies: {},
        windowProps: {},
        events: null,
      };
      (cfg.localStorage || []).forEach((k) => {
        try {
          out.localStorage[k] = window.localStorage.getItem(k);
        } catch (_e) {
          out.localStorage[k] = null;
        }
      });
      (cfg.sessionStorage || []).forEach((k) => {
        try {
          out.sessionStorage[k] = window.sessionStorage.getItem(k);
        } catch (_e) {
          out.sessionStorage[k] = null;
        }
      });
      (cfg.cookies || []).forEach((name) => {
        out.cookies[name] = readCookie(name);
      });
      (cfg.windowProps || []).forEach((p) => {
        try {
          out.windowProps[p] = window[p] !== undefined ? window[p] : null;
        } catch (_e) {
          out.windowProps[p] = null;
        }
      });
      if (cfg.eventBuffer) {
        const buf = window[cfg.eventBuffer];
        if (Array.isArray(buf)) {
          out.events = { count: buf.length, last: buf[buf.length - 1] || null };
        } else {
          out.events = { count: 0, last: null };
        }
      }
      return out;
    }, channels),
  );
}

/**
 * 注入 navigator.language（避免本机系统语言污染业务侧的 i18n 兜底逻辑）
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string} lang 例如 'zh-CN' / 'en-US'
 */
async function injectNavigatorLanguage(context, lang) {
  await context.addInitScript((value) => {
    try {
      Object.defineProperty(window.navigator, 'language', {
        configurable: true,
        get: () => value,
      });
      Object.defineProperty(window.navigator, 'languages', {
        configurable: true,
        get: () => [value, value.split('-')[0]],
      });
    } catch (_e) {
      /* noop */
    }
  }, lang);
}

/**
 * 通用业务事件 buffer 注入器（业务无关）
 *
 * 在 BrowserContext 层注入：监听指定的 CustomEvent，把每次派发的内容
 * push 到 window[bufferKey] 数组里，供后续 readPersistence({ eventBuffer })
 * 或测试侧 page.evaluate 读取。
 *
 * 与 EventCapture（持久化到 localStorage）的区别：
 *   - installEventBuffer：内存层缓冲，reload 会清空 → 适合"单页内"事件计数
 *   - EventCapture：localStorage 缓冲，reload 不丢 → 适合跨 reload 事件追踪
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @param {object} opts
 * @param {string} opts.eventName 要监听的 CustomEvent 名（必填，无默认）
 * @param {string} opts.bufferKey window 上的 buffer 变量名（必填，无默认）
 * @param {(detail:any) => any} [opts.transform] 可选：把 evt.detail 映射成自定义结构
 */
async function installEventBuffer(context, opts) {
  const { eventName, bufferKey } = opts;
  if (!eventName || !bufferKey) {
    throw new Error('installEventBuffer: 必须传入 { eventName, bufferKey }');
  }
  await context.addInitScript(
    ({ name, key }) => {
      const installedFlag = '__E2E_BUFFER_INSTALLED__' + key;
      if (window[installedFlag]) return;
      window[installedFlag] = true;
      window[key] = [];
      window.addEventListener(name, (e) => {
        try {
          window[key].push({
            ts: Date.now(),
            detail: e && e.detail !== undefined ? e.detail : null,
          });
        } catch (_err) {
          /* noop */
        }
      });
    },
    { name: eventName, key: bufferKey },
  );
}

module.exports = {
  withSemanticStep,
  clearAllPersistence,
  presetLocalStorage,
  presetCookies,
  readPersistence,
  injectNavigatorLanguage,
  installEventBuffer,
};
