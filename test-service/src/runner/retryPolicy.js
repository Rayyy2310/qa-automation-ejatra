/**
 * High-Speed Resilient Retry Policy for Playwright
 * Optimized for fast recovery without stalling tests
 */

/** @type {number} Maximum retry attempts allowed */
const MAX_RETRY_CAP = 3;
/** @type {number[]} Default backoff delays in ms */
const DEFAULT_BACKOFFS = [300, 600];
/** @type {number} Maximum backoff delay cap in ms */
const BACKOFF_CEILING_MS = 800;
/** @type {number} Fallback delay when backoff array is exhausted */
const FALLBACK_DELAY_MS = 300;

/** Error categories that should NOT be retried */
const NON_RETRYABLE_CATEGORIES = [
  'assertion_failed',
  'action_rejected_not_whitelisted'
];

/**
 * Execute an async function with configurable retry and exponential backoff.
 * @param {Function} fn - Async function to execute
 * @param {Object} retryConfig - Retry configuration
 * @param {number} [retryConfig.max_attempts=2] - Max attempts (capped at MAX_RETRY_CAP)
 * @param {number|number[]} [retryConfig.backoff_ms=[300,600]] - Backoff delays in ms
 * @param {Object} errorClassifier - Object with classify(error) method
 * @param {Function} [onAttempt] - Callback invoked with attempt number
 */
async function withRetry(fn, retryConfig, errorClassifier, onAttempt = () => {}) {
  const maxAttempts = Math.min(retryConfig?.max_attempts || 2, MAX_RETRY_CAP);

  // Normalize backoff_ms: accept Number, Array, or fallback to defaults
  const rawBackoffs = retryConfig?.backoff_ms;
  const normalizedBackoffs = Array.isArray(rawBackoffs)
    ? rawBackoffs
    : (typeof rawBackoffs === 'number' ? [rawBackoffs] : DEFAULT_BACKOFFS);
  const backoffs = normalizedBackoffs.map(b => Math.min(b, BACKOFF_CEILING_MS));

  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    onAttempt(attempt);
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const category = errorClassifier ? errorClassifier.classify(error) : 'error';

      // Do NOT retry non-retryable error categories
      if (NON_RETRYABLE_CATEGORIES.includes(category)) throw error;

      // Fast retry for transient errors
      if (attempt < maxAttempts - 1) {
        const delay = backoffs[Math.min(attempt, backoffs.length - 1)] || FALLBACK_DELAY_MS;
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

module.exports = {
  withRetry
};
