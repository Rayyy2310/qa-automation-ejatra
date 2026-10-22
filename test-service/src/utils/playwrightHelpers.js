/**
 * playwrightHelpers.js — Shared Playwright Micro-Utilities
 *
 * Berisi helper kecil yang dipakai berulang di banyak action handler:
 *
 * - unwrapLocator(locator)       : normalisasi object {locator} → Locator Playwright murni
 * - exists(locator)              : cek apakah locator memiliki setidaknya 1 elemen (aman dari error)
 * - isVisibleSafe(locator)       : cek visibilitas elemen tanpa throw (aman dari error)
 * - existsAndVisible(locator)    : kombinasi exists + isVisibleSafe
 * - waitForJQuery(page, timeout) : tunggu semua request jQuery AJAX selesai
 *
 * Sebelumnya pola-pola ini ditulis ulang secara manual di:
 *   fillAction.js, selectAction (fillAction.js), assertVisibleAction,
 *   searchSelect2Action.js, tableRowAction.js, overlayHandler.js, dll.
 */

// ---------------------------------------------------------------------------
// LOCATOR NORMALIZATION
// ---------------------------------------------------------------------------

/**
 * Normalisasi locator yang dikirim dari stepExecutor ke action handler.
 *
 * stepExecutor mengembalikan `{ locator: <Locator>, strategyUsed: '...' }`.
 * Action handler menerima ini sebagai parameter `locator`, sehingga perlu
 * di-unwrap dulu sebelum dipakai.
 *
 * Juga memvalidasi bahwa hasil akhirnya memiliki method Playwright yang
 * dibutuhkan (`.click`, `.fill`, `.isVisible`, dll.).
 *
 * @param {any} locator - Locator mentah dari stepExecutor
 * @param {string} [checkMethod='click'] - Method yang harus ada di locator yang valid
 * @returns {import('@playwright/test').Locator|null}
 *
 * @example
 * // Di fillAction.js — sebelumnya:
 * let activeLocator = (locator && locator.locator && typeof locator.locator !== 'function')
 *   ? locator.locator : locator;
 * if (activeLocator && typeof activeLocator.fill !== 'function') activeLocator = null;
 *
 * // Setelah pakai helper ini:
 * const activeLocator = unwrapLocator(locator, 'fill');
 */
function unwrapLocator(locator, checkMethod = 'click') {
  if (!locator) return null;

  // Jika locator adalah object {locator: <Locator>} dari stepExecutor
  const raw = (locator.locator && typeof locator.locator !== 'function')
    ? locator.locator
    : locator;

  // Validasi: pastikan hasil akhirnya adalah Playwright Locator yang valid
  if (!raw || typeof raw[checkMethod] !== 'function') return null;

  return raw;
}

// ---------------------------------------------------------------------------
// EXISTENCE & VISIBILITY CHECKS
// ---------------------------------------------------------------------------

/**
 * Hitung jumlah elemen pada Playwright Locator tanpa pernah throw.
 *
 * @param {import('@playwright/test').Locator|null} locator
 * @returns {Promise<number>}
 */
async function safeCount(locator) {
  if (!locator || typeof locator.count !== 'function') return 0;
  return locator.count().catch(() => 0);
}

/**
 * Cek apakah sebuah Playwright Locator memiliki setidaknya 1 elemen di DOM.
 * Aman dari error — selalu mengembalikan boolean, tidak pernah throw.
 *
 * @param {import('@playwright/test').Locator} locator
 * @returns {Promise<boolean>}
 */
async function exists(locator) {
  return (await safeCount(locator)) > 0;
}

/**
 * Cek visibilitas elemen tanpa throw jika elemen tidak ada.
 * Selalu mengembalikan boolean.
 *
 * @param {import('@playwright/test').Locator} locator
 * @returns {Promise<boolean>}
 *
 * @example
 * // Sebelumnya:
 * await someLocator.isVisible().catch(() => false)
 *
 * // Setelah:
 * await isVisibleSafe(someLocator)
 */
async function isVisibleSafe(locator) {
  if (!locator) return false;
  return locator.isVisible().catch(() => false);
}

