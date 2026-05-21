/**
 * 可见文本采集（场景无关 · 工厂资产）
 *
 * 用途：
 *   提取指定 scope 内所有可见文本节点，按 DOM 顺序、去重、过滤空白。
 *   用于 i18n 文案对照、A/B 视觉对比、辅助断言等场景。
 *
 * 过滤规则：
 *   1. 只取 TEXT_NODE
 *   2. 去除前后空白后非空
 *   3. 父元素 visibility != hidden && display != none && opacity > 0
 *   4. 父元素 BoundingRect 非空（width > 0 && height > 0）
 *   5. 同一文本仅保留首次出现
 *
 * 业务无关：classifyTranslation 是通用的"翻译完整度判断"逻辑，
 *           任何项目做中外文对照都能用，不绑定任何具体业务。
 */

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} selector scope CSS 选择器
 * @returns {Promise<string[]>}
 */
async function collectVisibleTexts(page, selector) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return [];
    const out = [];
    const seen = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const t = (node.textContent || '').trim();
      if (!t || seen.has(t)) continue;
      const el = node.parentElement;
      if (!el) continue;
      const cs = window.getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      seen.add(t);
      out.push(t);
    }
    return out;
  }, selector);
}

/**
 * 文案翻译状态分类（通用 i18n 工具）
 *
 * @param {string} zh 中文版本文案
 * @param {string} en 外文版本文案（可为空字符串表示缺失）
 * @returns {'✅ 已翻译' | '❌ 漏翻' | '⚠️ 部分翻译' | '⚠️ 缺失' | '⚪ 无需翻译'}
 */
function classifyTranslation(zh, en) {
  if (!en) return '⚠️ 缺失';
  if (zh === en) {
    if (/[\u4e00-\u9fa5]/.test(zh)) return '❌ 漏翻';
    return '⚪ 无需翻译';
  }
  if (/[\u4e00-\u9fa5]/.test(en)) return '⚠️ 部分翻译';
  return '✅ 已翻译';
}

module.exports = {
  collectVisibleTexts,
  classifyTranslation,
};
