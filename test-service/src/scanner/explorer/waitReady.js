'use strict';

/**
 * waitReady.js — Intelligent Page Readiness Check for e-Jatra Scanner
 *
 * Menunggu domcontentloaded, networkidle, jQuery.active === 0,
 * DataTables processing selesai, dan SweetAlert loading hilang.
 */

const { TIMEOUTS, SWAL_SELECTORS } = require('./explorerConfig');
const { safeWaitForLoadState, safeWaitForFunction } = require('../../utils/playwrightHelpers');

/**
 * Intelligent readiness check replacing fixed arbitrary timeouts.
 * Waits for networkidle, jQuery active AJAX counter === 0, and DataTables processing indicator to disappear.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} [timeoutMs=TIMEOUTS.WAIT_READY_DEFAULT]
 */
async function waitReady(page, timeoutMs = TIMEOUTS.WAIT_READY_DEFAULT) {
  try {
    await safeWaitForLoadState(page, 'domcontentloaded', { timeout: Math.min(timeoutMs, TIMEOUTS.DOM_CONTENT_WAIT) });
    await safeWaitForLoadState(page, 'networkidle', { timeout: Math.min(timeoutMs, TIMEOUTS.NETWORK_IDLE_SHORT) });

    await safeWaitForFunction(
      page,
      ({ swalLoadingSel }) => {
        const jqueryDone = !window.jQuery || window.jQuery.active === 0;
        const dtProcessing = !document.querySelector('.dataTables_processing:not([style*="display: none"])');
        const swalLoading = !document.querySelector(swalLoadingSel);
        return jqueryDone && dtProcessing && swalLoading;
      },
      { swalLoadingSel: SWAL_SELECTORS.LOADING },
      { timeout: Math.min(timeoutMs, TIMEOUTS.DOM_CONTENT_WAIT) }
    );
  } catch {
    // Soft catch to prevent scanner halt on slow network/background polling
  }
  await page.waitForTimeout(TIMEOUTS.READY_SETTLE);
}

module.exports = {
  waitReady,
};
