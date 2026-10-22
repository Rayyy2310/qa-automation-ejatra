/**
 * server.js — Express HTTP Entry Point for QA Test Service
 *
 * Responsibilities:
 *  - Configure environment & logger.
 *  - Mount auth middleware on /internal routes.
 *  - Register route handlers (test-runs, scan, health, reset).
 *  - Maintain in-memory stores for active test runs & scan jobs,
 *    with automatic TTL pruning to prevent unbounded memory growth.
 *
 * Endpoints:
 *  GET  /health                         — Liveness probe (public)
 *  POST /internal/test-runs             — Create & start a test run
 *  GET  /internal/test-runs/:id/status  — Poll run status
 *  POST /internal/test-runs/:id/cancel  — Cancel a running test
 *  POST /internal/reset-browsers        — Close all browser sessions
 *  POST /internal/scan                  — Start auto-discovery scan
 *  GET  /internal/scan/:id/status       — Poll scan job status
 */

'use strict';

// ─── Core Imports ─────────────────────────────────────────────────────────────
const path    = require('path');
const express = require('express');
const dotenv  = require('dotenv');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');

// ─── Internal Modules ─────────────────────────────────────────────────────────
const authMiddleware                       = require('./middleware/authMiddleware');
const { runTest, cancelTest,
        resetAllSessions, getQueueState }  = require('./runner/testRunner');
const { scanEjatra }                       = require('./scanner/pageScanner');
const { cleanupOrphanPlaywrightProcesses } = require('./utils/windowHelper');

// ─── Environment ──────────────────────────────────────────────────────────────
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const PORT = process.env.PORT || 3001;

// ─── Logger ───────────────────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

// ─── In-Memory Store with TTL Pruning ─────────────────────────────────────────
/**
 * TTL-aware wrapper around Map.
 *
 * Entries whose status is no longer RUNNING / running and whose recorded
 * timestamp is older than `ttlMs` are automatically removed by a periodic
 * background sweep, keeping memory bounded during long-running sessions.
 *
 * @example
 *   const store = new InMemoryStore('testRuns', 2 * 60 * 60 * 1000);
 *   store.set('abc', { status: 'RUNNING', start_time: new Date().toISOString() });
 *   store.get('abc'); // => { status: 'RUNNING', ... }
 */
class InMemoryStore {
  /**
   * @param {string} name       - Label used in pruning log messages.
   * @param {number} ttlMs      - Retention period (ms) for finished entries. Default 2 h.
   * @param {number} intervalMs - Pruning sweep frequency (ms). Default 30 min.
   */
  constructor(name, ttlMs = 2 * 60 * 60 * 1000, intervalMs = 30 * 60 * 1000) {
    this.name  = name;
    this.ttlMs = ttlMs;
    this._map  = new Map();

    // Run the sweep in the background; unref() so it never keeps Node alive alone
    this._pruneTimer = setInterval(() => this._prune(), intervalMs).unref();
  }

  get(key)        { return this._map.get(String(key)); }
  set(key, value) { this._map.set(String(key), value); return this; }
  has(key)        { return this._map.has(String(key)); }
  delete(key)     { return this._map.delete(String(key)); }
  get size()      { return this._map.size; }

  /** Remove stale finished entries older than ttlMs. */
  _prune() {
    const cutoff = Date.now() - this.ttlMs;
    let pruned   = 0;

    for (const [key, entry] of this._map.entries()) {
      // Never evict active entries
      if (entry.status === 'RUNNING' || entry.status === 'running' || entry.status === 'QUEUED') continue;

      const ts = entry.start_time || entry.started;
      if (ts && new Date(ts).getTime() < cutoff) {
        this._map.delete(key);
        pruned++;
      }
    }

    if (pruned > 0) {
      logger.info(`[${this.name}] Pruned ${pruned} stale entries. Remaining: ${this._map.size}`);
    }
  }
}

// Shared stores — one per domain
const testRuns = new InMemoryStore('testRuns');
const scanJobs = new InMemoryStore('scanJobs');

// ─── Express App ──────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Protect all /internal routes with the shared internal-token middleware
app.use('/internal', authMiddleware);

// ─── Route Handlers ───────────────────────────────────────────────────────────

/**
 * GET /health
 * Public liveness probe — no authentication required.
 */
function handleHealth(req, res) {
  return res.status(200).json({ status: 'ok', message: 'Test service is running' });
}

/**
 * POST /internal/test-runs
 * Validate & store a new test run, then execute it asynchronously.
 * Responds 202 Accepted immediately — caller must poll /status for progress.
 */
