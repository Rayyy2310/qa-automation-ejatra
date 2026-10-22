'use strict';

/**
 * click/modalScope.js — Modal & Active Tab Locator Scoping
 *
 * Menjamin klik selalu diarahkan ke elemen di dalam kontainer aktif:
 * - Jika modal tidak terbuka tapi locator menunjuk ke tab tidak aktif -> re-scope ke .tab-pane.active
 * - Kasus A: Modal terbuka & activeLocator berada di luar modal -> re-scope ke dalam modal
 * - Kasus B: Modal terbuka & activeLocator masih null -> jalankan aturan tabel MODAL_FALLBACK_RULES secara berurutan
 */

const { TIMEOUTS, SWAL_SELECTORS, CLICK_TEXT_SELECTORS } = require('../../../utils/constants');
const { stripActionFluff } = require('../../../utils/locatorResolver');
const { exists, existsAndVisible, safeEvaluate } = require('../../../utils/playwrightHelpers');
const appProfile = require('../../../utils/appProfile');

const MODAL_CONFIRM_KEYWORDS = [
  'tambah', 'simpan', 'ok', 'confirm', 'submit',
  'verif', 'approve', 'setuju', 'konfirmasi', 'ya',
];

const MODAL_CLOSE_KEYWORDS = [
  'x', '×', 'silang', 'batal', 'cancel', 'tutup', 'close', 'dismiss',
];

const MODAL_CHECKBOX_KEYWORDS = ['checkbox', 'centang', 'agree', 'meninjau'];

const MODAL_HEADER_CLOSE_SELECTORS = [
  '[data-bs-dismiss="modal"]',
  '[data-dismiss="modal"]',
  '.btn-close',
  '.modal-header .close',
  'button.close',
  'a.close',
  '.close',
  'button[aria-label*="close" i]',
  'button[aria-label*="tutup" i]',
  'button:has-text("×")',
  'button:has-text("✕")',
  'button:has(.fa-times)',
  'button:has(.bi-x)',
  'button:has(.fa-close)',
].join(', ');

const MODAL_FOOTER_CLOSE_SELECTORS = [
  ...CLICK_TEXT_SELECTORS.MODAL_FOOTER_CLOSE_BUTTONS,
  SWAL_SELECTORS.CANCEL,
  SWAL_SELECTORS.CLOSE,
  '.modal-footer button.btn-secondary',
  '.modal-footer .btn-default',
  '.modal-footer button',
].join(', ');

/**
 * Tabel aturan fallback saat modal terbuka & activeLocator masih null (Fase 6).
 * Urutan aturan dipertahankan 100% identik dengan rantai if/else asli:
 *  1. Confirm / Simpan / Verifikasi / Approve / Tambah / Ya
 *  2. Close / Tutup / Batal / Silang (X)
 *  3. Checkbox persetujuan di dalam modal
 *  4. Tombol Pilih di dalam modal
 */
const MODAL_FALLBACK_RULES = [
  {
    name: 'confirm',
    match: (lowerClean) => MODAL_CONFIRM_KEYWORDS.some(k => lowerClean.includes(k)),
    selectors: () => [
      SWAL_SELECTORS.CONFIRM,
      ...appProfile.get('specialActionButtons', []),
      ...CLICK_TEXT_SELECTORS.MODAL_CONFIRM_BUTTONS,
    ].join(', '),
  },
  {
    name: 'close',
    match: (lowerClean) =>
      lowerClean === 'x' ||
      lowerClean === '×' ||
      MODAL_CLOSE_KEYWORDS.some(k => lowerClean.includes(k)),
    selectors: (lowerClean) => {
      const wantsHeaderX =
        lowerClean === 'x' ||
        lowerClean === '×' ||
        lowerClean.includes('silang') ||
        lowerClean.includes('atas') ||
        lowerClean.includes('btn-close');
      return wantsHeaderX
        ? `${MODAL_HEADER_CLOSE_SELECTORS}, ${MODAL_FOOTER_CLOSE_SELECTORS}`
        : `${MODAL_FOOTER_CLOSE_SELECTORS}, ${MODAL_HEADER_CLOSE_SELECTORS}`;
    },
  },
  {
    name: 'checkbox',
    match: (lowerClean) => MODAL_CHECKBOX_KEYWORDS.some(k => lowerClean.includes(k)),
    selectors: () => {
      const agreeCbSel = appProfile.get('confirmAgreeCheckbox', 'input[type="checkbox"]');
      return `input[type="checkbox"], ${agreeCbSel}, .form-check-input`;
    },
  },
  {
    name: 'pick',
    match: (lowerClean) => lowerClean === 'pilih' || lowerClean.includes('pilih'),
    selectors: () => [
      ...appProfile.get('modalPickButtons', []),
      appProfile.get('modalPickButtonSelector', 'button[class*="pick"]'),
      CLICK_TEXT_SELECTORS.MODAL_PICK_SIMPLE_BUTTON,
    ].join(', '),
  },
];

/**
 * Jika tidak ada modal terbuka tetapi locator berada di dalam tab yang tidak aktif,
 * cari kandidat dengan teks yang sama di dalam tab yang sedang aktif.
 */
