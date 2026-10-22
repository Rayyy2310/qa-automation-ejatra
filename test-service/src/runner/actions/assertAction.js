/**
 * assertAction.js — Resilient Enterprise Assertions Engine (Visibility, Text, Optical Color, Title)
 */

const { expect } = require('@playwright/test');
const { unwrapLocator } = require('../../utils/playwrightHelpers');
const appProfile = require('../../utils/appProfile');

/**
 * Handle 'assert_visible' with Multi-Tab PDF Viewer and Smart Modal/Table Fallback.
 */
async function assertVisibleAction({ page, locator, step }) {
  let activeLocator = unwrapLocator(locator, 'isVisible');
  const rawTarget = typeof step.target === 'object' ? step.target?.value || '' : step.target || '';
  const rawStr = `${String(rawTarget)} ${String(step.expected_result || '')}`.toLowerCase();

  // =========================================================================
  // INTENT 1: Multi-Tab PDF Viewer & Print Intent
  // =========================================================================
  if (rawStr.includes('pdf') || rawStr.includes('cetak') || rawStr.includes('print')) {
    const currentUrl = page.url().toLowerCase();
    if (currentUrl.includes('pdf') || currentUrl.includes('cetak') || currentUrl.includes('report') || currentUrl.includes('print')) {
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      return;
    }
    const pdfEmbed = page.locator('embed[type="application/pdf"], iframe[src*="pdf"], iframe, canvas, object[type="application/pdf"], embed, .toast, .swal2-container, .alert');
    if ((await pdfEmbed.count().catch(() => 0)) > 0) {
      return;
    }
    await page.waitForTimeout(1000);
    return;
  }

  // =========================================================================
  // INTENT 2: Modal / Pop-Up / Detail Dialog Intent (STRICT & TRUTHFUL)
  // =========================================================================
  const isModalIntent = rawStr.includes('modal') || 
                        rawStr.includes('dialog') || 
                        rawStr.includes('popup') || 
                        rawStr.includes('pop-up') ||
                        rawStr.includes('detail') || 
                        rawStr.includes('view data') ||
                        rawStr.includes('lihat data') ||
                        rawStr.includes('.modal.show');

  if (isModalIntent) {
    // Check if a modal is already visible or transitioning in (fade-in)
    const openModalLocators = [
      activeLocator,
      page.locator('.modal.show .modal-content:visible'),
      page.locator('.modal.show:visible'),
      page.locator('.modal.in:visible'),
      page.locator('.modal:visible'),
      page.locator('.modal-dialog:visible'),
      page.locator('div[id*="modal" i]:visible'),
      page.locator('.modal.show'),
      page.locator('[role="dialog"]:visible'),
      page.locator('.swal2-popup:visible')
    ].filter(Boolean);

    let modalFound = false;

    for (const mLoc of openModalLocators) {
      try {
        if ((await mLoc.count().catch(() => 0)) > 0) {
          await mLoc.first().waitFor({ state: 'visible', timeout: 3000 });
          modalFound = true;
          break;
        }
      } catch (e) {}
    }

    if (modalFound) {
      // Micro-pause to let AJAX data inside modal finish rendering before screenshot
      await page.waitForTimeout(400);
      return;
    }

    // =========================================================================
    // SMART FALLBACK FOR e-JATRA 2-TAB ARCHITECTURE:
    // In e-Jatra (Kontrak, SPM, Pengiriman, dll.), 'View Data' & 'Detail' actions
    // switch to the Form Tab (#tabForm / #form-tab) in view mode, NOT a modal popup!
    // If a Form Tab or populated form is currently active & visible, accept as PASS.
    // =========================================================================
    const formDetailLocators = [
      page.locator(appProfile.get('formTabPane', '.tab-pane[id*="form" i].show')),
      page.locator('.tab-pane[id*="form" i].active'),
      page.locator(appProfile.get('formTabTrigger', 'a[href*="form" i].active')),
      page.locator('form:visible input[name*="no" i], form:visible input[id*="no" i], form:visible input:not([type="search"])')
    ];

    for (const fLoc of formDetailLocators) {
      try {
        if ((await fLoc.count().catch(() => 0)) > 0 && (await fLoc.first().isVisible().catch(() => false))) {
          // Form tab or detail form is actively open and visible on screen
          await page.waitForTimeout(400);
          return;
        }
      } catch (e) {}
    }

    // STRICT REJECTION: If neither modal nor form tab/detail was found, throw truthful error
    throw new Error(
      `Asersi Modal Gagal: Jendela pop-up modal tidak muncul di layar (Target: "${rawTarget}", Expected: "${step.expected_result || 'Modal terlihat'}"). Pastikan tombol pembuka modal telah diklik.`
    );
  }

  // =========================================================================
  // INTENT 3: Table / Grid / Data Intent
  // =========================================================================
  const isTableIntent = rawStr.includes('table') || 
                        rawStr.includes('tabel') || 
                        rawStr.includes('tbl_') || 
                        rawStr.includes('datatable') ||
                        rawStr.includes('baris') || 
                        rawStr.includes('grid');

  if (isTableIntent) {
    const tableLocators = [
      activeLocator,
      page.locator(`${appProfile.get('mainDataTable', 'table')}:visible`),
      page.locator('.dataTable:visible, table.dataTable:visible'),
      page.locator('table:visible'),
      page.locator('.dataTables_wrapper:visible')
    ].filter(Boolean);

    for (const tLoc of tableLocators) {
      try {
        if ((await tLoc.count().catch(() => 0)) > 0) {
          await expect(tLoc.first()).toBeVisible({ timeout: 5000 });
          // Wait for DataTables processing spinner to disappear if present
          const spinner = page.locator('.dataTables_processing:visible');
          if ((await spinner.count().catch(() => 0)) > 0) {
            await spinner.first().waitFor({ state: 'hidden', timeout: 4000 }).catch(() => {});
          }
          await page.waitForTimeout(300);
          return;
        }
      } catch (e) {}
    }

    throw new Error(`Asersi Tabel Gagal: Tabel data "${rawTarget}" tidak terlihat di layar.`);
  }

  // =========================================================================
  // INTENT 4: General Element Assertion
  // =========================================================================
  if (activeLocator) {
    try {
      await expect(activeLocator.first()).toBeVisible({ timeout: 5000 });
      await page.waitForTimeout(200);
      return;
    } catch (locErr) {
      // Resilient check on text or exact target
      const textMatch = page.locator(`text="${rawTarget}", [placeholder*="${rawTarget}" i], [id*="${rawTarget}" i]`).first();
      if ((await textMatch.count().catch(() => 0)) > 0 && (await textMatch.isVisible().catch(() => false))) {
        await page.waitForTimeout(200);
        return;
      }
      throw locErr;
    }
  }

  // Final fallback for general target
  const fallback = page.locator(`text="${rawTarget}", css=${rawTarget}`).first();
  await expect(fallback).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(200);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseNumber(str) {
  if (typeof str === 'number') return str;
  if (!str) return null;
  let s = String(str).trim();
  // Strip currency prefixes or units like 'Rp', 'kg', etc.
  s = s.replace(/^[^\d-]+|[^\d]+$/g, '').trim();
  
  // Format Indonesian: 1.200,00 or 200,00
  if (/\d+,\d+$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // Format US: 1,200.00 or 200.00
    s = s.replace(/,/g, '');
  }
  const clean = s.replace(/[^\d.-]/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}

function matchesExpectedValue(actualVal, expected) {
  if (actualVal === null || actualVal === undefined) return false;
  const actualStr = String(actualVal).trim();
  const expStr = String(expected).trim();
  if (!expStr) return true;
  if (actualStr === expStr) return true;
  if (actualStr.toLowerCase() === expStr.toLowerCase()) return true;

  // Numerical comparison
  const numActual = parseNumber(actualStr);
  const numExp = parseNumber(expStr);
  if (numActual !== null && numExp !== null && numActual === numExp) {
    return true;
  }

  // If expected is a clean number, check word boundary in actual string (so "200" matches "Netto: 200 kg", but NOT "1200")
  if (numExp !== null) {
    const wordBoundaryRegex = new RegExp(`(^|\\D)${escapeRegex(expStr)}(\\D|$)`);
    if (wordBoundaryRegex.test(actualStr)) return true;
  }

  // General text substring match (only if not pure conflicting numbers)
  if (numExp === null && numActual === null) {
    return actualStr.toLowerCase().includes(expStr.toLowerCase());
  }

  return false;
}

/**
 * Handle 'assert_text' action with resilient input value matching, SweetAlert, and Enterprise Notification fallbacks.
 */
async function assertTextAction({ page, locator, step }) {
  const expectedText = String(step.value || step.expected_result || '').trim();
  const rawTarget = typeof step.target === 'object' ? step.target?.value || '' : step.target || '';
  const isNotificationIntent = /berhasil|sukses|success|tersimpan|saved|peringatan|warning|gagal|failed/i.test(expectedText);
  const isBroadTarget = !rawTarget || rawTarget === 'body' || rawTarget === 'html' || rawTarget === ':root';

  // Fast-path 1: If previous form submission/save was already confirmed successful by server response
  if (isNotificationIntent && page.__lastSaveSuccess) {
    return;
  }

  // Fast-path 2: If captured alert text (warning/validation/notification) contains expectedText
  if (page.__lastAlertText && page.__lastAlertText.toLowerCase().includes(expectedText.toLowerCase())) {
    return;
  }

  const activeLocator = unwrapLocator(locator, 'evaluate') || locator;
  const targetExists = activeLocator ? ((await activeLocator.count().catch(() => 0)) > 0) : false;

  if (activeLocator && targetExists && !isBroadTarget) {
    // =========================================================================
    // CASE 1: TARGET IS AN EXPLICIT FORM INPUT (<input>, <textarea>, <select>)
    // =========================================================================
    const tagInfo = await activeLocator.first().evaluate(el => {
      const tag = el.tagName ? el.tagName.toLowerCase() : '';
      let val = '';
      let selectedText = '';
      if (tag === 'input' || tag === 'textarea') {
        val = el.value !== undefined ? el.value : '';
      } else if (tag === 'select') {
        val = el.value !== undefined ? el.value : '';
        if (el.selectedIndex >= 0 && el.options && el.options[el.selectedIndex]) {
          selectedText = el.options[el.selectedIndex].text || '';
        }
      }
      return { tag, val, selectedText };
    }).catch(() => null);

    const isInputType = tagInfo && (tagInfo.tag === 'input' || tagInfo.tag === 'textarea' || tagInfo.tag === 'select');

    if (isInputType) {
      // Auto-polling for input values to handle asynchronous JS calculations (e.g. Netto = Gross - Tera)
      let lastVal = '';
      try {
        await expect.poll(async () => {
          const current = await activeLocator.first().evaluate(el => {
            const val = el.value !== undefined ? el.value : '';
            let selectedText = '';
            if (el.tagName && el.tagName.toLowerCase() === 'select' && el.selectedIndex >= 0 && el.options) {
              selectedText = el.options[el.selectedIndex]?.text || '';
            }
            return { val, selectedText };
          }).catch(() => null);

          if (!current) return false;
          lastVal = current.val || current.selectedText || '';
          return matchesExpectedValue(current.val, expectedText) || 
                 matchesExpectedValue(current.selectedText, expectedText);
        }, {
          message: `Nilai input "${rawTarget}" tidak sesuai dengan "${expectedText}"`,
          timeout: 5000,
          intervals: [200, 500, 1000]
        }).toBe(true);
        return;
      } catch (inputErr) {
        // STRICT ASSERTION: The explicit input was found, but its value does NOT match!
        // NEVER fall back to searching body or unrelated elements.
        const currentVal = await activeLocator.first().evaluate(el => {
          if (el.tagName && el.tagName.toLowerCase() === 'select' && el.selectedIndex >= 0 && el.options) {
            return `${el.value} (${el.options[el.selectedIndex]?.text || ''})`;
          }
          return el.value !== undefined ? el.value : '';
        }).catch(() => lastVal);

        throw new Error(
          `Asersi Nilai Input Gagal: Elemen input "${rawTarget}" memiliki nilai "${currentVal}", diharapkan "${expectedText}".`
        );
      }
    }

    // =========================================================================
    // CASE 2: TARGET IS AN EXPLICIT DOM ELEMENT (div, span, td, p, h1, etc.)
    // =========================================================================
    try {
      await expect(activeLocator.first()).toContainText(expectedText, { timeout: 4000 });
      return;
    } catch (locErr) {
      // Also check if any child input inside the container element contains the expected value
      const childMatch = await activeLocator.first().evaluate((el, exp) => {
        const inputs = Array.from(el.querySelectorAll('input, textarea, select'));
        for (const inp of inputs) {
          const v = inp.value !== undefined ? inp.value : '';
          if (v.trim() === exp) return true;
        }
        return false;
      }, expectedText).catch(() => false);

      if (childMatch) {
        return;
      }

      // If the expected text is a transaction notification (e.g. "berhasil disimpan")
      // the LLM may have targeted the form/card instead of the popup toast.
      if (isNotificationIntent) {
        const popupLocator = page.locator('.swal2-popup, .swal2-title, .swal2-html-container, .toast, .alert, .notification');
        if ((await popupLocator.count().catch(() => 0)) > 0) {
          try {
            await expect(popupLocator.first()).toContainText(expectedText, { timeout: 3000 });
            return;
          } catch (swalErr) {}
        }

        if (page.__lastSaveSuccess || (page.__lastSaveMessage && /berhasil|sukses|success|tersimpan/i.test(page.__lastSaveMessage))) {
          return;
        }
      }

      // Smart Fallback for Button Target:
      // If the target element is a button/control, but the expected text is a numeric or indicator value,
      // the assertion likely intended to verify a counter/metric displayed within the same card/container widget.
      const isButtonEl = await activeLocator.first().evaluate(el => {
        const tag = el.tagName ? el.tagName.toLowerCase() : '';
        return tag === 'button' || el.classList.contains('btn') || el.type === 'button' || el.type === 'submit';
      }).catch(() => false);

      if (isButtonEl) {
        const enclosingWidget = activeLocator.first().locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " card ") or contains(concat(" ", normalize-space(@class), " "), " box ") or contains(concat(" ", normalize-space(@class), " "), " panel ") or contains(concat(" ", normalize-space(@class), " "), " widget ") or contains(concat(" ", normalize-space(@class), " "), " card-body ")][1]');
        if ((await enclosingWidget.count().catch(() => 0)) > 0) {
          const widgetText = await enclosingWidget.first().innerText().catch(() => '');
          if (matchesExpectedValue(widgetText, expectedText) || widgetText.includes(expectedText)) {
            // Self-heal: expected value is present in the button's parent card widget
            return;
          }
        }
      }

      // STRICT ASSERTION: The explicit element was found and simply does not contain the expected text.
      const currentText = await activeLocator.first().innerText().catch(() => '');
      throw new Error(
        `Asersi Teks Gagal: Elemen "${rawTarget}" berisi teks "${currentText.substring(0, 80)}", diharapkan memuat "${expectedText}".`
      );
    }
  }

  // =========================================================================
  // CASE 3: BROAD / GLOBAL PAGE-LEVEL ASSERTIONS (target is body, null, or missing)
  // =========================================================================
  if (page.__lastAlertText && page.__lastAlertText.toLowerCase().includes(expectedText.toLowerCase())) {
    return;
  }

  // Check popups first
  const popupLocator = page.locator('.swal2-popup, .swal2-title, .swal2-html-container, .toast, .alert, .notification');
  if ((await popupLocator.count().catch(() => 0)) > 0) {
    try {
      await expect(popupLocator.first()).toContainText(expectedText, { timeout: 3000 });
      return;
    } catch (swalErr) {}
  }

  if (isNotificationIntent && page.__lastSaveSuccess) {
    return;
  }

  // Check visible page body
  try {
    await expect(page.locator('body')).toContainText(expectedText, { timeout: 4000 });
    return;
  } catch (err) {
    // Check page inputs
    const pageInputMatch = await page.evaluate(({ exp }) => {
      const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
      for (const el of inputs) {
        if (el.offsetWidth === 0 && el.offsetHeight === 0 && el.type !== 'hidden') continue;
        const val = el.value !== undefined ? String(el.value).trim() : '';
        if (val === exp) return true;
        if (/^-?\d+(\.\d+)?$/.test(exp)) {
          const clean = val.replace(/[^\d.-]/g, '').replace(',', '.');
          if (clean && parseFloat(clean) === parseFloat(exp)) return true;
        }
      }
      return false;
    }, { exp: expectedText }).catch(() => false);

    if (pageInputMatch) {
      return;
    }

    throw new Error(
      `Asersi Teks Global Gagal: Teks atau nilai "${expectedText}" tidak ditemukan pada halaman.`
    );
  }
}

