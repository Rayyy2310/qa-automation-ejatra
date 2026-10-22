/**
 * miscAction.js — Miscellaneous Action Handlers (Navigation, Wait, Hover, Screenshot)
 */

const { resolveUrl, resolveTargetString } = require('../../utils/urlHelper');

/**
 * Handle 'goto' navigation.
 */
async function gotoAction({ page, step, baseUrl }) {
  let targetUrl = step.value || step.target?.value || '';
  targetUrl = resolveUrl(baseUrl, targetUrl);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
}

/**
 * Handle 'wait' duration.
 */
async function waitAction({ page, step }) {
  let duration = parseInt(step.value || step.target?.value || '1000', 10);
  if (isNaN(duration) || duration <= 0) duration = 1000;
  if (duration > 30000) duration = 30000;
  await page.waitForTimeout(duration);
}

/**
 * Handle 'hover' action.
 */
async function hoverAction({ page, locator, step }) {
  const rawTarget = resolveTargetString(step.target);
  const activeLocator = locator || page.locator(`button:has-text("${rawTarget}"), a:has-text("${rawTarget}"), css=${rawTarget}`).first();
  if (!activeLocator) throw new Error(`Elemen tidak ditemukan untuk target: ${JSON.stringify(step.target)}`);

  await activeLocator.hover({ timeout: 4000 });
}

/**
 * Handle 'screenshot' action.
 */
async function screenshotAction({ page }) {
  await page.waitForTimeout(300);
}

module.exports = {
  gotoAction,
  waitAction,
  hoverAction,
  screenshotAction
};
