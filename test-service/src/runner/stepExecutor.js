/**
 * stepExecutor.js — Enterprise Action Execution Router for Playwright
 * Implements Strategy Pattern with Modular Action Handlers, Automatic Self-Healing,
 * and Resilient Retries.
 */

const { resolveLocatorWithFallback } = require('../utils/locatorResolver');
const { applyWaitCondition, applyPostActionWait } = require('./waitStrategy');
const { withRetry } = require('./retryPolicy');
const { classify } = require('../utils/errorClassifier');
const { attemptSelfHealing } = require('../utils/selfHealer');
const { autoDismissOverlays } = require('./actions/overlayHandler');
const { clickAction } = require('./actions/clickAction');
const { fillAction, selectAction, checkAction, uncheckAction } = require('./actions/fillAction');
const { searchSelect2Action } = require('./actions/searchSelect2Action');
const { assertVisibleAction, assertTextAction, assertColorAction, assertTitleAction, assertUrlAction } = require('./actions/assertAction');
const { gotoAction, waitAction, hoverAction, screenshotAction } = require('./actions/miscAction');
const { isSelect2Element } = require('../utils/playwrightHelpers');

/**
 * Strategy Registry mapping action string to isolated modular handler.
 */
const ACTION_STRATEGIES = {
  goto: gotoAction,
  click: clickAction,
  fill: fillAction,
  select: selectAction,
  check: checkAction,
  uncheck: uncheckAction,
  search: searchSelect2Action,
  wait: waitAction,
  hover: hoverAction,
  screenshot: screenshotAction,
  assert_visible: assertVisibleAction,
  assert_text: assertTextAction,
  assert_title: assertTitleAction,
  assert_url: assertUrlAction,
  assert_color: assertColorAction,
};

/**
 * Execute a single test step using the Strategy Pattern with Self-Healing fallback.
 * @param {import('@playwright/test').Page} page
 * @param {Object} step
 * @param {string} baseUrl
 * @returns {Promise<Object>} Step execution summary
 */
async function executeStep(page, step, baseUrl = '') {
  const startTime = Date.now();
  let retryCount = 0;
  const healingContext = { selfHealed: false, healedSelector: null };

  try {
    await withRetry(
      async () => {
        await executeStepWithStrategy(page, step, baseUrl, healingContext);
      },
      step.retry || { max_attempts: 1, backoff_ms: 500 },
      { classify },
      (attempt) => { retryCount = attempt; }
    );

    return {
      step_no: step.step_no,
      result: 'PASS',
      duration_ms: Date.now() - startTime,
      retry_count: retryCount,
      resolved_by: healingContext.resolvedBy || 'direct',
      self_healed: healingContext.selfHealed,
      healed_selector: healingContext.healedSelector
    };
  } catch (primaryError) {
    const errorCategory = classify(primaryError);
    const enhancedError = new Error(primaryError.message);
    enhancedError.category = errorCategory;
    enhancedError.retry_count = retryCount;
    throw enhancedError;
  }
}

/**
 * Internal single-attempt execution for a step.
 * @param {import('@playwright/test').Page} page
 * @param {Object} step
 * @param {string} baseUrl
 * @param {Object} healingContext - Mutable context to track self-healing state
 */
async function executeStepWithStrategy(page, step, baseUrl, healingContext = {}) {
  const handler = ACTION_STRATEGIES[step.action];
  if (!handler) {
    throw new Error(`Aksi tidak didukung: '${step.action}'. Aksi valid: ${Object.keys(ACTION_STRATEGIES).join(', ')}`);
  }

  const isElementAction = !['goto', 'wait', 'screenshot'].includes(step.action);

  // Pre-action stabilization & overlays dismissal (only for element interactions, preserve popups/toasts for assertions)
  if (isElementAction && step.action !== 'assert_text' && step.action !== 'assert_visible') {
    await autoDismissOverlays(page);
  }

  // Resolve locator if step defines a target for element interaction
  let locator = null;
  if (isElementAction && step.target) {
    const resolved = await resolveLocatorWithFallback(page, step.target, 3000, step.action);
    healingContext.resolvedBy = resolved?.strategyUsed || 'direct';
    const candidate = (resolved && resolved.locator) ? resolved.locator : resolved;
    locator = (candidate && typeof candidate === 'object' && typeof candidate.evaluate === 'function') ? candidate : null;
    if (locator && resolved?.strategyUsed && resolved.strategyUsed !== 'fallback_primary') {
      locator.__alreadyResolved = true;
    }

    // AI Self-Healing: if locator failed and action requires a target element, ask Groq AI to find replacement
    if (!locator) {
      const healing = await attemptSelfHealing(page, step.action, step.target, step.expected_result || '');
      if (healing && healing.locator) {
        locator = healing.locator;
        locator.__alreadyResolved = true;
        healingContext.selfHealed = true;
        healingContext.healedSelector = healing.healedSelector || null;
      }
    }
  }

  // Apply wait_before AFTER locator resolution so locator-dependent waits (visible, attached) work
  await applyWaitCondition(page, step.wait_before, locator);

  // Smart Action Adaptation: If LLM chose 'fill' or 'select' but element is a Select2 dropdown
  if ((step.action === 'fill' || step.action === 'select') && locator) {
    if (await isSelect2Element(locator)) {
      await searchSelect2Action({ page, locator, step });
      await applyPostActionWait(page, step.wait_after);
      return;
    }
    locator.__checkedSelect2 = true;
  }

  // Execute modular handler
  await handler({ page, locator, step, baseUrl });

  // Post-action wait
  await applyPostActionWait(page, step.wait_after);
}

module.exports = {
  executeStep,
  ACTION_STRATEGIES
};
