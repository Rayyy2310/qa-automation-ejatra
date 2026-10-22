'use strict';

/**
 * click/rowActionGuard.js — Table Row Action Delegation & Safeguards
 *
 * Memeriksa apakah step ini merupakan aksi baris tabel (hamburger / inline delete).
 * Menyertakan Form Tab Context Safeguard agar tombol di dalam form aktif (misal "Batal")
 * tidak dibajak ke aksi baris tabel.
 */

const { executeTableRowAction } = require('../tableRowAction');
const { TIMEOUTS } = require('../../../utils/constants');
const { existsAndVisible, safeEvaluate, safeScrollIntoView } = require('../../../utils/playwrightHelpers');
const appProfile = require('../../../utils/appProfile');
const { detectRowActionIntent } = require('./intent');

/**
 * Cek apakah tombol dengan teks target sedang tampil nyata di dalam form / tab aktif.
 */
async function isActiveFormButtonPresent(page, rawTarget) {
  const cancelVis = appProfile.get('cancelButtons', []).map(sel => `${sel}:visible`);
  const activeFormButton = page.locator([
    `:is(.tab-pane.active, [role="tabpanel"].active, form:visible) button:has-text("${rawTarget}")`,
    `:is(.tab-pane.active, [role="tabpanel"].active, form:visible) a.btn:has-text("${rawTarget}")`,
    `:is(.tab-pane.active, [role="tabpanel"].active, form:visible) [role="button"]:has-text("${rawTarget}")`,
    ...cancelVis,
  ].join(', ')).first();

  return existsAndVisible(activeFormButton);
}

/**
 * Cek apakah layar sedang berada di Tab Form aktif atau tidak ada tabel yang terlihat.
 */
async function isFormTabCurrentlyActive(page) {
  return safeEvaluate(page, () => {
    const activePane = document.querySelector('.tab-pane.active, [role="tabpanel"].active');
    if (activePane) {
      const idLower = (activePane.id || '').toLowerCase();
      if (idLower.includes('form')) return true;
      if (activePane.querySelector('form')) return true;
    }
    const visibleTable = document.querySelector('.dataTable:not([style*="display: none"]), table.table:not([style*="display: none"])');
    return !visibleTable;
  });
}

/**
 * Coba klik tombol hapus inline pada tabel yang tidak menggunakan dropdown hamburger.
 */
async function tryClickInlineDeleteButton(page) {
  const inlineDeleteCandidates = [
    ...appProfile.get('inlineDeleteButtons', []),
    'tbody:not(:has(.dropdown-toggle)) tr button.btn-danger',
    'tbody:not(:has(.dropdown-toggle)) tr button[class*="hapus"]',
    'tbody:not(:has(.dropdown-toggle)) tr button[onclick*="remove"]',
    'tbody:not(:has(.dropdown-toggle)) tr button[onclick*="hapus"]',
  ];

  for (const sel of inlineDeleteCandidates) {
    const candidate = page.locator(sel).first();
    if (await existsAndVisible(candidate)) {
      await safeScrollIntoView(candidate);
      try {
        await candidate.click({ timeout: TIMEOUTS.LONG });
      } catch {
        await candidate.click({ force: true, timeout: 2000 }).catch(async () => {
          await safeEvaluate(candidate, el => {
            el.scrollIntoView({ block: 'center' });
            el.focus();
            el.click();
          });
        });
      }
      await page.waitForTimeout(TIMEOUTS.SHORT);
      return true;
    }
  }

  return false;
}

/**
 * Delegasikan ke table row action jika sesuai intent.
 *
 * @param {object} ctx - Objek konteks klik bersama
 * @returns {Promise<boolean>}
 */
async function handleRowActionIfNeeded(ctx) {
  const { page } = ctx;
  const rowIntent = detectRowActionIntent(ctx);
  if (!rowIntent.isRowActionItem) return false;

  if (!rowIntent.isTableRowTargeted && !rowIntent.isExplicitRowIntent) {
    if (await isActiveFormButtonPresent(page, ctx.rawTarget)) return false;
    if (await isFormTabCurrentlyActive(page)) return false;
  }

  if (rowIntent.isHapus && !rowIntent.isExplicitRowIntent) {
    if (await tryClickInlineDeleteButton(page)) return true;
  }

  return executeTableRowAction({
    page,
    step: ctx.step,
    baseUrl: ctx.baseUrl,
    targetStr: ctx.targetStr,
    valStr: ctx.valStr,
    rowQuery: rowIntent.extractedRowQuery,
  });
}

module.exports = {
  handleRowActionIfNeeded,
};
