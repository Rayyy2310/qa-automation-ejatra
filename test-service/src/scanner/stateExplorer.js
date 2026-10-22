'use strict';

/**
 * stateExplorer.js — State-Aware Active Page Explorer Orchestrator
 *
 * Mengoordinasikan alur eksplorasi halaman e-Jatra dalam 5 tahap bersih:
 *  1. State awal ('tabel' & toolbar)           — explorer/domExtractor.js
 *  2. Aksi baris tabel (hamburger ☰ dropdown)  — explorer/rowActionExplorer.js
 *  3. Modal dialog di level tabel              — explorer/modalExplorer.js
 *  4. Tab/kontainer Form + modal di dalam form — explorer/formExplorer.js
 *  5. Ekstraksi statis seluruh modal di DOM    — explorer/domExtractor.js
 */

const {
  ICON_MAP,
  TIMEOUTS,
  IGNORED_DEBUG_SELECTOR,
  IGNORED_NAV_SELECTOR,
} = require('./explorer/explorerConfig');
const { waitReady } = require('./explorer/waitReady');
const { extractElementsInState, extractAllDomModals } = require('./explorer/domExtractor');
const { exploreRowActions } = require('./explorer/rowActionExplorer');
const { exploreModalState } = require('./explorer/modalExplorer');
const { exploreFormState } = require('./explorer/formExplorer');

/**
 * Main state explorer entry point for a single page.
 * Sequentially explores 'tabel', 'row_action', 'form', and 'modal' states across all containers.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<object>>}
 */
async function explorePageState(page) {
  const visitedTriggers = new Set();

  // 1. Initial State: Table & Toolbar elements
  await waitReady(page, TIMEOUTS.WAIT_READY_DEFAULT);
  const tableElements = await page.evaluate(extractElementsInState, {
    stateTag: 'tabel',
    triggerSelector: null,
    triggerText: null,
    containerSelector: null,
    iconMap: ICON_MAP,
    ignoredDebugSelector: IGNORED_DEBUG_SELECTOR,
    ignoredNavSelector: IGNORED_NAV_SELECTOR,
  });

  // 2. Active Exploration: Row Actions (☰ dropdown)
  const rowActions = await exploreRowActions(page);

  // 3. Active Exploration: Table-level Modal Dialogs
  const tableModals = await exploreModalState(page, { visitedTriggers, contextState: 'tabel' });

  // 4. Active Exploration: Form Tab / Container (also explores form-level modals!)
  const formElements = await exploreFormState(page, visitedTriggers);

  // 5. Universal Dormant DOM Modal Extraction (safety net for all modals declared in DOM)
  const dormantModals = await extractAllDomModals(page);

  // Combine and deduplicate
  const allElements = [...tableElements, ...rowActions, ...tableModals, ...formElements, ...dormantModals];
  const uniqueElements = [];
  const seenKeys = new Set();

  for (const el of allElements) {
    // Key by state_tag + selector/id/name + button_text
    const key = `${el.state_tag || 'tabel'}|${el.css_selector || el.element_id || el.element_name || el.button_text || ''}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueElements.push(el);
    }
  }

  return uniqueElements;
}

module.exports = {
  waitReady,
  explorePageState,
  extractElementsInState,
  exploreModalState,
  extractAllDomModals,
  ICON_MAP,
};
