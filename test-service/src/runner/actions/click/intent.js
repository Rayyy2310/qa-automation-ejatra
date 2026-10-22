'use strict';

/**
 * click/intent.js — Pure Intent & Context Builders for Click Action
 *
 * Semua deteksi intent berbasis string dipusatkan di sini (tanpa ketergantungan Playwright)
 * agar tidak ada duplikasi perhitungan di clickAction, resolveTarget, rowActionGuard,
 * modalScope, dan postClick, serta dapat diuji secara unit-test murni.
 */

const { resolveTargetString } = require('../../../utils/urlHelper');
const { ROW_ACTION_KEYWORDS, SUBMIT_LOGIN_KEYWORDS } = require('../../../utils/constants');
const { isSelectorString } = require('../../../utils/locatorResolver');
const appProfile = require('../../../utils/appProfile');

const DEFAULT_SELECT_ALL_TOKENS = ['chk_all', 'select_all', 'thead', 'pilih semua', 'centang semua'];

/**
 * Deteksi apakah target/value merupakan checkbox Select-All di header tabel.
 */
function isHeaderSelectAll(rawTarget, targetStr, valStr = '') {
  const selectAllTokens = appProfile.get('selectAllTokens', DEFAULT_SELECT_ALL_TOKENS);
  return (
    selectAllTokens.some(k => targetStr.includes(k) || valStr.includes(k)) ||
    Boolean(rawTarget && typeof rawTarget === 'string' && selectAllTokens.some(k => rawTarget.includes(k)))
  );
}

/**
 * Deteksi apakah target merupakan checkbox baris tabel (bukan header Select-All).
 */
function isRowCheckbox(targetStr, headerSelectAll = false) {
  return !headerSelectAll && (
    targetStr.includes("input[type='checkbox']") ||
    targetStr.includes('input[type="checkbox"]') ||
    targetStr.includes('checkbox') ||
    targetStr.includes('centang')
  );
}

/**
 * Deteksi apakah target menunjuk ke baris tabel atau elemen di dalam baris tabel.
 */
function isTableRowTarget(targetStr) {
  return (
    targetStr.includes('tr:') ||
    targetStr.includes('tbody') ||
    targetStr.includes('tr:has-text') ||
    targetStr.includes('dropdown-toggle') ||
    targetStr.includes('baris') ||
    targetStr.includes('row')
  );
}

/**
 * Bangun objek konteks klik tunggal dari `step`, `baseUrl`, dan opsional state runtime (`page`, `isModalOpen`, `activeModalLoc`).
 *
 * @param {object} step
 * @param {string} baseUrl
 * @param {object} [runtime]
 * @param {import('@playwright/test').Page|null} [runtime.page]
 * @param {boolean} [runtime.isModalOpen]
 * @param {import('@playwright/test').Locator|null} [runtime.activeModalLoc]
 */
function buildClickContext(step, baseUrl, runtime = {}) {
  const rawTarget = resolveTargetString(step.target);
  const targetStr = String(rawTarget).toLowerCase();
  const valStr    = String(step.value || '').toLowerCase();
  const expStr    = String(step.expected_result || '').toLowerCase();

  const headerSelectAll = isHeaderSelectAll(rawTarget, targetStr, valStr);

  const isSpecificRowTarget =
    targetStr.includes('tr:has-text') ||
    targetStr.includes('tbody tr') ||
    Boolean(rawTarget && typeof rawTarget === 'string' && rawTarget.match(/\b\d{2,}[A-Za-z0-9\-\/._]+\b/));

  const rowCheckbox = isRowCheckbox(targetStr, headerSelectAll);
  const isCheckboxOrSelectAll = headerSelectAll || rowCheckbox;
  const isSubmitOrLogin = SUBMIT_LOGIN_KEYWORDS.some(k => targetStr.includes(k) || valStr.includes(k));
  const tableRowTarget = isTableRowTarget(targetStr);

  return {
    page: runtime.page || null,
    step,
    baseUrl,
    rawTarget,
    targetStr,
    valStr,
    expStr,
    isModalOpen: Boolean(runtime.isModalOpen),
    activeModalLoc: runtime.activeModalLoc || null,
    isHeaderSelectAll: headerSelectAll,
    isSpecificRowTarget,
    isRowCheckbox: rowCheckbox,
    isCheckboxOrSelectAll,
    isSubmitOrLogin,
    isTableRowTarget: tableRowTarget,
  };
}

/**
 * Cek apakah URL adalah halaman login (identik dengan implementasi asli di clickAction.js).
 *
 * @param {string} url
 * @returns {boolean}
 */
function isLoginPageUrl(url) {
  return url.includes('/masuk') || url.endsWith('/') ||
         url.endsWith(':8080') || url.endsWith(':8080/');
}

/**
 * Ekstrak query baris dari target `tr:has-text('...')` atau pola nomor dokumen `NNN/XXX`.
 *
 * @param {string} rawTarget
 * @returns {{ trMatch: RegExpMatchArray|null, docMatch: RegExpMatchArray|null }}
 */