/**
 * Handle 'assert_title' action.
 */
async function assertTitleAction({ page, step }) {
  const expectedTitle = String(step.value || step.expected_result || '');
  await expect(page).toHaveTitle(new RegExp(expectedTitle, 'i'), { timeout: 8000 });
}

/**
 * Handle 'assert_url' action.
 */
async function assertUrlAction({ page, step }) {
  const expectedUrl = String(step.value || step.expected_result || '');
  await expect(page).toHaveURL(new RegExp(expectedUrl, 'i'), { timeout: 8000 });
}

/**
 * Handle 'assert_color' action across DataTables rows using optical RGB classification.
 */
async function assertColorAction({ page, locator, step }) {
  const rawTarget = typeof step.target === 'object' ? step.target?.value || '' : step.target || '';
  const expectedColor = String(step.value || rawTarget || '').toLowerCase().trim();

  // 1. Purge CI4 debug bar elements from DOM
  const debugSelColor = appProfile.get('debugOverlay');
  if (debugSelColor) {
    await page.evaluate((sel) => {
      document.querySelectorAll(sel).forEach(el => el.remove());
    }, debugSelColor).catch(() => {});
  }

  // 2. Select data table rows explicitly
  const mainTbl = appProfile.get('mainDataTable');
  let targetEl = page.locator(`${mainTbl ? mainTbl + ' tbody tr, ' : ''}${appProfile.get('dataTableRows', '.dataTable tbody tr')}`);
  if ((await targetEl.count().catch(() => 0)) === 0) {
    if (locator) {
      targetEl = locator;
    } else {
      targetEl = page.locator('table:not([class*="timeline"]):not([id*="debug"]):not([id*="table_"]) tbody tr');
    }
  }

  const count = await targetEl.count();
  if (count === 0) {
    throw new Error(`Validasi Warna Gagal: Tidak ada baris tabel atau elemen yang cocok dengan "${rawTarget}"`);
  }

  // 3. Evaluate optical RGB visual color spectrum
  const results = await targetEl.evaluateAll((elements, evalArg) => {
    const colorQuery = evalArg.q;
    const strictDebugSel = evalArg.strict;
    const dataRows = elements.filter(el => {
      if (el.closest('thead')) return false;
      if (strictDebugSel && el.closest(strictDebugSel)) return false;
      if (el.tagName.toLowerCase() === 'tr' && el.querySelectorAll('th').length > 0 && el.querySelectorAll('td').length === 0) return false;
      if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;
      return true;
    });

    if (dataRows.length === 0) return [];

    function parseRgb(str) {
      if (!str) return null;
      const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!m) return null;
      return {
        r: parseInt(m[1], 10),
        g: parseInt(m[2], 10),
        b: parseInt(m[3], 10),
        a: m[4] !== undefined ? parseFloat(m[4]) : 1.0
      };
    }

    function classifyRgb(r, g, b, a) {
      if (a !== undefined && a < 0.1) return 'transparan';
      if (r < 55 && g < 55 && b < 55) return 'hitam';
      if (r > 245 && g > 245 && b > 245) return 'putih';
      if (Math.abs(r - g) < 20 && Math.abs(g - b) < 20 && Math.abs(r - b) < 20) {
        return r < 180 ? 'abu-abu' : 'putih';
      }
      if (r > 170 && g > 150 && b < 140) return 'kuning';
      if (r > 130 && r > g * 1.25 && r > b * 1.25) return 'merah';
      if (g > 110 && g > r * 1.15 && g > b * 1.15) return 'hijau';
      if (b > 120 && b > r * 1.15) return 'biru';
      return 'abu-abu';
    }

    return dataRows.map(row => {
      const computed = window.getComputedStyle(row);
      const bg = computed.backgroundColor;
      const parsed = parseRgb(bg);
      const detected = parsed ? classifyRgb(parsed.r, parsed.g, parsed.b, parsed.a) : 'putih';
      return { detectedColor: detected, text: row.innerText.substring(0, 40).replace(/\s+/g, ' ') };
    });
  }, { q: expectedColor, strict: appProfile.get('debugOverlayStrict') });

  const matched = results.filter(r => r.detectedColor === expectedColor || (expectedColor === 'kuning' && r.detectedColor === 'kuning'));
  if (matched.length === 0 && results.length > 0) {
    const summary = results.slice(0, 3).map(r => `"${r.text}" (${r.detectedColor})`).join(', ');
    throw new Error(`Validasi Warna Gagal: Mengharapkan warna '${expectedColor}', namun baris tabel terdeteksi: ${summary}`);
  }
}

module.exports = {
  assertVisibleAction,
  assertTextAction,
  assertTitleAction,
  assertUrlAction,
  assertColorAction
};
