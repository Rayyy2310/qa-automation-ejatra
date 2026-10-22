'use strict';

/**
 * modalExplorer.js — Safe Active Modal Trigger Explorer
 *
 * Menemukan tombol pemicu modal (Browse, Cari Data, Lookup, data-bs-toggle="modal")
 * yang aman (lolos filter DENYLIST_TEXT), membukanya, mengekstrak elemen di dalam modal,
 * lalu menutup modal kembali.
 */

const {
  ICON_MAP,
  DENYLIST_TEXT,
  TIMEOUTS,
  IGNORED_DEBUG_SELECTOR,
  IGNORED_NAV_SELECTOR,
  MODAL_TRIGGER_SELECTORS,
  ACTIVE_MODAL_SELECTOR,
  MODAL_CLOSE_SELECTORS,
} = require('./explorerConfig');
const { extractElementsInState } = require('./domExtractor');
const {
  safeCount,
  exists,
  safeVisible,
  existsAndVisible,
  safeAttr,
  safeText,
  safeClick,
  safePressKey,
  safeWaitForSelector,
} = require('../../utils/playwrightHelpers');

/**
 * Explore safe modal triggers (e.g. Cari Data PO, Browse Tiket Timbangan, Cari SPM, Filter Dialog).
 * Supports both standard Bootstrap declarative triggers and dynamic JS/jQuery popup buttons.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} [options]
 * @returns {Promise<Array<object>>}
 */
async function exploreModalState(page, options = {}) {
  const {
    visitedTriggers = new Set(),
    maxModals = 8,
    contextState = 'tabel',
  } = options;

  const modalElements = [];

  try {
    const modalTriggers = page.locator(MODAL_TRIGGER_SELECTORS);
    const triggerCount = await safeCount(modalTriggers);
    let explored = 0;

    for (let i = 0; i < triggerCount && explored < maxModals; i++) {
      const trigger = modalTriggers.nth(i);
      const isVisible = await safeVisible(trigger);
      if (!isVisible) continue;

      const txt = await safeText(trigger);
      // Safety filter: never click destructive buttons during scanning (hapus/batal/void/simpan/logout)
      if (DENYLIST_TEXT.test(txt)) continue;

      const idAttr = await safeAttr(trigger, 'id');
      const targetAttr = (await safeAttr(trigger, 'data-bs-target'))
                      || (await safeAttr(trigger, 'data-target'));
      const classAttr = await safeAttr(trigger, 'class');

      const triggerKey = idAttr ? `#${idAttr}` : (targetAttr || `${txt.trim()}|${classAttr || ''}`);
      if (visitedTriggers.has(triggerKey)) continue;
      visitedTriggers.add(triggerKey);

      let triggerSelector = idAttr ? `#${idAttr}` : null;
      if (!triggerSelector && targetAttr) {
        triggerSelector = targetAttr;
      }
      if (!triggerSelector && txt.trim()) {
        const cleanTxt = txt.replace(/[^\p{L}\p{N}\s\-\(\)\/\._]/u, '').trim();
        triggerSelector = `button:has-text("${cleanTxt}"), a:has-text("${cleanTxt}")`;
      }
      if (!triggerSelector) {
        triggerSelector = 'button[data-bs-toggle="modal"], .btn-browse';
      }

      console.log(`[stateExplorer] Opening Modal State via "${txt.trim()}" (${triggerSelector}) in ${contextState}...`);
      await safeClick(trigger, { timeout: TIMEOUTS.NETWORK_IDLE_SHORT });
      await page.waitForTimeout(TIMEOUTS.SEARCH_SETTLE);

      // Verify modal is visible
      const modalLocator = page.locator(ACTIVE_MODAL_SELECTOR).first();
      if (await existsAndVisible(modalLocator)) {
        // Modal is active! Extract elements inside modal
        const elements = await page.evaluate(extractElementsInState, {
          stateTag: 'modal',
          triggerSelector: triggerSelector,
          triggerText: txt.trim(),
          containerSelector: ACTIVE_MODAL_SELECTOR,
          iconMap: ICON_MAP,
          ignoredDebugSelector: IGNORED_DEBUG_SELECTOR,
          ignoredNavSelector: IGNORED_NAV_SELECTOR,
        });

        modalElements.push(...elements);
        explored++;

        // Close modal safely
        const closeBtn = page.locator(MODAL_CLOSE_SELECTORS).first();

        if (await exists(closeBtn)) {
          await safeClick(closeBtn);
        } else {
          await safePressKey(page, 'Escape');
        }
        await page.waitForTimeout(TIMEOUTS.SETTLE);

        // Ensure backdrop detached so subsequent triggers can be clicked
        await safeWaitForSelector(page, '.modal-backdrop', { state: 'detached', timeout: TIMEOUTS.CLICK_FAST });
      }
    }
  } catch (err) {
    console.debug('[stateExplorer] exploreModalState note:', err.message);
  }

  return modalElements;
}

module.exports = {
  exploreModalState,
};
