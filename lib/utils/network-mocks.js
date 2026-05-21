/**
 * 通用网络 mock（场景无关 · 工厂资产）
 *
 * 用途：
 *   把"测试时不希望被业务接口阻塞"的 mock 规则抽象成通用引擎。
 *   包内**不绑定任何具体业务接口或域名**，所有 url pattern / 响应体由调用方传入。
 *
 * 设计：
 *   - 三个原语：mockJson / applyMockRules / silenceStaticResources
 *   - 业务侧（如企点适配层）基于这三个原语组装出"项目专属"的 mock 工厂
 *
 * 修订记录：
 *   v0.1.0 2026-05-18 包化首版（拆通用 vs 业务，业务部分回主仓库适配层）
 */

/**
 * 通用 fulfill 工具：按 url pattern 返回固定 JSON（最常用）
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string|RegExp} urlPattern Playwright route 支持的 URL 模式
 * @param {*} body 任意可 JSON.stringify 的对象
 * @param {number} [status] HTTP 状态码，默认 200
 */
async function mockJson(context, urlPattern, body, status = 200) {
  await context.route(urlPattern, (route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    }),
  );
}

/**
 * 批量按规则 fulfill / abort / fallback
 *
 * 一次性注册多条规则，比手写 for + context.route 更紧凑，且能在 rules 数组里
 * 看清整个项目的 mock 全貌。
 *
 * 命中优先级：Playwright 是后注册的优先，本函数按 rules 数组顺序依次注册，
 * 因此**靠后**的规则会拦截**靠前**规则覆盖范围内的请求（与原生行为一致）。
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @param {Array<{
 *   pattern: string|RegExp,
 *   action: 'fulfill' | 'abort' | 'fallback',
 *   response?: { status?: number, contentType?: string, body?: string|Buffer, headers?: Record<string,string> },
 *   abortReason?: string,
 *   condition?: (request: import('@playwright/test').Request) => boolean,
 * }>} rules
 */
async function applyMockRules(context, rules) {
  for (const rule of rules) {
    const { pattern, action, response, abortReason, condition } = rule;
    await context.route(pattern, (route) => {
      const req = route.request();
      // 命中后再做条件二次过滤；不满足条件则继续 fallback
      if (typeof condition === 'function' && !condition(req)) {
        return route.fallback();
      }
      if (action === 'fulfill') {
        return route.fulfill({
          status: response?.status ?? 200,
          contentType: response?.contentType ?? 'application/json',
          body: response?.body ?? '',
          headers: response?.headers,
        });
      }
      if (action === 'abort') {
        return route.abort(abortReason || 'failed');
      }
      // fallback
      return route.fallback();
    });
  }
}

/**
 * 静态资源静默化通用工厂
 *
 * 在指定的跨域域名集合上，仅 abort 图片/字体/媒体等静态资源；其他
 * （JS / CSS / XHR 等可能影响业务渲染的资源）一律 fallback 走默认网络。
 *
 * ⚠️ 经验：很多 CDN 域名同时承载"业务依赖的 JS/CSS"和"页面装饰图片"。
 *    所以**不能**按域名一刀切 abort，必须按 resourceType 过滤。
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string[]} domains Playwright route glob 列表，如 ['**\/cdn.example.com/**']
 * @param {string[]} [resourceTypes] 要静默的资源类型，默认 ['image','font','media']
 */
async function silenceStaticResources(context, domains, resourceTypes) {
  const types = new Set(resourceTypes && resourceTypes.length ? resourceTypes : ['image', 'font', 'media']);
  for (const pattern of domains || []) {
    await context.route(pattern, (route) => {
      const req = route.request();
      if (types.has(req.resourceType())) {
        return route.abort('blockedbyclient');
      }
      return route.fallback();
    });
  }
}

module.exports = {
  mockJson,
  applyMockRules,
  silenceStaticResources,
};