/**
 * Cek apakah locator ada DI DOM sekaligus terlihat di layar.
 * Aman dari error — selalu mengembalikan boolean.
 *
 * @param {import('@playwright/test').Locator} locator
 * @returns {Promise<boolean>}
 *
 * @example
 * // Sebelumnya (pola yang paling sering berulang):
 * (await someLocator.count().catch(() => 0)) > 0 && (await someLocator.isVisible().catch(() => false))
 *
 * // Setelah:
 * await existsAndVisible(someLocator)
 */
async function existsAndVisible(locator) {
  if (!locator) return false;
  return (await exists(locator)) && (await isVisibleSafe(locator));
}

// ---------------------------------------------------------------------------
// AJAX WAIT
// ---------------------------------------------------------------------------

/**
 * Tunggu semua request jQuery AJAX selesai (jQuery.active === 0).
 * Tidak berbuat apa-apa jika jQuery tidak ada di halaman.
 * Aman dari timeout — selalu resolve, tidak pernah reject.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} [timeout=5000] - Batas waktu tunggu dalam milidetik
 * @returns {Promise<void>}
 *
 * @example
 * // Sebelumnya (ada di fillAction.js, searchSelect2Action.js, dll.):
 * await page.waitForFunction(
 *   () => typeof window.jQuery === 'undefined' || window.jQuery.active === 0,
 *   { timeout: 8000 }
 * ).catch(() => {});
 *
 * // Setelah:
 * await waitForJQuery(page, 8000);
 */
async function waitForJQuery(page, timeout = 5000) {
  if (!page) return;
  return page.waitForFunction(
    () => typeof window.jQuery === 'undefined' || window.jQuery.active === 0,
    { timeout }
  ).catch(() => {});
}

// ---------------------------------------------------------------------------
// SELECT2 DETECTION
// ---------------------------------------------------------------------------

/**
 * Deteksi apakah sebuah Playwright Locator menunjuk ke elemen Select2
 * (atau elemen yang berhubungan dengan Select2 widget).
 *
 * Menggabungkan semua varian deteksi yang sebelumnya ditulis manual di:
 * - fillAction.js        (baris 200-210)
 * - searchSelect2Action.js (baris 118-121)
 * - stepExecutor.js      (baris 120-131)
 *
 * Logika deteksi (dijalankan di browser via evaluate):
 * 1. Tag <select> yang punya .select2-container sebagai sibling/parent berikutnya
 * 2. Elemen dengan class select2-hidden-accessible / select2-selection / select2-container
 * 3. Elemen di dalam .select2-container (via closest())
 * 4. <select> yang parent-nya berisi .select2-container
 * 5. Tag <select> murni (tanpa Select2) → FALSE
 *
 * @param {import('@playwright/test').Locator|null} locator
 * @returns {Promise<boolean>}
 *
 * @example
 * const { isSelect2Element } = require('../../utils/playwrightHelpers');
 * // ...
 * if (await isSelect2Element(activeLocator)) {
 *   return await searchSelect2Action({ page, locator: activeLocator, step });
 * }
 */
async function isSelect2Element(locator) {
  if (!locator) return false;
  return locator.evaluate(el => {
    if (!el) return false;

    const tag = el.tagName ? el.tagName.toLowerCase() : '';

    // Elemen non-select yang sudah bertipe Select2 widget
    if (tag !== 'select') {
      return (
        el.classList.contains('select2-hidden-accessible') ||
        el.classList.contains('select2-selection') ||
        el.classList.contains('select2-container') ||
        Boolean(el.closest?.('.select2-container'))
      );
    }

    // Elemen <select>: cek apakah sudah di-enhance oleh Select2
    if (el.classList.contains('select2-hidden-accessible')) return true;

    // Sibling langsung: <select> diikuti .select2-container
    const next = el.nextElementSibling;
    if (next && (
      next.classList.contains('select2-container') ||
      next.classList.contains('select2')
    )) return true;

    // Parent langsung mengandung .select2-container (nested struktur)
    const parent = el.parentElement;
    if (parent && parent.querySelector('.select2-container')) return true;

    // <select> murni tanpa Select2 enhancement
    return false;
  }).catch(() => false);
}

/**
 * Alias eksplisit sesuai konvensi safeCount / safeVisible.
 */
const safeVisible = isVisibleSafe;

