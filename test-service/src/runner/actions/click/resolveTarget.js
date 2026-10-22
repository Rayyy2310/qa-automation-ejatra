'use strict';

/**
 * click/resolveTarget.js — Multi-Stage Click Locator Resolution
 *
 * Tahapan berurutan (identik dengan versi sebelumnya):
 *  A/B. Normalisasi unwrapLocator + tunggu spinner DataTable + autoRevealParentContainer
 *  C.   Checkbox / Select-All safeguard
 *  D.   Submit / Login fallback
 *  E.   "Tambah" / "Detail" form button discovery
 *  E.5. Trash / Delete / Hapus inline button discovery
 *  E.6. Plus / Expand / Detail icon recovery
 *  F.   Universal button fallback (CSS selector atau kandidat teks)
 */

const { autoRevealParentContainer } = require('../overlayHandler');
const { TIMEOUTS, SWAL_SELECTORS, CLICK_TEXT_SELECTORS } = require('../../../utils/constants');
const { pickBestInteractiveCandidate, isSelectorString, MODAL_CONTAINER_SELECTOR } = require('../../../utils/locatorResolver');
const { unwrapLocator, safeCount, exists, safeVisible, existsAndVisible } = require('../../../utils/playwrightHelpers');
const appProfile = require('../../../utils/appProfile');
const { extractRowMatches } = require('./intent');

const TRASH_TOKENS = ['trash', 'sampah', 'fa-trash', 'hapus', 'delete', 'remove'];
const PLUS_TOKENS  = ['plus', '+', 'fa-plus', 'detail'];

/**
 * Tunggu spinner DataTable hilang bila target menunjuk ke baris tabel.
 */
async function waitForTableRowIfNeeded(ctx, activeLocator) {
  const { page } = ctx;
  if (!ctx.isTableRowTarget || !page) return;

  try {
    const dtSpinner = page.locator('.dataTables_processing:visible, [id$="_processing"]:visible');
    if ((await exists(dtSpinner)) && (await safeVisible(dtSpinner.first()))) {
      await dtSpinner.first().waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(TIMEOUTS.SETTLE);
    }
  } catch (_) {}

  if (activeLocator) {
    await activeLocator.first().waitFor({ state: 'visible', timeout: TIMEOUTS.GENERATE_SETTLE }).catch(() => {});
  }
}

/**
 * Stage C: Checkbox / Select-All safeguard — tunggu DataTable render atau scope ke modal aktif.
 */
async function resolveCheckboxOrSelectAll(ctx, activeLocator) {
  const { page } = ctx;
  if (!ctx.isCheckboxOrSelectAll) return activeLocator;

  const activeModalForCb = page.locator(MODAL_CONTAINER_SELECTOR).last();
  if (await existsAndVisible(activeModalForCb)) {
    if (!ctx.isSpecificRowTarget) {
      const agreeCbSel = appProfile.get('confirmAgreeCheckbox', 'input[type="checkbox"]');
      const modalCb = activeModalForCb.locator(`input[type="checkbox"], ${agreeCbSel}, .form-check-input`).first();
      if (await existsAndVisible(modalCb)) {
        return modalCb;
      }
    }
    return activeLocator;
  }

  const dtRows = appProfile.get('dataTableRows', '.dataTable tbody tr, table tbody tr');
  await page.waitForSelector(
    `${appProfile.get('mainDataTable', 'table')} tbody tr, ${dtRows}, table tbody tr`,
    { timeout: 10000 }
  ).catch(() => {});

  const rowCbClass = appProfile.get('rowCheckbox', 'input[type="checkbox"]');
  await page.waitForFunction((rowCb) => {
    const ajaxSettled = typeof window.jQuery === 'undefined' || window.jQuery.active === 0;
    const notProcessing = !document.querySelector('.dataTables_processing:not([style*="display: none"])');
    const hasRows = document.querySelectorAll(
      `.dataTable tbody tr input[type="checkbox"], tbody tr ${rowCb}`
    ).length > 0;
    return ajaxSettled && notProcessing && hasRows;
  }, rowCbClass, { timeout: 10000 }).catch(() => {});

  await page.waitForTimeout(TIMEOUTS.SETTLE);

  // Re-resolve HANYA untuk header Select-All — baris spesifik DILARANG ditimpa dengan thead th checkbox!
  if (ctx.isHeaderSelectAll && !(await safeVisible(activeLocator))) {
    const selectAllSel = appProfile.get('selectAllCheckbox', 'thead th input[type="checkbox"]');
    return page.locator(`${selectAllSel}, thead th input[type="checkbox"]`).first();
  }
  if (ctx.isRowCheckbox && !(await safeVisible(activeLocator))) {
    if (ctx.rawTarget && typeof ctx.rawTarget === 'string') {
      return page.locator(ctx.rawTarget).first();
    }
  }

  return activeLocator;
}