function extractRowMatches(rawTarget) {
  if (!rawTarget || typeof rawTarget !== 'string') {
    return { trMatch: null, docMatch: null };
  }
  return {
    trMatch: rawTarget.match(/tr:has-text\(['"]([^'"]+)['"]\)/i),
    docMatch: rawTarget.match(/\d{3}\/[A-Za-z0-9\-\/]+/),
  };
}

/**
 * Deteksi apakah langkah ini memenuhi kriteria aksi baris tabel (hamburger / inline).
 *
 * @param {ReturnType<typeof buildClickContext>} ctx
 * @param {boolean} [isModalOpen=ctx.isModalOpen]
 */
function detectRowActionIntent(ctx, isModalOpen = ctx.isModalOpen) {
  const { rawTarget, targetStr, valStr } = ctx;

  const isReportOrToolbar = ['laporan', 'report', 'rekap', 'excel', 'summary', 'progress']
    .some(k => targetStr.includes(k) || valStr.includes(k));
  const isExplicitRowIntent = ['baris', 'row', 'hamburger', 'kolom aksi', 'aksi baris']
    .some(k => targetStr.includes(k) || valStr.includes(k));
  const isExplicitSelector = isSelectorString(rawTarget) ||
    Boolean(rawTarget && typeof rawTarget === 'string' && rawTarget.startsWith('#'));

  const { trMatch: trRowMatch, docMatch } = extractRowMatches(rawTarget);
  const isTableRowTargeted = Boolean(
    trRowMatch || (docMatch && (targetStr.includes('tr') || targetStr.includes('tbody') || targetStr.includes('table')))
  );
  const extractedRowQuery = trRowMatch ? trRowMatch[1] : (docMatch ? docMatch[0] : '');

  const hasRowActionKeyword = ROW_ACTION_KEYWORDS.some(k => targetStr.includes(k) || valStr.includes(k));
  const isDropdownMenuSelector =
    targetStr.includes('.dropdown-menu') ||
    targetStr.includes('dropdown-item') ||
    targetStr.includes('.dropdown-toggle');

  const isRowActionItem = !isModalOpen && !isReportOrToolbar && (
    isDropdownMenuSelector ||
    (!isExplicitSelector && (hasRowActionKeyword || isExplicitRowIntent)) ||
    (isTableRowTargeted && (hasRowActionKeyword || targetStr.includes(':has-text') || isExplicitRowIntent))
  );

  const isHapus = targetStr.includes('hapus') || targetStr.includes('delete') || targetStr.includes('remove');

  return {
    isRowActionItem,
    isTableRowTargeted,
    isExplicitRowIntent,
    isHapus,
    extractedRowQuery,
  };
}

function isTableTabIntent(targetStr) {
  return (
    targetStr.includes('tabel-tab') ||
    targetStr.includes('table-tab') ||
    targetStr.includes('tab_tabel') ||
    targetStr.includes('tab_table') ||
    (targetStr.includes('tabel') && targetStr.includes('tab'))
  );
}

function isFormTabIntent(targetStr) {
  return (
    targetStr.includes('form-tab') ||
    targetStr.includes('tab-form') ||
    targetStr.includes('tab_form')
  );
}

function isSaveIntent(targetStr, valStr = '') {
  return ['simpan', 'submit', 'update', 'ubah', 'save', 'proses']
    .some(k => targetStr.includes(k) || valStr.includes(k));
}

function anticipatesValidationError(expStr) {
  return ['peringatan', 'warning', 'belum lengkap', 'validasi', 'gagal', 'error', 'tidak lengkap', 'wajib']
    .some(k => expStr.includes(k));
}

function isPrintOrReportIntent(targetStr, valStr = '') {
  return ['cetak', 'print', 'pdf', 'laporan', 'report']
    .some(k => targetStr.includes(k) || valStr.includes(k));
}

function isTabSwitchIntent(targetStr, valStr = '', href = null) {
  return (
    targetStr.includes('tab') ||
    valStr.includes('tab') ||
    Boolean(href && href.startsWith('#') && (href.includes('tab') || href.includes('form') || href.includes('tabel')))
  );
}

function isModalTriggerIntent(targetStr, valStr = '') {
  return ['modal', 'dialog', 'popup', 'filter', 'laporan', 'tiket', 'cetak', 'cari', 'browse', 'lookup', 'pilih', 'spm', 'po', 'spb']
    .some(k => targetStr.includes(k) || valStr.includes(k));
}

module.exports = {
  buildClickContext,
  isHeaderSelectAll,
  isRowCheckbox,
  isTableRowTarget,
  isLoginPageUrl,
  extractRowMatches,
  detectRowActionIntent,
  isTableTabIntent,
  isFormTabIntent,
  isSaveIntent,
  anticipatesValidationError,
  isPrintOrReportIntent,
  isTabSwitchIntent,
  isModalTriggerIntent,
};