function handleCreateTestRun(req, res) {
  const payload  = req.body || {};
  const testPlan = payload.test_plan || payload;
  const runId    = payload.run_id || uuidv4();

  if (!testPlan || !Array.isArray(testPlan.steps)) {
    return res.status(400).json({ error: 'Invalid test plan structure' });
  }

  // Propagate base_url from the root payload into testPlan when missing
  if (!testPlan.base_url && payload.base_url) {
    testPlan.base_url = payload.base_url;
  }

  testRuns.set(runId, {
    run_id:          runId,
    status:          'QUEUED',
    start_time:      new Date().toISOString(),
    completed_steps: [],
    result:          null,
  });

  const options = buildRunOptions(payload, testPlan, runId);

  logger.info(
    `Received test run request for Run ID: ${runId}, ` +
    `Total steps: ${testPlan.steps.length}, Headless: ${options.headless}`
  );

  // Fire-and-forget — caller polls via GET /status
  runTest(testPlan, runId, options)
    .then((result) => onTestRunComplete(runId, result))
    .catch((error) => onTestRunError(runId, error));

  return res.status(202).json({ run_id: runId, status: testRuns.get(runId)?.status || 'QUEUED' });
}

/**
 * GET /internal/test-runs/:id/status
 * Return the current in-memory snapshot of a test run.
 */
function handleGetTestRunStatus(req, res) {
  const runId   = req.params.id;
  const runData = testRuns.get(runId);

  if (!runData) {
    return res.status(404).json({ error: 'Test run not found' });
  }

  return res.status(200).json({
    run_id:          runId,
    status:          runData.status,
    completed_steps: runData.completed_steps || [],
    summary:         runData.summary         || null,
    result:          runData.result          || null,
  });
}

/**
 * POST /internal/test-runs/:id/cancel
 * Signal the runner to stop and mark the run as CANCELLED in the store.
 */
function handleCancelTestRun(req, res) {
  const runId     = req.params.id;
  const wasActive = cancelTest(runId);

  const runData  = testRuns.get(runId) || {};
  runData.status = 'CANCELLED';
  testRuns.set(runId, runData);

  logger.info(`Test run ${runId} cancel requested. Was active: ${wasActive}`);

  return res.status(200).json({
    success:    true,
    message:    `Test run ${runId} cancelled`,
    was_active: wasActive,
  });
}

/**
 * POST /internal/reset-browsers
 * Close all open Playwright browser sessions and kill any orphaned processes.
 */
