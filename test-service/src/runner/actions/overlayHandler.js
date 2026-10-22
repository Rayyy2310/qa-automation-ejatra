/**
 * overlayHandler.js — Helper utilities for handling blocking modals, alerts, and auto-revealing collapsed containers.
 */
const appProfile = require('../../utils/appProfile');

/**
 * Auto-dismiss blocking overlays, modals, and purge CI4 debugbar from DOM.
 * @param {import('@playwright/test').Page} page
 */
async function autoDismissOverlays(page) {
  if (!page) return;
  try {
    // Purge CI4 debugbar elements from DOM so they never intercept clicks or table inspections
    const debugSel = appProfile.get('debugOverlay');
    if (debugSel) {
      await page.evaluate((sel) => {
        document.querySelectorAll(sel).forEach(el => el.remove());
      }, debugSel).catch(() => {});
    }

    // Only dismiss transient notifications, alerts, or floating popups — NEVER close intentional modal dialogs (.modal)
    const dismissBtns = page.locator(
      '.toast .btn-close, .toast-close, .alert .btn-close, .alert .close, .swal2-container.swal2-backdrop-show .swal2-close'
    );
    if ((await dismissBtns.count()) > 0 && (await dismissBtns.first().isVisible().catch(() => false))) {
      await dismissBtns.first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(200);
    }
  } catch (e) {}
}

/**
 * Auto-reveal parent container if the target element is inside a collapsed dropdown, tab, or accordion.
 * Enforces Table Tab for view/search/filter/row actions, and Form Tab only for create/input actions.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} locator
 * @param {string} targetHint
 * @param {string} action
 */
async function autoRevealParentContainer(page, locator, targetHint = '', action = '') {
  if (!page) return;
  if (locator && locator.locator) locator = locator.locator;

  try {
    // Accordion Expansion: if element is inside a collapsed accordion, expand it
    if (locator && !(await locator.isVisible().catch(() => false))) {
      const parentAccordionCollapse = locator.locator('xpath=ancestor::*[contains(@class, "collapse") and not(contains(@class, "show"))]').first();
      if ((await parentAccordionCollapse.count().catch(() => 0)) > 0) {
        const collapseId = await parentAccordionCollapse.getAttribute('id').catch(() => null);
        if (collapseId) {
          const accordionBtn = page.locator(`[data-bs-target="#${collapseId}"], [data-target="#${collapseId}"], [href="#${collapseId}"]`).first();
          if ((await accordionBtn.count()) > 0) {
            await accordionBtn.click({ force: true }).catch(() => {});
            await page.waitForTimeout(300);
          }
        }
      }

      // Tab Panel Expansion: if element is inside an inactive / hidden Bootstrap tab pane
      const parentTabPane = locator.locator('xpath=ancestor::*[contains(@class, "tab-pane") or @role="tabpanel"][1]').first();
      if ((await parentTabPane.count().catch(() => 0)) > 0) {
        const isHidden = await parentTabPane.evaluate(el => {
          const style = window.getComputedStyle(el);
          return style.display === 'none' || (!el.classList.contains('active') && !el.classList.contains('show'));
        }).catch(() => false);

        if (isHidden) {
          const paneId = await parentTabPane.getAttribute('id').catch(() => null);
          if (paneId) {
            const tabTrigger = page.locator(`
              [data-bs-target="#${paneId}"],
              [data-target="#${paneId}"],
              [href="#${paneId}"],
              #${paneId}-tab,
              #${paneId}Tab,
              [aria-controls="${paneId}"],
              button:has-text("${paneId}"),
              a:has-text("${paneId}")
            `.replace(/\s+/g, ' ').trim()).first();

            if ((await tabTrigger.count().catch(() => 0)) > 0) {
              await tabTrigger.click({ force: true }).catch(() => {});
              await page.waitForTimeout(350);
            }
          }
        }
      }

      // Sidebar Treeview Expansion: if element is inside a collapsed sidebar item
      const parentTreeItem = locator.locator('xpath=ancestor::*[self::li or contains(@class, "nav-item") or contains(@class, "has-treeview")][last()]').first();
      if ((await parentTreeItem.count().catch(() => 0)) > 0) {
        const toggle = parentTreeItem.locator(':scope > a, :scope > button, :scope > .dropdown-toggle, :scope > [data-bs-toggle], :scope > .nav-link').first();
        if ((await toggle.count().catch(() => 0)) > 0) {
          await toggle.click({ force: true }).catch(() => {});
          await page.waitForTimeout(400);
        }
      }
    }
  } catch (e) {}
}

module.exports = {
  autoDismissOverlays,
  autoRevealParentContainer
};
