'use strict';

/**
 * click/tabSafeguards.js — Idempotent Safeguards When Click Target Is Absent
 *
 * Menangani kasus di mana `activeLocator` tidak ditemukan di DOM tetapi langkah
 * secara fungsional sudah terpenuhi (atau dapat dialihkan ke tombol "Tambah"):
 * 1. SweetAlert konfirmasi yang sudah otomatis di-dismiss oleh step simpan sebelumnya
 * 2. Klik tab tabel pada halaman single-tab yang tabelnya sudah tampil
 * 3. Klik tab form pada halaman tanpa tab form (klik tombol "Tambah" atau form sudah tampil)
 *
 * Saat salah satu safeguard ini aktif, `step.resolved_by = 'safeguard-skip'` dicatat
 * agar dapat dilacak di laporan/log tanpa mengubah status PASS/FAIL.
 */

const { TIMEOUTS } = require('../../../utils/constants');
const { existsAndVisible, safeEvaluate } = require('../../../utils/playwrightHelpers');
const appProfile = require('../../../utils/appProfile');
const { isTableTabIntent, isFormTabIntent } = require('./intent');

/**
 * Tandai bahwa langkah diselesaikan oleh safeguard idempoten.
 */
function markSafeguardSkip(step) {
  if (step && typeof step === 'object') {
    step.resolved_by = 'safeguard-skip';
  }
}

/**
 * Jalankan pengecekan safeguard bila target klik tidak ditemukan di DOM.
 * Mengembalikan `true` jika langkah aman untuk dilewati (idempoten), atau `false` jika harus melempar error.
 *
 * @param {object} ctx - Objek konteks klik bersama
 * @returns {Promise<boolean>}
 */
async function tryIdempotentMissingTargetSafeguards(ctx) {
  const { page, targetStr, step } = ctx;

  // 1. Swal/confirm yang sudah di-handle oleh step sebelumnya -> skip tanpa error
  if ((targetStr.includes('swal') || targetStr.includes('confirm') || targetStr.includes('ya')) &&
      page && page.__lastSaveSuccess) {
    markSafeguardSkip(step);
    return true;
  }

  // 2. Idempotent Table Tab Safeguard
  if (isTableTabIntent(targetStr) && page) {
    const isTableAlreadyVisible = await safeEvaluate(page, () => {
      const table = document.querySelector('table:not(.ui-datepicker-calendar), .dataTable, [id*="tabel" i], [id*="table" i]');
      if (!table) return false;
      const style = window.getComputedStyle(table);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });

    if (isTableAlreadyVisible) {
      markSafeguardSkip(step);
      return true;
    }
  }

  // 3. Idempotent Form Tab Safeguard
  if (isFormTabIntent(targetStr) && page) {
    const formAddSels = appProfile.get('formAddButtons', []);
    const formBtn = page.locator(formAddSels.join(', ')).first();
    if (await existsAndVisible(formBtn)) {
      await formBtn.click({ timeout: TIMEOUTS.LONG }).catch(() => {});
      markSafeguardSkip(step);
      return true;
    }

    const loginFormSel = appProfile.get('loginForm');
    const isFormAlreadyVisible = await safeEvaluate(page, (lSel) => {
      const notLogin = lSel ? `:not(${lSel})` : '';
      const form = document.querySelector(`form${notLogin}, .tab-pane.active form, div[id*="form" i]`);
      if (!form) return false;
      const style = window.getComputedStyle(form);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }, loginFormSel);

    if (isFormAlreadyVisible) {
      markSafeguardSkip(step);
      return true;
    }
  }

  return false;
}

module.exports = {
  tryIdempotentMissingTargetSafeguards,
};
