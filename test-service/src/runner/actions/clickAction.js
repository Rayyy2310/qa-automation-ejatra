'use strict';

/**
 * clickAction.js — Click Action Orchestrator
 *
 * Mengoordinasikan alur eksekusi 'click' dalam 6 langkah bersih:
 * 1. Delegasi aksi baris tabel (hamburger / inline) — click/rowActionGuard.js
 * 2. Resolusi locator bertahap (A–F)               — click/resolveTarget.js
 * 3. Re-scope ke modal atau tab aktif               — click/modalScope.js
 * 4. Validasi keberadaan elemen & safeguard tab     — click/tabSafeguards.js
 * 5. Eksekusi klik 3-lapis + event bridge           — click/performClick.js
 * 6. Stabilisasi pasca-klik (login/save/tab/modal)  — click/postClick.js
 */

const { MODAL_CONTAINER_SELECTOR } = require('../../utils/locatorResolver');
const { safeCount, existsAndVisible, safeAttr, safeEvaluate } = require('../../utils/playwrightHelpers');
const { buildClickContext } = require('./click/intent');
const { handleRowActionIfNeeded } = require('./click/rowActionGuard');
const { resolveClickTarget } = require('./click/resolveTarget');
const { enforceModalScope } = require('./click/modalScope');
const { tryIdempotentMissingTargetSafeguards } = require('./click/tabSafeguards');
const { performClickWithFallback } = require('./click/performClick');
const { handlePostClickBehavior } = require('./click/postClick');

/**
 * Ambil atribut href dari elemen atau ancestor <a> terdekat.
 */
async function extractElementHref(activeLocator) {
  let href = await safeAttr(activeLocator, 'href');
  if (!href) {
    href = await safeEvaluate(activeLocator, el => {
      const link = el.closest('a');
      return link ? link.getAttribute('href') : null;
    }, undefined, null);
  }
  return href;
}

/**
 * Handle 'click' action with 2-Step Atomic Compound Row Action Execution and Multi-Tab support.
 *
 * @param {object} params
 * @param {import('@playwright/test').Page} params.page
 * @param {any} params.locator
 * @param {object} params.step
 * @param {string} params.baseUrl
 */
async function clickAction({ page, locator, step, baseUrl }) {
  const activeModalLoc = page.locator(MODAL_CONTAINER_SELECTOR).last();
  const isModalOpen    = await existsAndVisible(activeModalLoc);
  const ctx            = buildClickContext(step, baseUrl, { page, isModalOpen, activeModalLoc });

  // 1. Delegasikan ke row action jika ini adalah hamburger/aksi baris (early return)
  if (await handleRowActionIfNeeded(ctx)) return;

  // 2. Temukan elemen target (Tahap A → F)
  let activeLocator = await resolveClickTarget(ctx, locator);

  // 3. Re-scope locator ke dalam modal atau tab aktif
  activeLocator = await enforceModalScope(ctx, activeLocator);

  // 4. Validasi akhir — locator harus ada di DOM, kecuali terpenuhi oleh safeguard idempoten
  if (!activeLocator || (!activeLocator.__alreadyResolved && (await safeCount(activeLocator)) === 0)) {
    if (await tryIdempotentMissingTargetSafeguards(ctx)) {
      return;
    }
    throw new Error(`Elemen tidak ditemukan untuk target: ${JSON.stringify(step.target)}`);
  }

  const href       = await extractElementHref(activeLocator);
  const initialUrl = page.url();

  // 5. Eksekusi klik + event safeguard
  await performClickWithFallback(ctx, activeLocator);

  // 6. Stabilisasi pasca-klik
  await handlePostClickBehavior(ctx, href, initialUrl);
}

module.exports = {
  clickAction,
};