/**
 * Stage D: Submit / Login fallback.
 */
async function resolveSubmitOrLoginFallback(ctx) {
  if (!ctx.isSubmitOrLogin) return null;

  const { page, targetStr } = ctx;
  let specificBtn;
  if (targetStr.includes('simpan') || targetStr.includes('save')) {
    specificBtn = page.locator(CLICK_TEXT_SELECTORS.SAVE_BUTTONS.join(', ')).first();
  } else if (targetStr.includes('masuk') || targetStr.includes('login')) {
    const loginFormSel = appProfile.get('loginForm');
    const loginSels = loginFormSel
      ? [`${loginFormSel} button[type="submit"]`, ...CLICK_TEXT_SELECTORS.LOGIN_BUTTONS]
      : CLICK_TEXT_SELECTORS.LOGIN_BUTTONS;
    specificBtn = page.locator(loginSels.join(', ')).first();
  } else {
    specificBtn = page.locator(CLICK_TEXT_SELECTORS.GENERIC_SUBMIT_BUTTONS.join(', ')).first();
  }

  return (await existsAndVisible(specificBtn)) ? specificBtn : null;
}

/**
 * Stage E: "Tambah" / "Detail" form button discovery.
 */
async function resolveTambahOrDetailFallback(ctx) {
  const { page, targetStr, expStr } = ctx;
  if (!targetStr.includes('tambah') && !targetStr.includes('detail') && !expStr.includes('tambah')) {
    return null;
  }

  if (!(await exists(page.locator(SWAL_SELECTORS.POPUP_VISIBLE)))) {
    return null;
  }

  let candidate = page.locator(`${SWAL_SELECTORS.CONFIRM}, ${CLICK_TEXT_SELECTORS.SWAL_ADD_BUTTON}`).first();
  const addItemSels = appProfile.get('addItemButtons', []);
  const formTambah = page.locator([
    ...addItemSels,
    ...CLICK_TEXT_SELECTORS.FORM_ADD_FALLBACK_BUTTONS,
  ].join(', ')).first();

  if (await existsAndVisible(formTambah)) {
    candidate = formTambah;
  }
  return candidate;
}

/**
 * Stage E.5: Trash / Delete / Hapus inline button discovery.
 */
async function resolveTrashOrDeleteFallback(ctx) {
  if (!TRASH_TOKENS.some(t => ctx.targetStr.includes(t))) return null;

  const inlineDelSels = appProfile.get('inlineDeleteButtons', []);
  const trashBtn = ctx.page.locator([
    ...inlineDelSels,
    'button:has-text("🗑️")',
    'button:has-text("🗑")',
    'button.btn-danger:has-text("🗑")',
    'button[onclick*="remove"]',
    'button[onclick*="hapus"]',
    ':is(.tab-pane.active, [role="tabpanel"].active, form:visible) button.btn-danger',
    ':is(.tab-pane.active, [role="tabpanel"].active, form:visible) button[onclick*="remove"]',
    ':is(.tab-pane.active, [role="tabpanel"].active, form:visible) button[onclick*="hapus"]',
    'tbody[id*="detail" i] button.btn-danger',
    'tbody[id*="item" i] button.btn-danger',
    'table[id*="detail" i] button.btn-danger',
    'tbody tr td:last-child button.btn-danger',
    'tbody tr td:last-child button[class*="danger"]',
    'button:has(.fa-trash, .fa-trash-alt, .bi-trash, [class*="trash"])',
  ].join(', ')).first();

  return (await existsAndVisible(trashBtn)) ? trashBtn : null;
}

/**
 * Stage E.6: Plus / Expand / Detail icon recovery.
 */
