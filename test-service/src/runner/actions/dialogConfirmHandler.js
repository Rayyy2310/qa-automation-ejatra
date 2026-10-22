/**
 * dialogConfirmHandler.js — SweetAlert & Dialog Confirmation Handler
 * Handles automatic confirmation of SweetAlert2 modals after form submission.
 */

const { TIMEOUTS } = require('../../utils/constants');

/**
 * All SweetAlert confirm button selectors for save/submit confirmation dialogs.
 */
const CONFIRM_SELECTORS = `
  .swal2-container .swal2-confirm,
  .swal2-popup button.swal2-confirm,
  .swal2-actions button.swal2-confirm,
  button:has-text("Ya, Simpan"),
  button:has-text("Ya, simpan"),
  button:has-text("Ya, lanjut"),
  button:has-text("Ya, Lanjutkan"),
  button:has-text("Ya, Yakin"),
  button:has-text("Yakin"),
  button:has-text("Ya")
`;

/**
 * Handle post-login SweetAlert dismissal (OK/Mengerti/Lanjutkan).
 * @param {import('playwright').Page} page
 */
async function dismissSwalOnLogin(page) {
  const swalBtn = page.locator(
    '.swal2-confirm, .swal2-actions button, .modal .btn-primary, button:has-text("OK"), button:has-text("Mengerti"), button:has-text("Lanjutkan")'
  );
  if ((await swalBtn.count()) > 0 && (await swalBtn.first().isVisible().catch(() => false))) {
    await swalBtn.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(200);
    return;
  }
  const appeared = await swalBtn.first().waitFor({ state: 'visible', timeout: 500 }).then(() => true).catch(() => false);
  if (appeared) {
    await swalBtn.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(200);
  }
}

/**
 * Robust wait and click handler for save/submit confirmation dialogs.
 * Only confirms genuine confirmation questions (e.g. "Apakah Anda yakin...? [Ya, Simpan] [Batal]").
 * NEVER dismisses warning/validation/error popups (e.g. "Data Wajib Belum Lengkap").
 *
 * @param {import('playwright').Page} page
 * @param {Object} [step]
 */
