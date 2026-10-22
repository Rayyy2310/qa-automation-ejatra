'use strict';

/**
 * explorerConfig.js — Sentralisasi Konfigurasi, Selector, dan Konstanta untuk State Explorer
 *
 * Membaca profil aplikasi dari src/config/app-profile.json dan src/config/icon-map.json
 * sehingga logika scanner bebas dari hardcode selector spesifik aplikasi.
 */

const fs = require('fs');
const path = require('path');
const appProfile = require('../../utils/appProfile');
const { TIMEOUTS, SWAL_SELECTORS } = require('../../utils/constants');

// Load icon mapping dictionary
let ICON_MAP = {};
try {
  const iconMapPath = path.resolve(__dirname, '../../config/icon-map.json');
  if (fs.existsSync(iconMapPath)) {
    ICON_MAP = JSON.parse(fs.readFileSync(iconMapPath, 'utf8'));
  }
} catch (err) {
  console.warn('[stateExplorer] Could not load icon-map.json:', err.message);
}

// Safety Denylist for active exploration (NEVER click these during scanning!)
const DENYLIST_TEXT = /simpan|save|hapus|delete|batal|cancel|close|tutup|submit|kirim|approve|posting|void|logout|keluar|ya,?/i;

const scannerProfile = appProfile.get('scanner', {}) || {};

const IGNORED_DEBUG_SELECTOR = appProfile.get(
  'debugOverlayStrict',
  '[id*="debug"], [class*="debug"], [class*="timeline"], [data-debugbar]'
);

const IGNORED_NAV_SELECTOR = scannerProfile.ignoredNav
  || '.navbar, .navbar-nav, nav, header, .topbar, .main-header, .sidebar, .sidebar-menu, .menu, [id="sidebar"], .navigation, [role="navigation"], .app-header, .user-panel';

const ROW_DROPDOWN_TRIGGER_SELECTORS = [
  'tbody tr:first-child td:first-child .dropdown-toggle',
  'tbody tr:first-child .dropdown-toggle',
  'tbody tr:first-child button[data-bs-toggle="dropdown"]',
  'tbody tr:first-child button[data-toggle="dropdown"]',
  'tbody tr:first-child button:has(.fa-bars)',
  'tbody tr:first-child a:has(.fa-bars)',
  'tbody tr:first-child [data-bs-toggle="dropdown"]',
  'tbody tr:first-child [data-toggle="dropdown"]',
].join(', ');

const ROW_INLINE_DROPDOWN_TOGGLE_SELECTOR =
  'tbody tr:first-child [data-toggle="dropdown"], tbody tr:first-child [data-bs-toggle="dropdown"]';

/**
 * Safe modal trigger selectors for discovery across Table and Form states.
 * Covers standard Bootstrap declarative triggers, input addons, and dynamic JS/jQuery dialog launchers.
 */
const MODAL_TRIGGER_SELECTORS = [
  'button[data-bs-toggle="modal"]',
  'a[data-bs-toggle="modal"]',
  'button[data-toggle="modal"]',
  'a[data-toggle="modal"]',
  'button[data-bs-target*="modal" i]',
  'a[data-bs-target*="modal" i]',
  'button[data-target*="modal" i]',
  'a[data-target*="modal" i]',
  'button[onclick*="modal" i]',
  'a[onclick*="modal" i]',
  'button[onclick*="browse" i]',
  'a[onclick*="browse" i]',
  'button[onclick*="cari" i]',
  'a[onclick*="cari" i]',
  'button[onclick*="lookup" i]',
  'a[onclick*="lookup" i]',
  'button[onclick*="popup" i]',
  'a[onclick*="popup" i]',
  'button[class*="btn-browse" i]',
  'a[class*="btn-browse" i]',
  'button[class*="btn-cari" i]',
  'a[class*="btn-cari" i]',
  'button[class*="btn-lookup" i]',
  'a[class*="btn-lookup" i]',
  'button.btn-browse',
  'a.btn-browse',
  'button.btn-cari',
  'a.btn-cari',
  'button.btn-lookup',
  'a.btn-lookup',
  'button[id*="browse" i]',
  'a[id*="browse" i]',
  'button[id*="cari" i]',
  'a[id*="cari" i]',
  'button[id*="lookup" i]',
  'a[id*="lookup" i]',
  'button[id*="modal" i]',
  'a[id*="modal" i]',
  '.input-group button:has(i[class*="search"])',
  '.input-group a:has(i[class*="search"])',
  '.input-group button:has(i[class*="binoculars"])',
  '.input-group a:has(i[class*="binoculars"])',
  '.input-group button:has(i[class*="folder-open"])',
  '.input-group a:has(i[class*="folder-open"])',
  'button:has-text("Browse")',
  'a.btn:has-text("Browse")',
  'button:has-text("Cari Data")',
  'a.btn:has-text("Cari Data")',
  'button:has-text("Lookup")',
  'a.btn:has-text("Lookup")',
].join(', ');

