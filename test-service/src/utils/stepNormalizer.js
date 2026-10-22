/**
 * Universal Step Normalizer for LLM Generated Test Plans
 * Handles all variations of JSON syntax, aliases, prefixes, multi-line fallbacks, and units
 */

const ACTION_MAP = {
  // Navigation
  goto: 'goto',
  navigate: 'goto',
  open: 'goto',
  visit: 'goto',
  url: 'goto',
  browse: 'goto',
  buka: 'goto',
  kunjungi: 'goto',
  tuju: 'goto',

  // Click / Tap
  click: 'click',
  tap: 'click',
  press: 'click',
  klik: 'click',
  pilih: 'click',
  tekan: 'click',
  pencet: 'click',

  // Fill / Input
  fill: 'fill',
  type: 'fill',
  input: 'fill',
  write: 'fill',
  enter: 'fill',
  isi: 'fill',
  ketik: 'fill',
  masukkan: 'fill',
  set: 'fill',

  // Select / Dropdown
  select: 'select',
  choose: 'select',
  pick: 'select',
  dropdown: 'select',
  option: 'select',
  pilih_opsi: 'select',
  combobox: 'select',

  // Search
  search: 'search',
  find: 'search',
  query: 'search',
  filter: 'search',
  cari: 'search',
  temukan: 'search',

  // Wait
  wait: 'wait',
  sleep: 'wait',
  pause: 'wait',
  delay: 'wait',
  tunggu: 'wait',
  jeda: 'wait',

  // Assertions
  assert_visible: 'assert_visible',
  verify_visible: 'assert_visible',
  check_visible: 'assert_visible',
  should_be_visible: 'assert_visible',
  expect_visible: 'assert_visible',
  see: 'assert_visible',
  tampak: 'assert_visible',
  terlihat: 'assert_visible',
  muncul: 'assert_visible',

  assert_text: 'assert_text',
  verify_text: 'assert_text',
  check_text: 'assert_text',
  should_contain: 'assert_text',
  expect_text: 'assert_text',
  cek_teks: 'assert_text',
  pastikan_teks: 'assert_text',

  assert_url: 'assert_url',
  verify_url: 'assert_url',
  check_url: 'assert_url',
  should_be_url: 'assert_url',
  cek_url: 'assert_url',

  assert_color: 'assert_color',
  verify_color: 'assert_color',
  check_color: 'assert_color',
  cek_warna: 'assert_color',
  pastikan_warna: 'assert_color',
  assert_style: 'assert_color',
  verify_style: 'assert_color',
  check_style: 'assert_color',

  // Screenshot
  screenshot: 'screenshot',
  capture: 'screenshot',
  snapshot: 'screenshot',
  take_screenshot: 'screenshot',
  potret: 'screenshot',
  foto: 'screenshot'
};

function normalizeAction(rawAction) {
  if (!rawAction) return 'wait';
  const clean = String(rawAction).trim().toLowerCase().replace(/[\s\-_]+/g, '_');
  return ACTION_MAP[clean] || 'click';
}

const { stripActionFluff } = require('./locatorResolver');

function parseTarget(rawTarget) {
  if (!rawTarget) return null;

  // 1. If target is already an object
  if (typeof rawTarget === 'object') {
    const strategy = rawTarget.strategy || 'css';
    let value = rawTarget.value || rawTarget.selector || rawTarget.locator || rawTarget.element || '';
    const fallback = rawTarget.fallback || null;
    if (strategy === 'text' && typeof value === 'string') {
      value = stripActionFluff(value);
    }
    return { strategy, value, fallback };
  }

  // 2. If target is a string
  const str = String(rawTarget).trim();
  if (!str) return null;

  let mainPart = str;
  let fallbackPart = null;

  // Check for multiline fallback like "css input[name='username']\nfallback: #username"
  if (str.includes('\n') || str.toLowerCase().includes('fallback:')) {
    const lines = str.split(/\r?\n|fallback:/i).map(s => s.trim()).filter(Boolean);
    if (lines.length > 0) mainPart = lines[0];
    if (lines.length > 1) fallbackPart = lines[1];
  }

  // Check for strategy prefixes like "css body", "text Masuk", "xpath //button", "id username"
  let strategy = 'text';
  let cleanValue = mainPart;

  const prefixMatch = mainPart.match(/^(css|xpath|text|role|label|placeholder|id|name)\s*[:= ]\s*(.+)$/i);
  if (prefixMatch) {
    strategy = prefixMatch[1].toLowerCase();
    cleanValue = prefixMatch[2].trim();
  } else if (
    mainPart.startsWith('#') || 
    mainPart.startsWith('.') || 
    mainPart.startsWith('[') || 
    mainPart.includes(' > ') || 
    mainPart.includes('[name=') ||
    mainPart.includes(':has-text')
  ) {
    strategy = 'css';
  } else if (mainPart.startsWith('//') || mainPart.startsWith('xpath=')) {
    strategy = 'xpath';
    cleanValue = mainPart.replace(/^xpath=/, '');
  }

  if (strategy === 'text' && cleanValue) {
    cleanValue = stripActionFluff(cleanValue);
  }

  return {
    strategy,
    value: cleanValue,
    fallback: fallbackPart
  };
}