async function resolvePlusOrDetailIconFallback(ctx) {
  if (!PLUS_TOKENS.some(t => ctx.targetStr.includes(t))) return null;

  const { page } = ctx;
  const plusSelectors = [
    'a.fa-plus-circle',
    'i.fa-plus-circle',
    '.fa-plus-circle',
    'a.fa-plus',
    'i.fa-plus',
    '.fa-plus',
    '[class*="fa-plus"]',
    '[class*="plus-circle"]',
    'a[onclick*="detail"]',
    'button[onclick*="detail"]',
    appProfile.get('dataTableDetailsControl', 'td[class*="control"]'),
    'a[class*="plus"]',
    'button[class*="plus"]',
  ].join(', ');

  const { trMatch, docMatch } = extractRowMatches(ctx.rawTarget);
  const rowQueries = [trMatch?.[1], docMatch?.[0]].filter(Boolean);

  for (const q of rowQueries) {
    const rowLoc = page.locator(`tr:has-text("${q}")`).first();
    if (await exists(rowLoc)) {
      const plusInRow = rowLoc.locator(plusSelectors).first();
      if (await existsAndVisible(plusInRow)) return plusInRow;
    }
  }

  const genericPlus = page.locator(`table tbody tr ${plusSelectors}`).first();
  return (await existsAndVisible(genericPlus)) ? genericPlus : null;
}

/**
 * Stage F: Universal button locator fallback (CSS selector atau kandidat teks).
 */
async function resolveUniversalButtonFallback(ctx) {
  const { page, rawTarget, targetStr } = ctx;

  if (isSelectorString(rawTarget)) {
    const normalizedSelector = (rawTarget.includes('button:has-text(') && rawTarget.includes('tr:has-text('))
      ? rawTarget.replace(/button:has-text\(/g, ':is(button, a, .dropdown-item):has-text(')
      : rawTarget;

    const directLoc = page.locator(normalizedSelector);
    if (await exists(directLoc)) {
      const best = await pickBestInteractiveCandidate(directLoc, 'click', rawTarget);
      if (best) return best;
      if (await safeVisible(directLoc.first())) return directLoc.first();
    }
    return null;
  }

  const candidates = [
    `button:has-text("${rawTarget}")`,
    `a.btn:has-text("${rawTarget}")`,
    `a:has-text("${rawTarget}")`,
    `input[type="submit"][value*="${rawTarget}" i]`,
    `input[type="button"][value*="${rawTarget}" i]`,
    `.btn:has-text("${rawTarget}")`,
    `[role="button"]:has-text("${rawTarget}")`,
    `span:has-text("${rawTarget}")`,
    `text="${rawTarget}"`,
  ];

  if (targetStr.includes('batal') || targetStr.includes('cancel')) {
    const cancelBtns = appProfile.get('cancelButtons', []);
    const cancelOnclick = appProfile.get('cancelButtonOnclick', 'button[onclick*="batal" i]');
    candidates.unshift(...cancelBtns, cancelOnclick);
  }

  const reMatch = page.locator(candidates.join(', '));
  if (await exists(reMatch)) {
    return await pickBestInteractiveCandidate(reMatch, 'click', rawTarget);
  }
  return null;
}

/**
 * Daftar tahap fallback (D → F) yang dijalankan berurutan: `(ctx) => Promise<Locator|null>`.
 */
const FALLBACK_RESOLVERS = [
  resolveSubmitOrLoginFallback,
  resolveTambahOrDetailFallback,
  resolveTrashOrDeleteFallback,
  resolvePlusOrDetailIconFallback,
  resolveUniversalButtonFallback,
];

/**
 * Temukan `activeLocator` yang tepat secara berurutan (Tahap A → F).
 *
 * @param {object} ctx - Objek konteks klik bersama
 * @param {any} locator - Locator awal dari stepExecutor
 * @returns {Promise<import('@playwright/test').Locator|null>}
 */
async function resolveClickTarget(ctx, locator) {
  let activeLocator = unwrapLocator(locator, 'click');

  await waitForTableRowIfNeeded(ctx, activeLocator);

  if (activeLocator && !activeLocator.__alreadyResolved) {
    if ((await safeCount(activeLocator)) === 0) {
      activeLocator = null;
    } else {
      await autoRevealParentContainer(ctx.page, activeLocator, ctx.rawTarget, 'click');
    }
  } else if (!activeLocator) {
    await autoRevealParentContainer(ctx.page, null, ctx.rawTarget, 'click');
  }

  activeLocator = await resolveCheckboxOrSelectAll(ctx, activeLocator);

  for (const resolver of FALLBACK_RESOLVERS) {
    if (activeLocator) break;
    activeLocator = await resolver(ctx);
  }

  return activeLocator;
}

module.exports = {
  resolveClickTarget,
  FALLBACK_RESOLVERS,
};
