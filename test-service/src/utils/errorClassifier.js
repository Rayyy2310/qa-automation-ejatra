/**
 * Standardized error categories for the test runner
 */
const ERROR_CATEGORIES = {
  TIMEOUT: 'timeout_waiting_condition',
  ELEMENT_NOT_FOUND: 'element_not_found',
  ASSERTION_FAILED: 'assertion_failed',
  NETWORK_ERROR: 'network_error',
  ACTION_REJECTED: 'action_rejected_not_whitelisted',
};

/**
 * Classify errors into categories for retry/reporting decisions.
 * @param {Error|string|*} error - The error to classify (handles non-Error objects safely)
 * @returns {string} - The error category
 */
function classify(error) {
  const message = String(error?.message || error || '').toLowerCase();

  // 1. Explicit timeout not caused by an assertion
  if (message.includes('timeout') && !message.includes('expect') && !message.includes('asersi') && !message.includes('validasi')) {
    return ERROR_CATEGORIES.TIMEOUT;
  }

  // 2. Assertion failure (expect, assertion, asersi, validasi, expected)
  // MUST precede 'waiting for locator' because Playwright's call logs in failed assertions contain 'waiting for locator'!
  if (
    message.includes('expect') ||
    message.includes('assertion') ||
    message.includes('asersi') ||
    message.includes('validasi') ||
    message.includes('expected substring') ||
    message.includes('expected string') ||
    message.includes('received string') ||
    message.includes('received array')
  ) {
    return ERROR_CATEGORIES.ASSERTION_FAILED;
  }

  // 3. Element not found during action execution (click, fill, select, etc.)
  if (message.includes('waiting for locator') || message.includes('not found')) {
    return ERROR_CATEGORIES.ELEMENT_NOT_FOUND;
  }

  if (message.includes('econnrefused') || message.includes('network') || message.includes('disconnected')) {
    return ERROR_CATEGORIES.NETWORK_ERROR;
  }

  if (message.includes('not whitelisted')) {
    return ERROR_CATEGORIES.ACTION_REJECTED;
  }

  return ERROR_CATEGORIES.TIMEOUT;
}

module.exports = {
  classify,
  ERROR_CATEGORIES
};