function parseWaitStrategy(rawWait) {
  if (!rawWait) return { type: 'none', timeout_ms: 5000 };
  if (typeof rawWait === 'object') return rawWait;

  const str = String(rawWait).trim().toLowerCase();
  if (str === 'none' || str === '-' || str === 'null') {
    return { type: 'none', timeout_ms: 0 };
  }

  const numMatch = str.match(/(\d+)/);
  const timeout_ms = numMatch ? parseInt(numMatch[1], 10) : 5000;

  if (str.includes('enabled')) return { type: 'enabled', timeout_ms };
  if (str.includes('visible')) return { type: 'visible', timeout_ms };
  if (str.includes('attached')) return { type: 'attached', timeout_ms };
  if (str.includes('network')) return { type: 'network_idle', timeout_ms };

  return { type: 'visible', timeout_ms };
}

function parseRetry(rawRetry) {
  if (!rawRetry) return { max_attempts: 1, backoff_ms: [500] };
  if (typeof rawRetry === 'object' && rawRetry.max_attempts) return rawRetry;

  const str = String(rawRetry).trim().toLowerCase();
  const numMatch = str.match(/(\d+)/);
  const attempts = numMatch ? parseInt(numMatch[1], 10) : 1;

  return {
    max_attempts: Math.max(1, attempts),
    backoff_ms: [500, 1000, 2000]
  };
}

function resolveEnvPlaceholders(value, target, expected_result) {
  if (value === null || value === undefined) return value;
  const str = String(value).trim();

  // Pattern matching: {username_from_env}, {{USERNAME_FROM_ENV}}, {env.username}, {username}
  if (/^\{{1,2}\s*(?:username_from_env|username|env\.username)\s*\}{1,2}$/i.test(str)) {
    const user = (process.env.EJATRA_TEST_USERNAME || process.env.EJATRA_USERNAME || '').replace(/^['"]+|['"]+$/g, '').trim();
    if (user) return user;
  }

  // Pattern matching: {password_from_env}, {{PASSWORD_FROM_ENV}}, {env.password}, {password}
  if (/^\{{1,2}\s*(?:password_from_env|password|env\.password)\s*\}{1,2}$/i.test(str)) {
    const pass = (process.env.EJATRA_TEST_PASSWORD || process.env.EJATRA_PASSWORD || '').replace(/^['"]+|['"]+$/g, '').trim();
    if (pass) return pass;
  }

  // Generic {VAR_from_env} or {env.VAR}
  const genericMatch = str.match(/^\{{1,2}\s*(?:env\.([a-zA-Z0-9_]+)|([a-zA-Z0-9_]+)_from_env)\s*\}{1,2}$/i);
  if (genericMatch) {
    const varName = genericMatch[1] || genericMatch[2];
    const upper = varName.toUpperCase();
    const candidate = process.env[upper] ||
                      process.env[`EJATRA_${upper}`] ||
                      process.env[`EJATRA_TEST_${upper}`];
    if (candidate) {
      return String(candidate).replace(/^['"]+|['"]+$/g, '').trim();
    }
  }

  return value;
}

function normalizeStep(step, idx = 0) {
  if (!step || typeof step !== 'object') {
    return {
      step_no: idx + 1,
      action: 'wait',
      target: null,
      value: null,
      expected_result: ''
    };
  }

  const rawAction = step.action || step.type || step.command || step.method || step.step_type;
  const action = normalizeAction(rawAction);

  const rawTarget = step.target || step.selector || step.locator || step.element || step.target_selector;
  const target = parseTarget(rawTarget);

  let value = step.value ?? step.input ?? step.text ?? step.query ?? step.url ?? null;
  if (value === '-' || value === 'none' || value === 'null') value = null;
  value = resolveEnvPlaceholders(value, target, step.expected_result || step.expectation || '');

  // Clean value for wait (e.g. "8000ms" -> "8000")
  if (action === 'wait' && typeof value === 'string') {
    const numMatch = value.match(/(\d+)/);
    if (numMatch) value = numMatch[1];
  }

  // Clean value for goto (if target had "/" but value was empty)
  if (action === 'goto' && !value && target && target.value) {
    value = target.value;
  }

  const wait_before = parseWaitStrategy(step.wait_before || step.wait_strategy || step.wait);
  const retry = parseRetry(step.retry || step.retries || step.retry_count);
  const expected_result = step.expected_result || step.expectation || step.ekspektasi || step.description || '';

  return {
    step_no: Number(step.step_no || step.no || (idx + 1)),
    action,
    target,
    value,
    wait_before,
    post_action_wait: step.post_action_wait || { type: 'none', timeout_ms: 300 },
    retry,
    expected_result,
    on_failure: step.on_failure || 'stop'
  };
}

function normalizeTestPlan(rawPlan) {
  if (!rawPlan) return { steps: [] };

  let steps = [];
  if (Array.isArray(rawPlan)) {
    steps = rawPlan;
  } else if (typeof rawPlan === 'object') {
    steps = rawPlan.steps || rawPlan.test_plan || rawPlan.plan || rawPlan.scenario || [];
  }

  const normalizedSteps = steps.map((s, i) => normalizeStep(s, i));

  return {
    test_case_id: rawPlan.test_case_id || 'TC-LLM-AUTO',
    module: rawPlan.module || 'General',
    base_url: rawPlan.base_url || '',
    mode: rawPlan.mode || 'read_only',
    steps: normalizedSteps
  };
}

module.exports = {
  normalizeAction,
  parseTarget,
  parseWaitStrategy,
  parseRetry,
  resolveEnvPlaceholders,
  normalizeStep,
  normalizeTestPlan
};
