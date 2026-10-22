'use strict';

/**
 * rowActionExplorer.js — Row Action Hamburger Menu (☰) Explorer
 *
 * Membuka menu dropdown aksi pada baris pertama tabel, mengekstrak item aksi,
 * lalu menutup kembali dropdown via Escape.
 */

const {
  ICON_MAP,
  TIMEOUTS,
  ROW_DROPDOWN_TRIGGER_SELECTORS,
} = require('./explorerConfig');
const { extractElementsInState } = require('./domExtractor');
const {
  safeCount,
  existsAndVisible,
  safeClick,
  safePressKey,
} = require('../../utils/playwrightHelpers');

/**
 * Explore row action hamburger menu (☰) on the first table row.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<object>>}
 */
async function exploreRowActions(page) {
  const rowActionElements = [];

  try {
    const tableRows = page.locator('table tbody tr');
    const rowCount = await safeCount(tableRows);
    if (rowCount === 0) return rowActionElements;

    // Look for first row dropdown toggle
    const trigger = page.locator(ROW_DROPDOWN_TRIGGER_SELECTORS).first();

    if (await existsAndVisible(trigger)) {
      await safeClick(trigger, { timeout: TIMEOUTS.CLICK_FAST });
      await page.waitForTimeout(TIMEOUTS.SHORT);

      // Scan menu items inside revealed dropdown using unified extractor
      const items = await page.evaluate(extractElementsInState, {
        mode: 'row_actions',
        iconMap: ICON_MAP,
      });

      rowActionElements.push(...items);

      // Close dropdown cleanly via Escape
      await safePressKey(page, 'Escape');
      await page.waitForTimeout(TIMEOUTS.DROPDOWN_SETTLE);
    }
  } catch (err) {
    console.debug('[stateExplorer] exploreRowActions note:', err.message);
  }

  return rowActionElements;
}

module.exports = {
  exploreRowActions,
};
