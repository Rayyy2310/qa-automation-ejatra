/**
 * fillAction.js — Action Handlers for Form Input, Native Select, Checkbox, and Radio Buttons
 */

const { autoRevealParentContainer } = require('./overlayHandler');
const { resolveTargetString } = require('../../utils/urlHelper');
const { searchSelect2Action } = require('./searchSelect2Action');
const { unwrapLocator, waitForJQuery, isSelect2Element } = require('../../utils/playwrightHelpers');
const appProfile = require('../../utils/appProfile');

/**
 * Handle 'fill' action with reactive event dispatching and auto container reveal.
 */
async function fillAction({ page, locator, step }) {
  let activeLocator = unwrapLocator(locator, 'fill');

  const rawTarget = resolveTargetString(step.target);
  const expStr = String(step.expected_result || '').toLowerCase();
  const targetStr = rawTarget.toLowerCase();
  if (!activeLocator || !activeLocator.__alreadyResolved) {
    await autoRevealParentContainer(page, activeLocator, rawTarget, 'fill');
  }

  // Password Field Safeguard: detect password intent to prevent mistyping into username/other fields
  const isPasswordIntent = expStr.includes('password') || expStr.includes('sandi') ||
                           targetStr.includes('password') || targetStr.includes('pass') || targetStr.includes('sandi');
  if (isPasswordIntent && page) {
    const passField = page.locator('input[type="password"], #password, input[name="password"]').first();
    if ((await passField.count().catch(() => 0)) > 0) {
      activeLocator = passField;
    }
  }

  // ─── SMART FALLBACK: DYNAMIC MODAL & SWEETALERT2 POPUP (e.g. Tambah Item Pengiriman) ───
  if (page && ['volume', 'vol', 'tgl', 'tanggal', 'kirim', 'keterangan', 'ket', 'jobsite'].some(k => targetStr.includes(k) || expStr.includes(k))) {
    const isSwalOpen = (await page.locator('.swal2-popup:visible').count().catch(() => 0)) > 0;
    if (isSwalOpen) {
      const swalIds = appProfile.get('swalFields', {});
      if (targetStr.includes('volume') || targetStr.includes('vol') || expStr.includes('volume')) {
        const swalVol = page.locator(`${swalIds.volume ? swalIds.volume + ', ' : ''}.swal2-popup input[placeholder*="Volume" i], .swal2-popup input[placeholder*="15000"], .swal2-popup input[type="number"]`).first();
        if ((await swalVol.count().catch(() => 0)) > 0) activeLocator = swalVol;
      } else if (targetStr.includes('tgl') || targetStr.includes('tanggal') || targetStr.includes('kirim') || expStr.includes('tanggal') || expStr.includes('kirim')) {
        const swalTgl = page.locator(`${swalIds.tgl_kirim ? swalIds.tgl_kirim + ', ' : ''}.swal2-popup input[type="date"]`).first();
        if ((await swalTgl.count().catch(() => 0)) > 0) activeLocator = swalTgl;
      } else if (targetStr.includes('keterangan') || targetStr.includes('ket') || expStr.includes('keterangan')) {
        const swalKet = page.locator(`${swalIds.keterangan ? swalIds.keterangan + ', ' : ''}.swal2-popup input[placeholder*="Opsional" i], .swal2-popup input[placeholder*="Keterangan" i]`).first();
        if ((await swalKet.count().catch(() => 0)) > 0) activeLocator = swalKet;
      } else if (targetStr.includes('jobsite') || expStr.includes('jobsite')) {
        const swalJob = page.locator(`${swalIds.jobsite ? swalIds.jobsite + ', ' : ''}.swal2-popup input[placeholder*="Jobsite" i]`).first();
        if ((await swalJob.count().catch(() => 0)) > 0) activeLocator = swalJob;
      }
    }
  }

  if (!activeLocator) {
    if (rawTarget.startsWith('#') || rawTarget.startsWith('.') || rawTarget.startsWith('[') || rawTarget.includes('=')) {
      activeLocator = page.locator(rawTarget).first();
    } else {
      activeLocator = page.locator(`
        input[name="${rawTarget}"],
        input[id="${rawTarget}"],
        input[placeholder*="${rawTarget}" i],
        textarea[name="${rawTarget}"],
        textarea[id="${rawTarget}"]
      `.replace(/\s+/g, ' ').trim()).first();
    }
  }

  // Active Modal Heuristic Fallback: Jika locator awal tidak ditemukan atau tidak visible, cari di dalam modal/popup aktif
  if (page && (!activeLocator || (!activeLocator.__alreadyResolved && !(await activeLocator.isVisible().catch(() => false))))) {
    const activeModal = page.locator('.modal.show:visible, .swal2-popup:visible, [role="dialog"]:visible').first();
    if ((await activeModal.count().catch(() => 0)) > 0) {
      const cleanTarget = rawTarget.replace(/^[#\.\s]+/, '').replace(/_/g, ' ').trim();
      const modalInput = activeModal.locator(`
        input[id*="${cleanTarget}" i],
        input[name*="${cleanTarget}" i],
        input[placeholder*="${cleanTarget}" i],
        label:has-text("${cleanTarget}") + input,
        label:has-text("${cleanTarget}") ~ input,
        .col-md-6:has(label:has-text("${cleanTarget}")) input
      `.replace(/\s+/g, ' ').trim()).first();

      if ((await modalInput.count().catch(() => 0)) > 0 && (await modalInput.isVisible().catch(() => false))) {
        activeLocator = modalInput;
      }
    }
  }

  if (!activeLocator || typeof activeLocator.fill !== 'function') {
    throw new Error(`Elemen input tidak ditemukan untuk target: ${JSON.stringify(step.target)}`);
  }

  // Single-pass DOM inspection: ambil semua metadata elemen dalam 1 kali panggilan evaluate
  const elMeta = await activeLocator.evaluate(el => {
    if (!el) return null;
    const tag = (el.tagName || '').toLowerCase();
    const type = (el.type || '').toLowerCase();
    const id = el.id || '';
    const name = el.name || '';
    const cls = (typeof el.className === 'string' ? el.className : '').toLowerCase();
    const ph = (el.getAttribute('placeholder') || '').toLowerCase();
    const fmt = (el.getAttribute('data-date-format') || el.getAttribute('data-format') || '').toLowerCase();

    const isRadioOrCheckbox = tag === 'input' && (type === 'radio' || type === 'checkbox');

    let isSelect2 = false;
    if (tag !== 'select') {
      isSelect2 = el.classList.contains('select2-hidden-accessible') ||
                  el.classList.contains('select2-selection') ||
                  el.classList.contains('select2-container') ||
                  Boolean(el.closest?.('.select2-container'));
    } else {
      const next = el.nextElementSibling;
      const parent = el.parentElement;
      isSelect2 = el.classList.contains('select2-hidden-accessible') ||
                  Boolean(next && (next.classList.contains('select2-container') || next.classList.contains('select2'))) ||
                  Boolean(parent && parent.querySelector('.select2-container'));
    }

    const isTimeInput = type === 'time' || cls.includes('time');
    const isDmy = ph.includes('dd/mm') || ph.includes('dd-mm') || fmt.includes('dd/mm') || fmt.includes('d/m/y') || (cls.includes('datepicker') && (ph.includes('dd') || ph.includes('yyyy')));
    const isSearchInput = type === 'search' ||
                          Boolean(el.closest('.dataTables_filter')) ||
                          id.toLowerCase().includes('search') || id.toLowerCase().includes('cari') ||
                          name.toLowerCase().includes('search') || name.toLowerCase().includes('cari');

    return { tag, type, id, isRadioOrCheckbox, isSelect2, isTimeInput, isDmy, isSearchInput };
  }).catch(() => null);

  // Radio/Checkbox guard: jika step adalah 'fill' pada radio button atau checkbox,
  // perlakukan sebagai aksi pilih/check (misalnya LLM menghasilkan fill #spm_susulan)
  if (elMeta?.isRadioOrCheckbox) {
    const elId = elMeta.id || null;
    let labelLoc = elId ? page.locator(`label[for="${elId}"], [for="${elId}"]:not(input):not(select):not(textarea)`).first() : null;
    if (!labelLoc || (await labelLoc.count().catch(() => 0)) === 0) {
      labelLoc = activeLocator.locator('xpath=ancestor::label[1]').first();
    }

    if (labelLoc && (await labelLoc.count().catch(() => 0)) > 0 && (await labelLoc.isVisible().catch(() => false))) {
      await labelLoc.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
      try {
        await labelLoc.click({ timeout: 3000 });
      } catch {
        await labelLoc.click({ force: true, timeout: 2000 }).catch(() => {});
      }
    }

    await activeLocator.evaluate(el => {
      el.checked = true;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      const $ = window.jQuery || window.$;
      if ($) $(el).prop('checked', true).trigger('change');
    }).catch(() => {});

    await page.waitForTimeout(250);
    return;
  }

  // Select2 Auto-Bridge: jika target fill ternyata adalah elemen Select2 dropdown,
  // delegasikan langsung ke searchSelect2Action agar opsi terpilih dengan benar
  if (elMeta?.isSelect2) {
    return await searchSelect2Action({ page, locator: activeLocator, step });
  }

  if (typeof activeLocator.scrollIntoViewIfNeeded === 'function') {
    await activeLocator.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
  }
  // AJAX In-flight Safeguard: wait for any background data hydration to settle so it won't overwrite user input
  const currentUrl = page ? page.url() : '';
  const isLoginPage = currentUrl.includes('/masuk') || currentUrl.endsWith('/') || currentUrl.endsWith(':8080') || currentUrl.endsWith(':8080/');
  if (page && !isLoginPage) {
    await waitForJQuery(page, 3000);
  }
  let strVal = step.value !== undefined && step.value !== null ? String(step.value) : '';

  // Credential Placeholder Safeguard: Ensure no literal '{username_from_env}' or '{password_from_env}' is ever typed into fields
  if (/^\{{1,2}\s*(?:username_from_env|username|env\.username)\s*\}{1,2}$/i.test(strVal) ||
      (strVal === '' && (targetStr.includes('username') || expStr.includes('username')))) {
    const envUser = (process.env.EJATRA_TEST_USERNAME || process.env.EJATRA_USERNAME || '').replace(/^['"]+|['"]+$/g, '').trim();
    if (envUser) strVal = envUser;
  } else if (/^\{{1,2}\s*(?:password_from_env|password|env\.password)\s*\}{1,2}$/i.test(strVal) ||
      (strVal === '' && isPasswordIntent)) {
    const envPass = (process.env.EJATRA_TEST_PASSWORD || process.env.EJATRA_PASSWORD || '').replace(/^['"]+|['"]+$/g, '').trim();
    if (envPass) strVal = envPass;
  }

  // Time Input Format Adaptation (e.g. "10.00" -> "10:00" for native type="time" or timepicker)
  if (elMeta?.isTimeInput && /^\d{1,2}[\.:]\d{2}(?:[\.:]\d{2})?$/.test(strVal.trim())) {
    const parts = strVal.trim().split(/[\.:]/);
    const hh = parts[0].padStart(2, '0');
    const mm = parts[1].padStart(2, '0');
    strVal = `${hh}:${mm}`;
  }

  // Datepicker Format Adaptation (YYYY-MM-DD <-> DD/MM/YYYY)
  if (elMeta?.type === 'date') {
    // Native HTML5 date input strictly requires YYYY-MM-DD
    if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}$/.test(strVal.trim())) {
      const [d, m, y] = strVal.trim().split(/[\/\-\.]/);
      strVal = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  } else if (elMeta?.isDmy && /^\d{4}-\d{2}-\d{2}$/.test(strVal.trim())) {
    const [y, m, d] = strVal.trim().split('-');
    strVal = `${d}/${m}/${y}`;
  }

  try {
    await activeLocator.fill(strVal, { timeout: 3000 });
  } catch (err) {
    try {
      await activeLocator.click({ force: true, timeout: 1500 });
      await activeLocator.fill(strVal, { force: true });
    } catch (err2) {
      await activeLocator.evaluate((el, val) => {
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        const $ = window.jQuery || window.$;
        if ($) $(el).trigger('input').trigger('change');
      }, strVal);
    }
  }

  // Trigger reactive input & change events for front-end frameworks + verify value in 1 pass
  const finalVal = await activeLocator.evaluate(el => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    const $ = window.jQuery || window.$;
    if ($) $(el).trigger('input').trigger('change');
    return el.value !== undefined ? String(el.value).trim() : null;
  }).catch(() => null);

  // Post-fill verification: ensure the value actually took effect and was not silently discarded by browser
  if (strVal !== '' && finalVal !== null && finalVal === '') {
    throw new Error(`Gagal mengisi elemen '${rawTarget}': Nilai '${strVal}' tidak diterima oleh elemen (format input tidak sesuai atau elemen tidak editable).`);
  }

  // ─── DataTables / Table Search Safeguard ────────────────────────────────────
  // Hanya picu jika input BENAR-BENAR kotak pencarian tabel (type="search", .dataTables_filter, #search, dll),
  // BUKAN semua input kecil form biasa (.form-control-sm)
  const isSearchTarget = ['search', 'cari', 'datatables_filter'].some(k => rawTarget.includes(k) || expStr.includes(k));
  const isSearchInput = Boolean(elMeta?.isSearchInput);

  if ((isSearchTarget || isSearchInput) && page) {
    await activeLocator.evaluate((el, val) => {
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
      const $ = window.jQuery || window.$;
      if ($) {
        $(el).trigger('input').trigger('keyup').trigger('change');
        if ($.fn && $.fn.dataTable) {
          try {
            const dt = $('.dataTable:visible, table.dataTable:visible').DataTable();
            if (dt) dt.search(val).draw();
          } catch (e) {}
        }
      }
    }, strVal).catch(() => {});

    // Tunggu spinner .dataTables_processing hilang (maksimal 20 detik)
    try {
      const dtSpinner = page.locator('.dataTables_processing:visible, [id$="_processing"]:visible');
      const appeared = await dtSpinner.first().waitFor({ state: 'visible', timeout: 800 }).then(() => true).catch(() => false);
      if (appeared) {
        await dtSpinner.first().waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(250);
      } else {
        await page.waitForTimeout(250);
      }
    } catch (_) {}
  }
}


/**
 * Handle 'select' dropdown option selection with adaptive Select2 bridging.
 */
async function selectAction({ page, locator, step }) {
  let activeLocator = unwrapLocator(locator, 'selectOption');
  const rawTarget = resolveTargetString(step.target);
  if (!activeLocator || !activeLocator.__alreadyResolved) {
    await autoRevealParentContainer(page, activeLocator, rawTarget, 'select');
  }

  if (!activeLocator) {
    if (rawTarget.startsWith('#') || rawTarget.startsWith('.') || rawTarget.startsWith('[') || rawTarget.includes('=')) {
      activeLocator = page.locator(rawTarget).first();
    } else {
      activeLocator = page.locator(`
        select[name="${rawTarget}"], 
        select#${rawTarget}, 
        select[id="${rawTarget}"],
        #f_${rawTarget},
        #filter_${rawTarget}
      `.replace(/\s+/g, ' ').trim()).first();
    }
  }
  if (!activeLocator) {
    throw new Error(`Elemen select tidak ditemukan untuk target: ${JSON.stringify(step.target)}`);
  }

  const valStr = String(step.value || '').trim();

  // 1. Adaptive Select2 Detection (skip if already checked in stepExecutor)
  const isSelect2 = activeLocator.__checkedSelect2 ? false : await isSelect2Element(activeLocator);

  if (isSelect2) {
    return await searchSelect2Action({ page, locator: activeLocator, step });
  }

  // 2. Native Select Option Selection with Fallback Bridge
  try {
    await activeLocator.selectOption({ label: valStr }, { timeout: 2500 }).catch(async () => {
      await activeLocator.selectOption({ value: valStr }, { timeout: 2000 }).catch(async () => {
        await activeLocator.selectOption({ index: parseInt(valStr, 10) || 0 }, { timeout: 1500 });
      });
    });

    // Trigger reactive events
    await activeLocator.evaluate((el, val) => {
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      if (window.jQuery || window.$) {
        const $ = window.jQuery || window.$;
        $(el).trigger('change');
      }
    }, valStr).catch(() => {});
  } catch (err) {
    // If native selectOption fails (e.g. element is not a <select> or hidden by custom dropdown),
    // seamlessly delegate to searchSelect2Action
    return await searchSelect2Action({ page, locator: activeLocator, step });
  }
}

/**
 * Shared helper for check/uncheck actions on checkboxes and radio buttons.
 * @param {Object} params - Action parameters { page, locator, step }
 * @param {boolean} checked - true to check, false to uncheck
 */
async function setCheckboxState({ page, locator, step }, checked = true) {
  const rawTarget = typeof step.target === 'object' ? step.target?.value || '' : step.target || '';
  await autoRevealParentContainer(page, locator, rawTarget, checked ? 'check' : 'uncheck');

  const activeLocator = locator || page.locator(`input[type="checkbox"][name="${rawTarget}"], input[type="radio"][name="${rawTarget}"], input#${rawTarget}, css=${rawTarget}`).first();
  if (!activeLocator) throw new Error(`Elemen checkbox tidak ditemukan untuk target: ${JSON.stringify(step.target)}`);

  // Detect if this is a CSS-hidden radio/checkbox with a styled <label for="id"> as visual proxy
  // (e.g. spm-type-radio pattern: position:absolute; opacity:0; pointer-events:none)
  // In this case, clicking the label is more reliable than force-checking the hidden input.
  const elId = await activeLocator.getAttribute('id').catch(() => null);
  if (elId && checked) {
    const isHiddenInput = await activeLocator.evaluate(el => {
      if (!el || !['input'].includes(el.tagName.toLowerCase())) return false;
      const type = (el.type || '').toLowerCase();
      if (type !== 'radio' && type !== 'checkbox') return false;
      const style = window.getComputedStyle(el);
      return parseFloat(style.opacity) === 0 || style.pointerEvents === 'none' || parseInt(style.width) <= 1;
    }).catch(() => false);

    if (isHiddenInput) {
      const labelLoc = page.locator(`label[for="${elId}"]`).first();
      if (await labelLoc.count() > 0 && await labelLoc.isVisible().catch(() => false)) {
        await labelLoc.click({ force: true }).catch(() => {});
        // Trigger jQuery change on the hidden input so application callbacks fire
        await activeLocator.evaluate((el) => {
          el.dispatchEvent(new Event('change', { bubbles: true }));
          if (typeof window.jQuery !== 'undefined') window.jQuery(el).trigger('change');
          else if (typeof window.$ !== 'undefined') window.$(el).trigger('change');
        }).catch(() => {});
        return;
      }
    }
  }

  if (checked) {
    await activeLocator.check({ force: true });
  } else {
    await activeLocator.uncheck({ force: true });
  }

  // Dispatch native + jQuery change events so application callbacks (e.g. handleSpmTypeChange)
  // that are bound via jQuery .on('change') are also triggered after check/uncheck.
  await activeLocator.evaluate((el) => {
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    if (typeof window.jQuery !== 'undefined') {
      window.jQuery(el).trigger('change');
    } else if (typeof window.$ !== 'undefined') {
      window.$(el).trigger('change');
    }
  }).catch(() => {});
}

/**
 * Handle 'check' action for checkboxes and radio buttons.
 */
async function checkAction(params) {
  return setCheckboxState(params, true);
}

/**
 * Handle 'uncheck' action for checkboxes.
 */
async function uncheckAction(params) {
  return setCheckboxState(params, false);
}

module.exports = {
  fillAction,
  selectAction,
  checkAction,
  uncheckAction
};
