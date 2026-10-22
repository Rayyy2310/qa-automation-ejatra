'use strict';

/**
 * click/performClick.js — Resilient Click Execution & Post-Click DOM Bridges
 *
 * Strategi eksekusi:
 * 1. Disambiguasi jika locator mencocokkan >1 elemen
 * 2. Delegasi sel/baris tabel (td/th/tr) ke tombol aksi di dalam baris
 * 3. Delegasi input radio/checkbox ke <label for="id"> + dispatch event change
 * 4. Pre-confirm agreement safeguard untuk modal SweetAlert2
 * 5. Klik 3-lapis (normal -> force -> evaluate el.click())
 * 6. Blur + jQuery click bridge + DataTable checkbox change event
 */

const { TIMEOUTS, SWAL_SELECTORS } = require('../../../utils/constants');
const { pickBestInteractiveCandidate } = require('../../../utils/locatorResolver');
const {
  safeCount,
  exists,
  existsAndVisible,
  safeEvaluate,
  safeAttr,
  safeScrollIntoView,
} = require('../../../utils/playwrightHelpers');
const appProfile = require('../../../utils/appProfile');

/**
 * Jika locator menunjuk ke td/th/tr, arahkan ke tombol/link di dalam baris tersebut.
 */
async function delegateTableCellToRowButton(activeLocator) {
  const isTableCellOrRow = await safeEvaluate(activeLocator, el => {
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    return tag === 'td' || tag === 'th' || tag === 'tr';
  });

  if (!isTableCellOrRow) return activeLocator;

  const pickToken = appProfile.get('modalPickClassToken', 'btn-pick');
  const rowButton = activeLocator.locator(
    `xpath=ancestor-or-self::tr[1]//button[contains(@class, "${pickToken}")] | ` +
    'xpath=ancestor-or-self::tr[1]//button | ' +
    'xpath=ancestor-or-self::tr[1]//a[contains(@class, "btn")] | ' +
    'xpath=ancestor-or-self::tr[1]//a | ' +
    'xpath=ancestor-or-self::tr[1]//input[@type="button" or @type="submit"]'
  ).first();

  return (await existsAndVisible(rowButton)) ? rowButton : activeLocator;
}

/**
 * Tangani klik pada elemen <input type="radio|checkbox"> (termasuk kartu UI kustom yang menyembunyikan input).
 * Mengembalikan true jika elemen adalah radio/checkbox dan sudah selesai ditangani.
 */
async function handleRadioOrCheckboxClick(page, activeLocator) {
  const isInputRadioOrCheckbox = await safeEvaluate(activeLocator, el => {
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    return tag === 'input' && (el.type === 'radio' || el.type === 'checkbox');
  });

  if (!isInputRadioOrCheckbox) return false;

  const elId = await safeAttr(activeLocator, 'id');
  let labelLoc = elId
    ? page.locator(`label[for="${elId}"], [for="${elId}"]:not(input):not(select):not(textarea)`).first()
    : null;
  if (!(await exists(labelLoc))) {
    labelLoc = activeLocator.locator('xpath=ancestor::label[1]').first();
  }

  if (await existsAndVisible(labelLoc)) {
    await safeScrollIntoView(labelLoc);
    try {
      await labelLoc.click({ timeout: TIMEOUTS.LONG });
    } catch {
      await labelLoc.click({ force: true, timeout: 2000 }).catch(() => {});
    }
  } else {
    try {
      await activeLocator.click({ force: true, timeout: 2000 });
    } catch {}
  }

  await safeEvaluate(activeLocator, el => {
    if (!el.checked) {
      el.checked = true;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      const $ = window.jQuery || window.$;
      if ($) $(el).prop('checked', true).trigger('change');
    }
  });

  await page.waitForTimeout(TIMEOUTS.SHORT);
  return true;
}

/**
 * SweetAlert Pre-Confirm Agreement Safeguard:
 * Pastikan checkbox persetujuan di dalam modal sudah tercentang sebelum klik tombol konfirmasi.
 */
async function ensurePreConfirmAgreementChecked(page, activeLocator) {
  if (!page) return;
  try {
    const confirmClass = SWAL_SELECTORS.CONFIRM.replace(/^\./, '');
    const isConfirmBtn = await safeEvaluate(activeLocator, (el, cCls) => {
      const cls = el.className || '';
      const txt = (el.innerText || el.textContent || '').toLowerCase();
      return cls.includes(cCls) || txt.includes('verifikasi') || txt.includes('simpan') || txt.includes('approve');
    }, confirmClass);

    if (!isConfirmBtn) return;

    const swalPopup = page.locator(SWAL_SELECTORS.POPUP_OR_MODAL_VISIBLE).last();
    if (!(await exists(swalPopup))) return;

    const agreeCbSel = appProfile.get('confirmAgreeCheckbox', 'input[type="checkbox"]');
    const agreeCb = swalPopup.locator(`${agreeCbSel}, input[type="checkbox"][id*="agree" i], input[type="checkbox"][id*="confirm" i]`).first();
    if (await existsAndVisible(agreeCb)) {
      const isChecked = await agreeCb.isChecked().catch(() => false);
      if (!isChecked) {
        await agreeCb.check({ force: true }).catch(async () => {
          await agreeCb.click({ force: true }).catch(() => {});
        });
        await page.waitForTimeout(TIMEOUTS.FAST);
      }
    }
  } catch (_) {}
}