async function rescopeInactiveTabLocator(page, activeLocator, rawTarget) {
  if (!activeLocator || typeof activeLocator.evaluate !== 'function') {
    return activeLocator;
  }

  const isInsideInactiveTab = await safeEvaluate(activeLocator, el => {
    const pane = el.closest('.tab-pane, [role="tabpanel"]');
    return Boolean(pane && !pane.classList.contains('active') && !pane.classList.contains('show'));
  });

  if (!isInsideInactiveTab) return activeLocator;

  const activeTabLoc = page.locator('.tab-pane.active, .tab-pane.show, [role="tabpanel"].active').first();
  if (await exists(activeTabLoc)) {
    const cleanTarget = stripActionFluff(rawTarget);
    const tabCandidate = activeTabLoc.locator(
      `button:has-text("${cleanTarget}"), a:has-text("${cleanTarget}"), .btn:has-text("${cleanTarget}"), input[value*="${cleanTarget}" i]`
    ).first();
    if (await existsAndVisible(tabCandidate)) {
      return tabCandidate;
    }
  }

  return activeLocator;
}

/**
 * Kasus A: activeLocator sudah ditemukan, tetapi berada di luar modal yang sedang aktif.
 */
async function rescopeOutsideModalLocator(page, activeModalLoc, cleanTarget, lowerClean) {
  const modalPickSels = appProfile.get('modalPickButtons', []);
  const pickBtnSel    = appProfile.get('modalPickButtonSelector', 'button[class*="pick"]');

  if (lowerClean === 'pilih' || lowerClean.includes('pilih') ||
      lowerClean.includes('select') || lowerClean.includes('choose')) {
    return activeModalLoc.locator([
      ...modalPickSels,
      pickBtnSel,
      ...CLICK_TEXT_SELECTORS.MODAL_PICK_TABLE_BUTTONS,
    ].join(', ')).first();
  }

  let rowMatch = activeModalLoc.locator(`tr:has-text("${cleanTarget}")`).first();
  if (!(await exists(rowMatch))) {
    const modalSearchSel = appProfile.get('modalSearchInput', 'input[type="search"]:visible');
    const modalSearch = activeModalLoc.locator(
      `${modalSearchSel}, input[type="search"]:visible, input.form-control-sm:visible`
    ).first();
    if (await existsAndVisible(modalSearch)) {
      await modalSearch.fill(cleanTarget);
      await modalSearch.press('Enter').catch(() => {});
      await page.waitForTimeout(TIMEOUTS.SEARCH_SETTLE);
      rowMatch = activeModalLoc.locator(`tr:has-text("${cleanTarget}")`).first();
    }
  }

  if (await exists(rowMatch)) {
    return rowMatch.locator([
      ...modalPickSels,
      pickBtnSel,
      ...CLICK_TEXT_SELECTORS.MODAL_PICK_ROW_BUTTONS,
    ].join(', ')).first();
  }

  return activeModalLoc.locator(
    `button:has-text("${cleanTarget}"), a:has-text("${cleanTarget}"), ` +
    `input[type="submit"][value*="${cleanTarget}" i], .btn:has-text("${cleanTarget}")`
  ).first();
}

/**
 * Kasus B: activeLocator bernilai null sementara modal sedang terbuka (table-driven rules).
 */
function discoverModalFallbackLocator(activeModalLoc, lowerClean) {
  for (const rule of MODAL_FALLBACK_RULES) {
    if (rule.match(lowerClean)) {
      return activeModalLoc.locator(rule.selectors(lowerClean)).first();
    }
  }
  return null;
}

/**
 * Re-scope locator ke dalam modal aktif atau tab aktif.
 *
 * @param {object} ctx - Objek konteks klik bersama
 * @param {import('@playwright/test').Locator|null} activeLocator
 * @returns {Promise<import('@playwright/test').Locator|null>}
 */
async function enforceModalScope(ctx, activeLocator) {
  const { page, rawTarget, isModalOpen, activeModalLoc } = ctx;

  if (!isModalOpen) {
    return rescopeInactiveTabLocator(page, activeLocator, rawTarget);
  }

  const cleanTarget = stripActionFluff(rawTarget);
  const lowerClean  = (cleanTarget || '').toLowerCase();

  // Kasus A: activeLocator ada tapi berada di luar modal
  if (activeLocator) {
    const isInsideModal = await safeEvaluate(
      activeLocator,
      (el, closestModalSel) => Boolean(el.closest(closestModalSel)),
      SWAL_SELECTORS.CLOSEST_MODAL
    );

    if (!isInsideModal) {
      const modalCandidate = await rescopeOutsideModalLocator(page, activeModalLoc, cleanTarget, lowerClean);
      if (await existsAndVisible(modalCandidate)) {
        return modalCandidate;
      }
    }
    return activeLocator;
  }

  // Kasus B: activeLocator null tapi ada modal aktif
  const modalCandidate = discoverModalFallbackLocator(activeModalLoc, lowerClean);
  return (await existsAndVisible(modalCandidate)) ? modalCandidate : null;
}

module.exports = {
  enforceModalScope,
  MODAL_FALLBACK_RULES,
};