async function handleResetBrowsers(req, res) {
  try {
    await resetAllSessions();
    return res.status(200).json({ success: true, message: 'Semua proses browser berhasil dibersihkan' });
  } catch (err) {
    logger.error('Reset browsers error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * POST /internal/scan
 * Launch an auto-discovery page scan asynchronously.
 * Responds 202 Accepted immediately — caller must poll /scan/:id/status.
 */
function handleStartScan(req, res) {
  const rawBody       = req.body || {};
  const base_url      = (rawBody.base_url || process.env.EJATRA_TESTING_BASE_URL || '').replace(/^['"]+|['"]+$/g, '').trim();
  const username      = (rawBody.username || process.env.EJATRA_TEST_USERNAME || process.env.EJATRA_USERNAME || '').replace(/^['"]+|['"]+$/g, '').trim();
  const password      = (rawBody.password || process.env.EJATRA_TEST_PASSWORD || process.env.EJATRA_PASSWORD || '').replace(/^['"]+|['"]+$/g, '').trim();
  const callback_url  = rawBody.callback_url;
  const scan_id       = rawBody.scan_id;
  const target_url    = rawBody.target_url;

  if (!base_url || !username || !password) {
    return res.status(400).json({
      error: 'Missing required fields: base_url, username, password (pastikan EJATRA_TESTING_BASE_URL, EJATRA_TEST_USERNAME, dan EJATRA_TEST_PASSWORD sudah diatur di .env)',
    });
  }

  const sid           = scan_id || uuidv4();
  const internalToken = process.env.INTERNAL_API_TOKEN
                      || req.headers['x-internal-token']
                      || '';

  scanJobs.set(sid, { status: 'running', started: new Date().toISOString() });
  logger.info(`[Scanner] Starting scan ${sid} for ${base_url} as user "${username}"${target_url ? ` (target: ${target_url})` : ''}`);

  // Respond before the long-running scan begins
  res.status(202).json({ scan_id: sid, status: 'running' });

  scanEjatra({
    baseUrl: base_url,
    username,
    password,
    callbackUrl: callback_url,
    scanId: sid,
    internalToken,
    targetUrl: target_url || null,
  })
    .then((result) => onScanComplete(sid, result))
    .catch((err)   => onScanError(sid, err));
}

/**
 * GET /internal/scan/:id/status
 * Return the current state of a scan job.
 */
function handleGetScanStatus(req, res) {
  const data = scanJobs.get(req.params.id);
  if (!data) return res.status(404).json({ error: 'Scan not found' });
  return res.json(data);
}

// ─── Route Registration ───────────────────────────────────────────────────────
app.get ('/health',                        handleHealth);
app.post('/internal/test-runs',            handleCreateTestRun);
app.get ('/internal/test-runs/:id/status', handleGetTestRunStatus);
app.post('/internal/test-runs/:id/cancel', handleCancelTestRun);
app.post('/internal/reset-browsers',       handleResetBrowsers);
app.post('/internal/scan',                 handleStartScan);
app.post('/internal/scan-page',            handleStartScan);
app.get ('/internal/scan/:id/status',      handleGetScanStatus);
app.get ('/internal/queue-state',          (req, res) => res.json(getQueueState()));

// Global error handler — catches errors thrown (or next()'d) by any route
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Private Helpers ──────────────────────────────────────────────────────────

/**
 * Construct the options object expected by testRunner.runTest().
 * Extracted to keep handleCreateTestRun concise.
 *
 * @param {Object} payload  - Raw HTTP request body.
 * @param {Object} testPlan - Parsed test plan (may be nested inside payload).
 * @param {string} runId    - Unique run identifier.
 * @returns {Object} Runner options.
 */
function buildRunOptions(payload, testPlan, runId) {
  const isHeadless = payload.headless !== undefined
    ? Boolean(payload.headless)
    : (payload.options?.headless !== undefined
      ? Boolean(payload.options.headless)
      : (process.env.BROWSER_HEADLESS === 'true'));

  return {
    headless: isHeadless,
    baseUrl:  payload.base_url || payload.baseUrl || testPlan.base_url,
    slowMo:   payload.slowMo  !== undefined ? Number(payload.slowMo) : 0,

    /** Called by testRunner when a concurrency slot is acquired and the browser is about to launch. */
    onStart() {
      const runData = testRuns.get(runId) || {};
      if (runData.status !== 'CANCELLED') {
        runData.status = 'RUNNING';
        runData.started_running_at = new Date().toISOString();
        testRuns.set(runId, runData);
      }
    },
    /** Called by testRunner each time a step finishes — keeps store in sync. */
    onStepComplete(stepRes, summary) {
      const runData = testRuns.get(runId) || {};
      if (!runData.completed_steps) runData.completed_steps = [];
      runData.completed_steps.push(stepRes);
      runData.summary = summary;
      testRuns.set(runId, runData);
    },
  };
}

/**
 * Update the store when a test run finishes (pass or fail at the run level).
 *
 * @param {string} runId  - Unique run identifier.
 * @param {Object} result - Full result object returned by testRunner.
 */
function onTestRunComplete(runId, result) {
  const runData     = testRuns.get(runId) || {};
  const finalStatus = (result.status || result.overall_status || '').toLowerCase();

  runData.status = (finalStatus === 'passed' || finalStatus === 'completed')
    ? 'COMPLETED'
    : (finalStatus === 'cancelled' ? 'CANCELLED' : 'FAILED');
  runData.result = result;

  testRuns.set(runId, runData);
  logger.info(`Completed test run for Run ID: ${runId} with status: ${runData.status}`);
}

/**
 * Update the store when a test run crashes with an uncaught error.
 *
 * @param {string} runId - Unique run identifier.
 * @param {Error}  error - The error that caused the crash.
 */
function onTestRunError(runId, error) {
  logger.error(`Test run ${runId} failed critically:`, error);
  const runData  = testRuns.get(runId) || {};
  runData.status = 'FAILED';
  runData.error  = error.message;
  testRuns.set(runId, runData);
}

/**
 * Update the store when a scan job completes successfully.
 *
 * @param {string} sid    - Scan job identifier.
 * @param {Object} result - Scan result returned by scanEjatra.
 */
function onScanComplete(sid, result) {
  scanJobs.set(sid, { status: 'completed', result });
  logger.info(
    `[Scanner] Scan ${sid} completed: ${result.total_pages} pages, ` +
    `${result.total_elements} elements`
  );
}

/**
 * Update the store when a scan job fails.
 *
 * @param {string} sid - Scan job identifier.
 * @param {Error}  err - Error thrown by scanEjatra.
 */
function onScanError(sid, err) {
  scanJobs.set(sid, { status: 'failed', error: err.message });
  logger.error(`[Scanner] Scan ${sid} failed: ${err.message}`);
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`Test service listening on port ${PORT}`);
  cleanupOrphanPlaywrightProcesses();
});