async function confirmSaveDialog(page, step = {}) {
  // If the step's expected_result specifically anticipates an error or validation warning, do not auto-confirm
  const expRes = String(step?.expected_result || '').toLowerCase();
  const anticipatesValidation = ['peringatan', 'warning', 'belum lengkap', 'validasi', 'gagal', 'error', 'tidak lengkap', 'wajib'].some(
    k => expRes.includes(k)
  );
  if (anticipatesValidation) {
    return;
  }

  // Check if a modal or SweetAlert dialog appeared
  const popup = page.locator('.swal2-popup:visible, .modal.show:visible, .modal.in:visible, .modal:visible, [role="dialog"]:visible, div[id*="modal" i]:visible').first();
  try {
    await popup.waitFor({ state: 'visible', timeout: 2500 });
  } catch (e) {
    return; // No dialog appeared, nothing to confirm
  }

  if (!(await popup.isVisible().catch(() => false))) {
    return;
  }

  // Inspect the popup modal
  const popupInfo = await popup.evaluate(el => {
    const text = (el.innerText || el.textContent || '').trim();
    const hasWarningIcon = Boolean(el.querySelector('.swal2-warning, .swal2-error, .swal2-info'));
    const hasQuestionIcon = Boolean(el.querySelector('.swal2-question'));
    const hasSuccessIcon = Boolean(el.querySelector('.swal2-success'));

    // Check if there is a visible Cancel button (e.g. Batal, Tidak, Cancel, .swal2-cancel)
    const cancelBtn = el.querySelector('.swal2-cancel, button:not(.btn-primary):not(.swal2-confirm)');
    const hasCancelBtn = cancelBtn && window.getComputedStyle(cancelBtn).display !== 'none';

    // Check if text indicates a validation warning or error (not a confirmation question)
    const lower = text.toLowerCase();
    const isValidationWarning = lower.includes('belum lengkap') ||
                                lower.includes('wajib') ||
                                lower.includes('harus diisi') ||
                                lower.includes('tidak boleh kosong') ||
                                lower.includes('peringatan') ||
                                lower.includes('mohon lengkapi') ||
                                lower.includes('validasi') ||
                                lower.includes('gagal');

    return {
      text,
      hasWarningIcon,
      hasQuestionIcon,
      hasSuccessIcon,
      hasCancelBtn,
      isValidationWarning
    };
  }).catch(() => null);

  if (!popupInfo) return;

  // Always capture the alert text so assertions can verify it
  page.__lastAlertText = popupInfo.text;
  page.__lastSaveMessage = popupInfo.text;

  // If this is a validation warning or an acknowledgment alert (no cancel button with warning/error), DO NOT DISMISS IT!
  if (popupInfo.isValidationWarning || (popupInfo.hasWarningIcon && !popupInfo.hasCancelBtn)) {
    page.__lastValidationWarning = true;
    return; // Leave warning popup open for assert_text and screenshot!
  }

  // If already a success popup, mark success and do not dismiss prematurely
  if (popupInfo.hasSuccessIcon) {
    page.__lastSaveSuccess = true;
    return;
  }

  // Locate the actual confirm button for a question dialog
  const confirmBtn = popup.locator(`
    button:has-text("Ya, Simpan"),
    button:has-text("Ya, simpan"),
    button:has-text("Ya, Lanjut"),
    button:has-text("Ya, Lanjutkan"),
    button:has-text("Ya, Yakin"),
    button:has-text("Yakin"),
    button:has-text("Ya"),
    .swal2-confirm
  `.replace(/\s+/g, ' ').trim()).first();

  if ((await confirmBtn.count().catch(() => 0)) > 0 && (await confirmBtn.isVisible().catch(() => false))) {
    // Only proceed to click if this is a genuine confirmation question
    const isGenuineQuestion = popupInfo.hasQuestionIcon || popupInfo.hasCancelBtn;
    const isExplicitConfirmText = await confirmBtn.evaluate(el => {
      const t = (el.innerText || el.textContent || '').toLowerCase().trim();
      return t.startsWith('ya') || t.includes('simpan') || t.includes('lanjut') || t.includes('yakin');
    }).catch(() => false);

    if (!isGenuineQuestion && !isExplicitConfirmText) {
      // Button is just "OK" or similar without question context, leave it open
      return;
    }

    const saveResponsePromise = page.waitForResponse(
      res => res.request().method() === 'POST' && !res.url().includes('datatable'),
      { timeout: 10000 }
    ).catch(() => null);

    await confirmBtn.click({ force: true }).catch(() => {});

    const saveRes = await saveResponsePromise;
    if (saveRes) {
      try {
        const body = await saveRes.json().catch(() => null);
        if (body && (body.success === false || body.status === false || body.status === 'error' || body.status === 'fail')) {
          const errDetail = body.message || (body.errors ? Object.values(body.errors).join(', ') : 'Gagal menyimpan transaksi');
          throw new Error(`Transaksi Gagal Disimpan oleh Server: ${errDetail}`);
        }
        if (body && (body.success === true || body.status === true || body.status === 'success' || body.hasil === 'sukses' || body.sukses === 1)) {
          page.__lastSaveMessage = body.message || 'Data tersimpan';
          page.__lastSaveSuccess = true;
        }
      } catch (e) {
        if (e.message && e.message.startsWith('Transaksi Gagal')) throw e;
      }
    }

    await page.waitForTimeout(TIMEOUTS.MEDIUM);
  }
}

/**
 * Handle confirm for aktifkan/batalkan/hapus destructive actions.
 * @param {import('playwright').Page} page
 */
async function confirmDestructiveDialog(page) {
  await page.waitForTimeout(500);
  const confirmBtn = page.locator(`
    .swal2-confirm, 
    .swal2-actions button.swal2-confirm,
    button:has-text("Ya, Lanjutkan"),
    button:has-text("Ya, Simpan"),
    button:has-text("Ya, Hapus"),
    button:has-text("Ya, Batalkan"),
    button:has-text("Ya, Aktifkan"),
    button:has-text("Ya"),
    button:has-text("OK")
  `.replace(/\s+/g, ' ').trim()).first();

  if ((await confirmBtn.count().catch(() => 0)) > 0 && (await confirmBtn.isVisible().catch(() => false))) {
    await confirmBtn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(TIMEOUTS.MEDIUM);
  }
}

module.exports = {
  dismissSwalOnLogin,
  confirmSaveDialog,
  confirmDestructiveDialog
};
