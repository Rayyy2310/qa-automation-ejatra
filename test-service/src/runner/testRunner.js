const { chromium } = require('@playwright/test');
const axios = require('axios');
const winston = require('winston');
const fs = require('fs');
const path = require('path');
const { executeStep } = require('./stepExecutor');
const { captureFailure } = require('../utils/screenshotHelper');
const { normalizeTestPlan } = require('../utils/stepNormalizer');
const { bringWindowToForeground, cleanupOrphanPlaywrightProcesses } = require('../utils/windowHelper');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()]
});

const DEFAULT_TIMEOUT = 5000;
const NAVIGATION_TIMEOUT = 30000;
const CALLBACK_TIMEOUT = 10000;

function createSkippedStepResult(step, index) {
  return {
    step_no: step.step_no || (index + 1),
    action: step.action || '',
    target: step.target || null,
    value: step.value || null,
    expected_result: step.expected_result || '',
    result: 'SKIPPED',
    duration_ms: 0,
    retry_count: 0
  };
}

function createFailedStepResult(step, index, error, startTime, failureData) {
  return {
    step_no: step.step_no || (index + 1),
    action: step.action || '',
    target: step.target || null,
    value: step.value || null,
    expected_result: step.expected_result || '',
    result: 'FAIL',
    error: error.message,
    error_category: error.category || 'timeout_waiting_condition',
    retry_count: error.retry_count || 0,
    duration_ms: Date.now() - startTime,
    screenshot: failureData.screenshotPath,
    dom_snapshot: failureData.domSnapshot
  };
}

// Map of active test sessions for cancellation & parallel management
const activeSessions = new Map();

// ─── Concurrency Limiter (Semaphore) ─────────────────────────────────────────
// Membatasi jumlah browser Chromium yang hidup bersamaan agar CPU/RAM/GPU aman.
// Run di atas batas menunggu di antrean FIFO dan otomatis jalan saat slot kosong.
const MAX_CONCURRENT_RUNS = Math.max(1, parseInt(process.env.MAX_CONCURRENT_RUNS, 10) || 4);
let runningSlots = 0;
const waitQueue = []; // { idStr, resolve }

/**
 * Ambil satu slot eksekusi. Resolve true jika slot didapat, false jika dibatalkan saat mengantre.
 * @param {string} idStr
 * @returns {Promise<boolean>}
 */
function acquireSlot(idStr) {
  return new Promise((resolve) => {
    if (runningSlots < MAX_CONCURRENT_RUNS) {
      runningSlots++;
      resolve(true);
    } else {
      waitQueue.push({ idStr, resolve });
    }
  });
}

/** Lepas slot dan teruskan ke run berikutnya di antrean. */
function releaseSlot() {
  runningSlots = Math.max(0, runningSlots - 1);
  while (waitQueue.length > 0 && runningSlots < MAX_CONCURRENT_RUNS) {
    const next = waitQueue.shift();
    runningSlots++;
    next.resolve(true);
  }
}

/** Keluarkan run yang masih mengantre (tanpa mengambil slot). */
function cancelWaiting(idStr) {
  const idx = waitQueue.findIndex(w => w.idStr === idStr);
  if (idx >= 0) {
    const [waiter] = waitQueue.splice(idx, 1);
    waiter.resolve(false);
  }
}

/** Snapshot kondisi antrean untuk monitoring UI. */
function getQueueState() {
  return {
    max: MAX_CONCURRENT_RUNS,
    running: runningSlots,
    queued: waitQueue.length,
    queued_run_ids: waitQueue.map(w => w.idStr)
  };
}

/**
 * Cancel a currently running test run
 * @param {string|number} runId - Unique identifier of test run
 * @returns {boolean} - Whether the test was found and cancelled
 */
function cancelTest(runId) {
  const idStr = String(runId);
  const session = activeSessions.get(idStr);
  if (session) {
    session.isCancelled = true;
    logger.info(`Cancelling active test run ${idStr}...`);
    cancelWaiting(idStr);
    try {
      if (session.context) session.context.close().catch(err => logger.debug('Context close error:', err.message));
      if (session.browser) session.browser.close().catch(err => logger.debug('Browser close error:', err.message));
    } catch (e) {}
    activeSessions.delete(idStr);
    return true;
  }
  return false;
}

/**
 * Cancel all active test runs and clean up any orphaned Playwright processes.
 */
async function resetAllSessions() {
  logger.info('Resetting all active sessions and cleaning up processes...');
  for (const [idStr, session] of activeSessions.entries()) {
    try {
      session.isCancelled = true;
      cancelWaiting(idStr);
      if (session.context) await session.context.close().catch(() => {});
      if (session.browser) await session.browser.close().catch(() => {});
    } catch (e) {}
    activeSessions.delete(idStr);
  }
  await cleanupOrphanPlaywrightProcesses();
  return true;
}