/**
 * Eksekusi klik 3-lapis: normal -> force -> DOM evaluate click().
 */
async function executeThreeLevelClick(activeLocator) {
  let lastClickError = null;
  try {
    await activeLocator.click({ timeout: TIMEOUTS.LONG });
    return;
  } catch (err1) {
    lastClickError = err1;
  }

  try {
    await activeLocator.click({ force: true, timeout: 2000 });
    return;
  } catch (err2) {
    lastClickError = err2;
  }

  try {
    await activeLocator.evaluate(el => {
      const target = el.closest('a, button, input[type="button"], input[type="submit"], [role="button"]') || el;
      target.scrollIntoView({ block: 'center', inline: 'nearest' });
      target.focus();
      target.click();
    });
    return;
  } catch (err3) {
    lastClickError = err3;
  }

  throw new Error(`Gagal mengklik elemen: ${lastClickError?.message || 'Element click failed'}`);
}

/**
 * Jalankan blur, jQuery click bridge untuk tombol pilih modal, serta event change untuk Select-All DataTable.
 */
async function triggerPostClickDomBridges(page, activeLocator, isHeaderSelectAll) {
  if (!(await exists(activeLocator))) return;

  await safeEvaluate(activeLocator, el => {
    if (typeof el.blur === 'function') el.blur();
  }, null, false, { timeout: TIMEOUTS.MEDIUM });

  const modalPickClasses = appProfile.get('modalPickButtons', []).map(c => c.replace(/^\./, ''));
  const pickToken = appProfile.get('modalPickClassToken', 'btn-pick');
  await safeEvaluate(activeLocator, (el, { pickClasses, token }) => {
    const btn = el.closest(`button, .btn, [class*="${token}"]`) || el;
    const hasPickClass = pickClasses.some(c => btn.classList && btn.classList.contains(c));
    const needsBridge = btn && (
      hasPickClass ||
      (btn.className && btn.className.includes(token)) ||
      Array.from(btn.attributes || []).some(a => a.name.startsWith('data-') && a.name.endsWith('-id'))
    );
    if (needsBridge) {
      const $ = window.jQuery || window.$;
      if ($) $(btn).trigger('click');
    }
  }, { pickClasses: modalPickClasses, token: pickToken });

  const rowCbClass = appProfile.get('rowCheckbox', 'input[type="checkbox"]');
  await safeEvaluate(activeLocator, (el, { isHeaderSelectAll: headerAll, rowCb }) => {
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (tag !== 'input' || (el.type !== 'checkbox' && el.type !== 'radio')) return;

    if (headerAll) el.checked = true;
    el.dispatchEvent(new Event('change', { bubbles: true }));

    const $ = window.jQuery || window.$;
    if ($) {
      $(el).prop('checked', el.checked).trigger('change');
      if (headerAll) {
        $(`.dataTable tbody tr input[type="checkbox"], tbody tr ${rowCb}`)
          .prop('checked', true);
      }
    }
  }, { isHeaderSelectAll, rowCb: rowCbClass });

  if (isHeaderSelectAll) {
    await page.waitForTimeout(TIMEOUTS.SETTLE);
  }
}

/**
 * Eksekusi klik pada activeLocator beserta seluruh fallback & event bridge.
 *
 * @param {object} ctx - Objek konteks klik bersama
 * @param {import('@playwright/test').Locator} activeLocator
 */
async function performClickWithFallback(ctx, activeLocator) {
  const { page, isHeaderSelectAll } = ctx;

  if (!activeLocator.__alreadyResolved && (await safeCount(activeLocator)) > 1) {
    const best = await pickBestInteractiveCandidate(activeLocator, 'click', '');
    activeLocator = best || activeLocator.first();
  }

  activeLocator = await delegateTableCellToRowButton(activeLocator);

  if (await handleRadioOrCheckboxClick(page, activeLocator)) {
    return;
  }

  await safeScrollIntoView(activeLocator);
  await ensurePreConfirmAgreementChecked(page, activeLocator);
  await executeThreeLevelClick(activeLocator);
  await triggerPostClickDomBridges(page, activeLocator, isHeaderSelectAll);
}

module.exports = {
  performClickWithFallback,
};
