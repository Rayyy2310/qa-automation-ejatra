'use strict';

/**
 * formExplorer.js — Form Tab / Container & Form-Scoped Modal Explorer
 *
 * Membuka tab Form atau tombol Tambah (atau fallback ke aksi baris Edit/Realisasi),
 * mengekstrak seluruh elemen form beserta modal di dalam form, lalu mengembalikan
 * halaman ke tab Tabel.
 */

const {
  ICON_MAP,
  DENYLIST_TEXT,
  TIMEOUTS,
  IGNORED_DEBUG_SELECTOR,
  IGNORED_NAV_SELECTOR,
  ROW_INLINE_DROPDOWN_TOGGLE_SELECTOR,
  FORM_TRIGGER_SELECTORS,
  DEFAULT_FORM_TRIGGER_SELECTOR,
  ROW_FORM_TRIGGER_SELECTORS,
  DEFAULT_ROW_FORM_TRIGGER_SELECTOR,
  FORM_CONTAINER_SELECTOR,
  TABLE_TAB_SELECTORS,
} = require('./explorerConfig');
const { waitReady } = require('./waitReady');
const { extractElementsInState } = require('./domExtractor');
const { exploreModalState } = require('./modalExplorer');
const {
  safeCount,
  exists,
  safeVisible,
  existsAndVisible,
  safeAttr,
  safeEnabled,
  safeText,
  safeClick,
} = require('../../utils/playwrightHelpers');

/**
 * Explore Form state by safely clicking Form tab or 'Tambah Data' button.
 * Explores modal triggers inside the form before closing the form tab.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Set<string>} [visitedTriggers]
 * @returns {Promise<Array<object>>}
 */
async function exploreFormState(page, visitedTriggers = new Set()) {
  const formElements = [];

  try {
    // 1. Look for Form Tab or Tambah Button
    const formTriggers = page.locator(FORM_TRIGGER_SELECTORS);

    const triggerCount = await safeCount(formTriggers);
    let clickedTrigger = null;
    let clickedText = '';
    let clickedSelector = '';

    for (let i = 0; i < triggerCount; i++) {
      const candidate = formTriggers.nth(i);
      const isVisible = await safeVisible(candidate);
      const isEnabled = await safeEnabled(candidate);
      if (!isVisible || !isEnabled) continue;

      const txt = await safeText(candidate);
      if (DENYLIST_TEXT.test(txt)) continue;

      const candidateId = await safeAttr(candidate, 'id');
      clickedTrigger = candidate;
      clickedText = txt.trim();
      clickedSelector = candidateId ? `#${candidateId}` : DEFAULT_FORM_TRIGGER_SELECTOR;
      break;
    }

    // Fallback: If no direct form tab/button is enabled, check for row-level Edit/Realisasi actions in table
    if (!clickedTrigger) {
      const rowFormTrigger = page.locator(ROW_FORM_TRIGGER_SELECTORS).first();

      if (await exists(rowFormTrigger)) {
        // If it's inside a dropdown, open the dropdown first
        const dropdownToggle = page.locator(ROW_INLINE_DROPDOWN_TOGGLE_SELECTOR).first();
        if ((await exists(dropdownToggle)) && !(await safeVisible(rowFormTrigger))) {
          await safeClick(dropdownToggle);
          await page.waitForTimeout(TIMEOUTS.SHORT);
        }

        if (await safeVisible(rowFormTrigger)) {
          clickedTrigger = rowFormTrigger;
          clickedText = ((await safeText(rowFormTrigger)) || 'Realisasi/Edit').trim();
          clickedSelector = DEFAULT_ROW_FORM_TRIGGER_SELECTOR;
        }
      }
    }

    if (clickedTrigger) {
      console.log(`[stateExplorer] Opening Form State via "${clickedText}" (${clickedSelector})...`);
      await safeClick(clickedTrigger, { timeout: TIMEOUTS.LONG });
      await waitReady(page, TIMEOUTS.EXTRA_LONG);

      // Scan form container elements
      const elements = await page.evaluate(extractElementsInState, {
        stateTag: 'form',
        triggerSelector: clickedSelector,
        triggerText: clickedText,
        containerSelector: FORM_CONTAINER_SELECTOR,
        iconMap: ICON_MAP,
        ignoredDebugSelector: IGNORED_DEBUG_SELECTOR,
        ignoredNavSelector: IGNORED_NAV_SELECTOR,
      });

      formElements.push(...elements);

      // Explore modal triggers present inside the Form state (e.g. Cari PO, Browse Tiket, Cari SPM)
      // while the Form tab is active and visible!
      const formModals = await exploreModalState(page, {
        visitedTriggers,
        maxModals: 8,
        contextState: 'form',
      });
      formElements.push(...formModals);

      // Switch back to Table tab if available to keep page in clean state
      const tableTab = page.locator(TABLE_TAB_SELECTORS).first();

      if (await existsAndVisible(tableTab)) {
        await safeClick(tableTab);
        await page.waitForTimeout(TIMEOUTS.FAST);
      }
    }
  } catch (err) {
    console.debug('[stateExplorer] exploreFormState note:', err.message);
  }

  return formElements;
}

module.exports = {
  exploreFormState,
};