/**
 * Main test orchestrator with full concurrency & cancellation support
 * @param {Object} testPlan - Test plan object containing base_url and steps
 * @param {string|number} runId - Unique identifier for the test run
 * @param {Object} [options] - Execution options (headless, slowMo, baseUrl)
 * @returns {Promise<Object>} - Overall test results
 */
async function runTest(rawTestPlan, runId, options = {}) {
  const testPlan = normalizeTestPlan(rawTestPlan);
  const idStr = String(runId);
  const isHeadless = options.headless !== undefined 
    ? Boolean(options.headless) 
    : (process.env.BROWSER_HEADLESS === 'true');
    
  const slowMo = options.slowMo !== undefined 
    ? Number(options.slowMo) 
    : 0;

  const baseUrl = options.baseUrl || testPlan.base_url || process.env.EJATRA_TESTING_BASE_URL || '';

  // Parallel mode: allow multiple runs to coexist. Each run registers itself in activeSessions
  // without disturbing other in-progress sessions. Use resetAllSessions() only via the
  // manual "Reset Browser" button in the UI.

  let browser;
  let context;
  let page;
  
  let startTime = Date.now();
  const stepResults = [];
  let passedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let overallStatus = 'passed';
  
  const session = {
    runId: idStr,
    browser: null,
    context: null,
    isCancelled: false
  };
  activeSessions.set(idStr, session);
  let slotHeld = false;

  try {
    // Concurrency gate: tunggu slot kosong (maks MAX_CONCURRENT_RUNS browser sekaligus)
    if (typeof options.onQueued === 'function') {
      try { options.onQueued(getQueueState()); } catch (e) { logger.debug('onQueued error:', e.message); }
    }
    slotHeld = await acquireSlot(idStr);
    if (!slotHeld || session.isCancelled) {
      overallStatus = 'cancelled';
      throw new Error('RUN_CANCELLED_BEFORE_START');
    }
    startTime = Date.now();
    if (typeof options.onStart === 'function') {
      try { options.onStart(); } catch (e) { logger.debug('onStart error:', e.message); }
    }
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check'
    ];

    if (!isHeadless) {
      launchArgs.push('--start-maximized');
    } else {
      launchArgs.push('--window-size=1920,1080');
    }

    browser = await chromium.launch({ 
      headless: isHeadless,
      slowMo,
      args: launchArgs
    });
    session.browser = browser;

    // Create ONE BrowserContext per run
    const contextOptions = {
      ignoreHTTPSErrors: true,
      serviceWorkers: 'block'
    };
    if (isHeadless) {
      contextOptions.viewport = { width: 1920, height: 1080 };
    } else {
      contextOptions.viewport = null; // Use full maximized desktop window
    }

    context = await browser.newContext(contextOptions);
    session.context = context;
    
    let activePage = await context.newPage();
    activePage.setDefaultTimeout(DEFAULT_TIMEOUT);
    if (!isHeadless) {
      await activePage.bringToFront().catch(err => logger.debug('Bring to front error:', err.message));
      bringWindowToForeground();
      setTimeout(() => bringWindowToForeground(), 1200);
    }

    // Auto-track and switch to newly opened tabs / popups (e.g. Cetak PDF tab)
    context.on('page', async newPage => {
      logger.info(`[MultiTab] New browser tab/page opened: ${newPage.url()}`);
      activePage = newPage;
      activePage.setDefaultTimeout(DEFAULT_TIMEOUT);
      if (!isHeadless) {
        await newPage.bringToFront().catch(err => logger.debug('New page bring to front error:', err.message));
      }
      newPage.on('dialog', async dialog => {
        await dialog.accept().catch(err => logger.debug('Dialog accept error:', err.message));
      });
    });

    // Auto-accept native browser dialogs (alert, confirm, prompt)
    activePage.on('dialog', async dialog => {
      logger.info(`Browser dialog triggered: [${dialog.type()}] "${dialog.message()}"`);
      await dialog.accept().catch(err => logger.debug('Global dialog accept error:', err.message));
    });
    
    // Navigate to base_url first if steps don't start with goto
    const firstStep = testPlan.steps && testPlan.steps[0];
    if (firstStep && firstStep.action !== 'goto' && baseUrl && !session.isCancelled) {
      await activePage.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT }).catch(err => logger.debug('Goto base url error:', err.message));
    }
    
    const steps = testPlan.steps || [];

    for (let i = 0; i < steps.length; i++) {
      // If test was cancelled mid-run, skip remaining steps
      if (session.isCancelled) {
        overallStatus = 'cancelled';
        stepResults.push(createSkippedStepResult(steps[i], i));
        skippedCount++;
        continue;
      }

      const step = steps[i];
      const stepStartTime = Date.now();
      let stepResult = null;
      
      try {
        if (overallStatus === 'failed' || overallStatus === 'cancelled') {
          // Skip remaining steps if previous failed
          stepResult = createSkippedStepResult(step, i);
          skippedCount++;
        } else {
          // Always pick latest active page (e.g. if new tab was opened by window.open/Cetak PDF)
          const pages = context.pages();
          if (pages.length > 0) {
            activePage = pages[pages.length - 1];
          }

          stepResult = await executeStep(activePage, step, baseUrl);
          stepResult.action = step.action || '';
          stepResult.target = step.target || null;
          stepResult.value = step.value || null;
          stepResult.expected_result = step.expected_result || '';
          stepResult.result = 'PASS';
          passedCount++;

          // Immediately sync activePage in case this step opened or closed a tab/window
          const pagesAfterStep = context.pages();
          if (pagesAfterStep.length > 0) {
            activePage = pagesAfterStep[pagesAfterStep.length - 1];
          }

          // Capture artifact screenshot for 'screenshot' action or final step of successful run
          if (step.action === 'screenshot' || (i === steps.length - 1 && overallStatus !== 'failed')) {
            try {
              const currentPages = context.pages();
              if (currentPages.length > 0) {
                activePage = currentPages[currentPages.length - 1];
              }
              await activePage.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(err => logger.debug('Wait for load before ss error:', err.message));
              const filename = `run_${runId}_success_step_${step.step_no || (i + 1)}.png`;
              const ssDir = process.env.SCREENSHOT_DIR || './screenshots';
              if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });
              const fullPath = path.join(ssDir, filename);
              await activePage.screenshot({ path: fullPath, fullPage: true }).catch(err => logger.debug('Screenshot error:', err.message));
              stepResult.screenshot = filename;
            } catch (e) {}
          }
        }
      } catch (error) {
        if (session.isCancelled) {
          overallStatus = 'cancelled';
          stepResult = createSkippedStepResult(step, i);
          skippedCount++;
        } else {
          failedCount++;
          overallStatus = 'failed';
          const failureData = await captureFailure(activePage, runId, step.step_no || (i + 1), process.env.SCREENSHOT_DIR || './screenshots');
          
          stepResult = createFailedStepResult(step, i, error, stepStartTime, failureData);
        }
      }

      stepResults.push(stepResult);

      // Real-time live step callback
      if (typeof options.onStepComplete === 'function') {
        try {
          options.onStepComplete(stepResult, {
            total: steps.length,
            passed: passedCount,
            failed: failedCount,
            skipped: skippedCount,
            duration_ms: Date.now() - startTime
          });
        } catch (e) { logger.debug('onStepComplete callback error:', e.message); }
      }
    }
  } catch (error) {
    if (error && error.message === 'RUN_CANCELLED_BEFORE_START') {
      logger.info(`Test run ${runId} dibatalkan sebelum mulai (masih antre).`);
    } else {
      logger.error(`Critical error during test run ${runId}:`, error);
    }
    if (!session.isCancelled) {
      overallStatus = 'failed';
    }
  } finally {
    activeSessions.delete(idStr);
    if (context) {
      await context.close().catch(err => logger.debug('Context close finally error:', err.message));
    }
    if (browser) {
      await browser.close().catch(err => logger.debug('Browser close finally error:', err.message));
    }
    if (slotHeld) {
      releaseSlot();
    }
  }
  
  const totalDurationMs = Date.now() - startTime;
  const results = {
    run_id: runId,
    status: overallStatus.toUpperCase(),
    total_duration_ms: totalDurationMs,
    passed: passedCount,
    failed: failedCount,
    skipped: skippedCount,
    steps: stepResults
  };
  
  // Send callback to CI4 with X-Internal-Token auth
  const callbackUrl = process.env.CI4_CALLBACK_URL || 'http://localhost:8080/ai-automation-test/callback';
  const internalToken = process.env.INTERNAL_API_TOKEN;

  if (!internalToken) {
    logger.warn(`Callback skipped for test run ${runId}: INTERNAL_API_TOKEN env var not set`);
  } else {
    try {
      await axios.post(callbackUrl, results, {
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': internalToken
        },
        timeout: CALLBACK_TIMEOUT
      });
      logger.info(`Callback sent successfully for test run ${runId} with status ${results.status}`);
    } catch (error) {
      logger.error(`Failed to send callback for test run ${runId}:`, error.message);
    }
  }

  return results;
}

module.exports = { 
  runTest,
  cancelTest,
  resetAllSessions,
  getQueueState
};