/**
 * Jalankan locator.evaluate() atau page.evaluate() tanpa pernah throw.
 *
 * @param {import('@playwright/test').Locator|import('@playwright/test').Page|null} target
 * @param {Function} pageFunction
 * @param {any} [arg]
 * @param {any} [fallback=false]
 * @param {object} [options]
 */
async function safeEvaluate(target, pageFunction, arg, fallback = false, options = undefined) {
  if (!target || typeof target.evaluate !== 'function') return fallback;
  return target.evaluate(pageFunction, arg, options).catch(() => fallback);
}

/**
 * Ambil atribut elemen tanpa throw.
 *
 * @param {import('@playwright/test').Locator|null} locator
 * @param {string} name
 * @returns {Promise<string|null>}
 */
async function safeAttr(locator, name) {
  if (!locator || typeof locator.getAttribute !== 'function') return null;
  return locator.getAttribute(name).catch(() => null);
}

/**
 * Scroll elemen ke viewport tanpa throw.
 *
 * @param {import('@playwright/test').Locator|null} locator
 * @param {number} [timeout=2000]
 */
async function safeScrollIntoView(locator, timeout = 2000) {
  if (!locator || typeof locator.scrollIntoViewIfNeeded !== 'function') return;
  await locator.scrollIntoViewIfNeeded({ timeout }).catch(() => {});
}

/**
 * Cek apakah elemen dalam kondisi enabled tanpa throw.
 *
 * @param {import('@playwright/test').Locator|null} locator
 * @returns {Promise<boolean>}
 */
async function safeEnabled(locator) {
  if (!locator || typeof locator.isEnabled !== 'function') return false;
  return locator.isEnabled().catch(() => false);
}

/**
 * Ambil textContent elemen tanpa throw (selalu mengembalikan string).
 *
 * @param {import('@playwright/test').Locator|null} locator
 * @returns {Promise<string>}
 */
async function safeText(locator) {
  if (!locator || typeof locator.textContent !== 'function') return '';
  return (await locator.textContent().catch(() => '')) || '';
}

/**
 * Klik elemen tanpa throw.
 *
 * @param {import('@playwright/test').Locator|null} locator
 * @param {object} [options]
 */
async function safeClick(locator, options = undefined) {
  if (!locator || typeof locator.click !== 'function') return;
  await locator.click(options).catch(() => {});
}

/**
 * Tekan tombol keyboard pada page tanpa throw.
 *
 * @param {import('@playwright/test').Page|null} page
 * @param {string} key
 */
async function safePressKey(page, key) {
  if (!page || !page.keyboard || typeof page.keyboard.press !== 'function') return;
  await page.keyboard.press(key).catch(() => {});
}

/**
 * Tunggu selector pada page tanpa throw.
 *
 * @param {import('@playwright/test').Page|null} page
 * @param {string} selector
 * @param {object} [options]
 */
async function safeWaitForSelector(page, selector, options = undefined) {
  if (!page || typeof page.waitForSelector !== 'function') return;
  await page.waitForSelector(selector, options).catch(() => {});
}

/**
 * Tunggu load state pada page tanpa throw.
 *
 * @param {import('@playwright/test').Page|null} page
 * @param {string} state
 * @param {object} [options]
 */
async function safeWaitForLoadState(page, state, options = undefined) {
  if (!page || typeof page.waitForLoadState !== 'function') return;
  await page.waitForLoadState(state, options).catch(() => {});
}

/**
 * Tunggu kondisi fungsi di browser pada page tanpa throw.
 *
 * @param {import('@playwright/test').Page|null} page
 * @param {Function} pageFunction
 * @param {any} [arg]
 * @param {object} [options]
 */
async function safeWaitForFunction(page, pageFunction, arg = undefined, options = undefined) {
  if (!page || typeof page.waitForFunction !== 'function') return;
  await page.waitForFunction(pageFunction, arg, options).catch(() => {});
}

module.exports = {
  unwrapLocator,
  safeCount,
  exists,
  isVisibleSafe,
  safeVisible,
  existsAndVisible,
  safeEvaluate,
  safeAttr,
  safeScrollIntoView,
  safeEnabled,
  safeText,
  safeClick,
  safePressKey,
  safeWaitForSelector,
  safeWaitForLoadState,
  safeWaitForFunction,
  waitForJQuery,
  isSelect2Element,
};

