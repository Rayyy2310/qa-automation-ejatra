'use strict';

/**
 * click/postClick.js — Post-Click Stabilization & Outcome Handlers
 *
 * Menangani stabilisasi halaman setelah klik berhasil:
 * A. Submit / Login -> tunggu redirect halaman-utama atau konfirmasi dialog Simpan
 * B. Print / Report -> kelola tab cetak baru atau buka URL cetak di tab baru
 * C. Navigasi href -> pastikan perpindahan URL selesai
 * D. Transisi UI dinamis -> tab switch, modal trigger, generate data, atau jeda singkat
 */

const { dismissSwalOnLogin, confirmSaveDialog } = require('../dialogConfirmHandler');
const { resolveUrl } = require('../../../utils/urlHelper');
const { TIMEOUTS, SWAL_SELECTORS } = require('../../../utils/constants');
const { exists, safeEvaluate } = require('../../../utils/playwrightHelpers');
const appProfile = require('../../../utils/appProfile');
const {
  isLoginPageUrl,
  isSaveIntent,
  anticipatesValidationError,
  isPrintOrReportIntent,
  isTabSwitchIntent,
  isModalTriggerIntent,
} = require('./intent');

/**
 * Jalur A: Penanganan pasca-klik tombol Login atau Simpan/Submit.
 */
async function handleLoginOrSaveOutcome(ctx) {
  const { page } = ctx;

  if (isLoginPageUrl(page.url())) {
    try {
      await Promise.race([
        page.waitForURL(url => {
          const path = url.pathname;
          return path.includes('halaman-utama') || path.includes('dashboard') ||
                 (path !== '/' && !path.includes('masuk'));
        }, { timeout: 10000 }),
        page.locator(appProfile.get('loginForm', 'form')).waitFor({ state: 'detached', timeout: 10000 }),
      ]);
    } catch {
      const errorText = await safeEvaluate(page, () => {
        const toast = document.querySelector('.jq-toast-single, .toast, .alert, .invalid-feedback');
        if (toast?.innerText) return toast.innerText.trim();
        const userErr = document.getElementById('username_error');
        if (userErr?.innerText) return userErr.innerText.trim();
        const passErr = document.getElementById('password_error');
        if (passErr?.innerText) return passErr.innerText.trim();
        return null;
      }, undefined, null);

      if (isLoginPageUrl(page.url())) {
        throw new Error(
          `Login gagal! ${errorText ? 'Pesan: ' + errorText : 'Halaman tidak berhasil masuk ke halaman-utama.'}`
        );
      }
    }

    await dismissSwalOnLogin(page);
    await page.waitForTimeout(TIMEOUTS.FAST);
    return;
  }

  if (isSaveIntent(ctx.targetStr, ctx.valStr) && !anticipatesValidationError(ctx.expStr)) {
    await confirmSaveDialog(page, ctx.step);
  }

  await page.waitForTimeout(TIMEOUTS.MEDIUM);
}

/**
 * Jalur B: Penanganan klik cetak / print / laporan (termasuk multi-tab).
 * Mengembalikan true jika navigasi tab cetak sudah ditangani.
 */
async function handlePrintOrReportTabOutcome(ctx, href) {
  const { page } = ctx;
  if (!isPrintOrReportIntent(ctx.targetStr, ctx.valStr)) return false;

  await page.waitForTimeout(TIMEOUTS.MEDIUM);
  const allPages = page.context().pages();
  if (allPages.length > 1) {
    const latestPage = allPages[allPages.length - 1];
    await latestPage.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    await latestPage.bringToFront().catch(() => {});
    return true;
  }

  if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
    const printUrl = resolveUrl(ctx.baseUrl, href);
    const newTab = await page.context().newPage();
    await newTab.goto(printUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await newTab.bringToFront().catch(() => {});
    return true;
  }

  return false;
}

/**
 * Jalur C: Navigasi via atribut href nyata jika URL halaman belum berpindah.
 */
async function handleHrefNavigationOutcome(ctx, href, initialUrl) {
  const { page } = ctx;
  if (!href || href.startsWith('#') || href.startsWith('javascript:')) return false;

  await page.waitForTimeout(TIMEOUTS.SETTLE);
  if (page.url() === initialUrl) {
    await page.goto(resolveUrl(ctx.baseUrl, href), { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.NAVIGATION }).catch(() => {});
  }
  await page.waitForLoadState('domcontentloaded', { timeout: 4000 }).catch(() => {});
  return true;
}

/**
 * Jalur D: Stabilisasi transisi UI dinamis (perpindahan tab, kemunculan modal, generate data, atau jeda default).
 */
async function handleDynamicUiOutcome(ctx, href) {
  const { page, targetStr, valStr } = ctx;

  if (isTabSwitchIntent(targetStr, valStr, href)) {
    await page.waitForSelector('.tab-pane.active, .tab-pane.show, [role="tabpanel"].active', { timeout: 2000 }).catch(() => {});
    await page.waitForFunction(() => {
      const ajaxSettled = typeof window.jQuery === 'undefined' || window.jQuery.active === 0;
      const notProcessing = !document.querySelector('.dataTables_processing:not([style*="display: none"])');
      return ajaxSettled && notProcessing;
    }, { timeout: TIMEOUTS.LONG }).catch(() => {});
    await page.waitForTimeout(TIMEOUTS.SHORT);
    return;
  }

  if (isModalTriggerIntent(targetStr, valStr)) {
    const modalAppeared = await page.waitForSelector(
      SWAL_SELECTORS.MODAL_OR_SWAL_SHOWN,
      { timeout: 2500 }
    ).catch(() => null);

    if (modalAppeared) {
      await page.waitForTimeout(TIMEOUTS.MODAL_SETTLE);
      return;
    }
  }

  if (targetStr.includes('generate') || valStr.includes('generate')) {
    await page.waitForFunction(() =>
      (typeof window.jQuery !== 'undefined' && window.jQuery.active === 0) ||
      Boolean(document.querySelector('.dataTable, table')),
      { timeout: TIMEOUTS.NAVIGATION }
    ).catch(() => {});
    await page.waitForTimeout(TIMEOUTS.GENERATE_SETTLE);
    return;
  }

  await page.waitForTimeout(TIMEOUTS.TINY);
}

/**
 * Stabilisasi pasca-klik sesuai konteks langkah.
 *
 * @param {object} ctx - Objek konteks klik bersama
 * @param {string|null} href
 * @param {string} initialUrl
 */
async function handlePostClickBehavior(ctx, href, initialUrl) {
  if (ctx.isSubmitOrLogin) {
    await handleLoginOrSaveOutcome(ctx);
    return;
  }

  if (await handlePrintOrReportTabOutcome(ctx, href)) return;
  if (await handleHrefNavigationOutcome(ctx, href, initialUrl)) return;

  await handleDynamicUiOutcome(ctx, href);
}

module.exports = {
  handlePostClickBehavior,
};
