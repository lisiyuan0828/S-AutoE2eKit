/**
 * PW Reporter 桥接：把 QuantifiedSummaryReporter 暴露为 default export。
 *
 * Playwright 加载 reporter 时调 `require(path).default || require(path)`，
 * 所以 module.exports 必须是 class 本身。
 */

'use strict';

const { QuantifiedSummaryReporter } = require('./quantified-summary-reporter');

module.exports = QuantifiedSummaryReporter;