const FORM_TRIGGER_SELECTORS = (scannerProfile.formTriggers || [
  '[data-bs-toggle="tab"][href*="form"]',
  '[data-toggle="tab"][href*="form"]',
  'a.nav-link:has-text("Form")',
  'button.nav-link:has-text("Form")',
  'a.nav-link:has-text("Input")',
  'button:has-text("Tambah Data")',
  'a.btn:has-text("Tambah Data")',
  'button:has-text("Tambah")',
  'a.btn:has-text("Tambah")',
]).join(', ');

const DEFAULT_FORM_TRIGGER_SELECTOR =
  scannerProfile.defaultFormTriggerSelector || 'a[href*="form"]';

const ROW_FORM_TRIGGER_SELECTORS = (scannerProfile.rowFormTriggers || [
  'tbody tr:first-child :is(button, a):has-text("Realisasi")',
  'tbody tr:first-child :is(button, a):has-text("Edit")',
  'tbody tr:first-child :is(button, a):has-text("Ubah")',
]).join(', ');

const DEFAULT_ROW_FORM_TRIGGER_SELECTOR =
  scannerProfile.defaultRowFormTriggerSelector || 'tbody tr:first-child a';

const FORM_CONTAINER_SELECTOR =
  scannerProfile.formContainerSelector || '.tab-pane.active, .tab-pane.show, form';

const TABLE_TAB_SELECTORS = (scannerProfile.tableTabTriggers || [
  '[data-bs-toggle="tab"][href*="tabel"]',
  '[data-bs-toggle="tab"][href*="table"]',
  '[data-toggle="tab"][href*="tabel"]',
  '[data-toggle="tab"][href*="table"]',
  'a.nav-link:has-text("Tabel")',
  'a.nav-link:has-text("Data")',
]).join(', ');

const ACTIVE_MODAL_SELECTOR = '.modal.show, .modal:visible, [role="dialog"]:visible';

const MODAL_CLOSE_SELECTORS = [
  '.modal.show [data-bs-dismiss="modal"]',
  '.modal.show [data-dismiss="modal"]',
  '.modal.show .btn-close',
  '.modal.show button:has-text("Tutup")',
  '.modal.show button:has-text("Close")',
  '.modal.show .btn-secondary:has-text("Batal")',
].join(', ');

module.exports = {
  ICON_MAP,
  DENYLIST_TEXT,
  TIMEOUTS,
  SWAL_SELECTORS,
  IGNORED_DEBUG_SELECTOR,
  IGNORED_NAV_SELECTOR,
  ROW_DROPDOWN_TRIGGER_SELECTORS,
  ROW_INLINE_DROPDOWN_TOGGLE_SELECTOR,
  MODAL_TRIGGER_SELECTORS,
  FORM_TRIGGER_SELECTORS,
  DEFAULT_FORM_TRIGGER_SELECTOR,
  ROW_FORM_TRIGGER_SELECTORS,
  DEFAULT_ROW_FORM_TRIGGER_SELECTOR,
  FORM_CONTAINER_SELECTOR,
  TABLE_TAB_SELECTORS,
  ACTIVE_MODAL_SELECTOR,
  MODAL_CLOSE_SELECTORS,
};
