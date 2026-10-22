'use strict';

/**
 * domExtractor.js — Browser-Context DOM Extraction for e-Jatra Scanner
 *
 * Berisi fungsi murni browser-side `extractElementsInState` (dijalankan di dalam page.evaluate)
 * serta pembungkus `extractAllDomModals` untuk mengekstrak seluruh modal di DOM.
 */

const { ICON_MAP } = require('./explorerConfig');

/**
 * Scan DOM elements in the current page state (or specific sub-mode: 'state' | 'row_actions' | 'dormant_modals').
 * Executed inside browser page.evaluate().
 */
function extractElementsInState(options = {}) {
  const {
    mode = 'state',
    stateTag = 'tabel',
    triggerSelector = null,
    triggerText = null,
    containerSelector = null,
    iconMap = {},
    ignoredDebugSelector = '[id*="debug"], [class*="debug"], [class*="timeline"], [data-debugbar]',
    ignoredNavSelector = '.navbar, .navbar-nav, nav, header, .topbar, .main-header, .sidebar, .sidebar-menu, .menu, [id="sidebar"], .navigation, [role="navigation"], .app-header, .user-panel',
  } = options;

  /**
   * Factory tunggal untuk membuat record 27 kolom dengan urutan key yang konsisten.
   */
  function createRecord(overrides = {}) {
    return Object.assign({
      element_category: null,
      tag_name: null,
      element_name: null,
      element_id: null,
      element_type: null,
      label_text: null,
      placeholder: null,
      button_text: null,
      widget_type: 'native',
      css_selector: null,
      table_headers: null,
      table_row_count: null,
      badge_colors: null,
      form_block_name: null,
      is_visible: true,
      is_required: false,
      options_sample: null,
      state_tag: 'tabel',
      trigger_selector: null,
      trigger_text: null,
      aria_label: null,
      title_attr: null,
      icon_hint: null,
      requires_json: null,
      is_disabled_initial: 0,
      is_readonly: 0,
      scan_quality: 'complete',
    }, overrides);
  }

  function normalizeText(str) {
    return (str || '').trim().replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ');
  }

  function cleanTextToken(str) {
    return (str || '').replace(/[^\p{L}\p{N}\s\-\(\)\/\._]/u, '').trim();
  }

  function buildSelector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    if (el.name) return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
    if (el.type && el.tagName === 'INPUT') return `input[type="${el.type}"]`;
    return null;
  }

  function extractIconHint(el) {
    const iconEl = el.querySelector('i, svg, span[class*="fa"], span[class*="bi"]');
    if (!iconEl) return null;
    const classes = (iconEl.className || '').toLowerCase().split(/\s+/);
    for (const cls of classes) {
      const cleanCls = cls.replace(/^(fa[srldb]?|bi)-/, '');
      if (iconMap[cleanCls]) return iconMap[cleanCls];
      if (iconMap[cls]) return iconMap[cls];
    }
    return null;
  }

  function extractTableHeaders(tbl) {
    const headers = [];
    tbl.querySelectorAll('thead th, thead td').forEach(th => {
      const txt = th.textContent.trim();
      if (txt) headers.push(txt);
    });
    return headers;
  }

  function isHiddenOrInternalInput(el) {
    return (
      el.type === 'hidden' ||
      el.type === 'csrf' ||
      el.name === 'csrf_test_name' ||
      Boolean(el.closest('.select2-container, .select2-dropdown'))
    );
  }

  function isDisabledInitial(el) {
    return el.disabled || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled') ? 1 : 0;
  }

  function isReadonlyEl(el) {
    return el.readOnly || el.hasAttribute('readonly') ? 1 : 0;
  }

  function isDismissButton(el, rawText, requireModalAncestorForClose = true) {
    const hasCloseClass = requireModalAncestorForClose
      ? (el.classList.contains('close') && Boolean(el.closest('.modal')))
      : el.classList.contains('close');
    return (
      el.classList.contains('btn-close') ||
      hasCloseClass ||
      el.hasAttribute('data-bs-dismiss') ||
      el.hasAttribute('data-dismiss') ||
      ['×', '✕', '✖'].includes(rawText)
    );
  }

  // ─── SUB-MODE A: ROW ACTIONS DROPDOWN ───
  if (mode === 'row_actions') {
    const found = [];
    const seenTexts = new Set();
    const menu = document.querySelector('.dropdown-menu.show, tbody tr:first-child .dropdown-menu');
    if (!menu) return found;

    menu.querySelectorAll('a, button, .dropdown-item').forEach(item => {
      if (item.classList.contains('dropdown-toggle')) return;
      const rawText = normalizeText(item.textContent);
      const cleanText = cleanTextToken(rawText);
      const ariaLabel = item.getAttribute('aria-label') || null;
      const titleAttr = item.getAttribute('title') || item.getAttribute('data-original-title') || null;
      const iconHint = extractIconHint(item);

      const effectiveText = cleanText || iconHint || ariaLabel || titleAttr || null;
      if (!effectiveText || seenTexts.has(effectiveText)) return;
      seenTexts.add(effectiveText);

      found.push(createRecord({
        element_category: 'row_action',
        tag_name: item.tagName.toLowerCase(),
        element_id: item.id || null,
        label_text: 'Aksi Baris Tabel [ ☰ ▾ ]',
        button_text: effectiveText,
        widget_type: 'dropdown_item',
        css_selector: `tbody tr:first-child .dropdown-menu a:has-text("${effectiveText}"), tbody tr:first-child .dropdown-menu button:has-text("${effectiveText}"), .dropdown-menu.show .dropdown-item:has-text("${effectiveText}")`,
        form_block_name: 'Aksi Baris Tabel',
        is_visible: true,
        state_tag: 'row_action',
        trigger_selector: 'tbody tr:first-child .dropdown-toggle',
        trigger_text: 'Menu Baris Tabel (☰)',
        aria_label: ariaLabel,
        title_attr: titleAttr,
        icon_hint: iconHint,
      }));
    });

    return found;
  }

  // ─── SUB-MODE B: DORMANT DOM MODALS ───
  if (mode === 'dormant_modals') {
    const found = [];
    const modals = document.querySelectorAll('.modal, [role="dialog"]');

    modals.forEach(modal => {
      const modalId = modal.id || null;
      const mTitleEl = modal.querySelector('.modal-title, h4, h5');
      const modalTitle = mTitleEl ? cleanTextToken(mTitleEl.textContent) : (modalId || 'Dialog');
      const formBlockName = `Modal: ${modalTitle}`;

      let modalTriggerSelector = null;
      if (modalId) {
        const trig = document.querySelector(`[data-bs-target="#${modalId}"], [data-target="#${modalId}"], [onclick*="${modalId}"]`);
        if (trig) {
          modalTriggerSelector = trig.id ? `#${trig.id}` : `[data-bs-target="#${modalId}"]`;
        }
      }

      // 1. Inputs inside modal
      modal.querySelectorAll('input, textarea').forEach(el => {
        if (isHiddenOrInternalInput(el)) return;

        let label = null;
        if (el.id) {
          const lbl = modal.querySelector(`label[for="${CSS.escape(el.id)}"]`);
          if (lbl) label = lbl.textContent.trim();
        }
        if (!label && el.placeholder) label = el.placeholder.trim();

        found.push(createRecord({
          element_category: 'input',
          tag_name: el.tagName.toLowerCase(),
          element_name: el.name || null,
          element_id: el.id || null,
          element_type: el.type || 'text',
          label_text: label,
          placeholder: el.placeholder || null,
          css_selector: buildSelector(el),
          form_block_name: formBlockName,
          is_visible: 1,
          is_required: el.required || el.hasAttribute('required'),
          state_tag: 'modal',
          trigger_selector: modalTriggerSelector,
          trigger_text: modalTitle,
          aria_label: el.getAttribute('aria-label') || null,
          title_attr: el.getAttribute('title') || null,
          is_readonly: isReadonlyEl(el),
        }));
      });

      // 2. Tables inside modal
      modal.querySelectorAll('table').forEach(tbl => {
        const headers = extractTableHeaders(tbl);

        found.push(createRecord({
          element_category: 'table',
          tag_name: 'table',
          element_id: tbl.id || null,
          label_text: `Tabel ${modalTitle}`,
          widget_type: tbl.classList.contains('dataTable') ? 'datatable' : 'native',
          css_selector: tbl.id ? `#${CSS.escape(tbl.id)}` : null,
          table_headers: headers.length > 0 ? JSON.stringify(headers) : null,
          table_row_count: tbl.querySelectorAll('tbody tr').length,
          form_block_name: formBlockName,
          is_visible: 1,
          state_tag: 'modal',
          trigger_selector: modalTriggerSelector,
          trigger_text: modalTitle,
        }));
      });

      // 3. Buttons inside modal
      modal.querySelectorAll('button, a.btn').forEach(btn => {
        const rawText = normalizeText(btn.textContent);
        const isDismissBtn = isDismissButton(btn, rawText, false);

        let cleanText = cleanTextToken(rawText);
        if (isDismissBtn) {
          cleanText = cleanText && !['×', '✕', '✖'].includes(cleanText)
            ? cleanText
            : (btn.getAttribute('aria-label') || 'Tutup / Close (×)');
        } else if (!cleanText && btn.id) {
          cleanText = btn.id;
        }
        if (!cleanText) return;

        const selector = btn.id ? `#${CSS.escape(btn.id)}` : (
          isDismissBtn
            ? (btn.classList.contains('btn-close') ? '.modal.show .btn-close' : '.modal.show .close, .modal.show [data-dismiss="modal"]')
            : `.modal:has-text("${modalTitle}") button:has-text("${cleanText}"), button:has-text("${cleanText}")`
        );

        found.push(createRecord({
          element_category: 'button',
          tag_name: btn.tagName.toLowerCase(),
          element_name: btn.name || null,
          element_id: btn.id || null,
          element_type: btn.type || null,
          button_text: cleanText,
          css_selector: selector,
          form_block_name: formBlockName,
          is_visible: 1,
          state_tag: 'modal',
          trigger_selector: modalTriggerSelector,
          trigger_text: modalTitle,
          aria_label: btn.getAttribute('aria-label') || null,
          title_attr: btn.getAttribute('title') || null,
        }));
      });
    });

    return found;
  }

  // ─── DEFAULT MODE: ACTIVE STATE EXTRACTION ('tabel' | 'form' | 'modal') ───
  const elements = [];
  let root = document;
  if (containerSelector) {
    try {
      const found = document.querySelector(containerSelector);
      if (found) root = found;
    } catch {
      root = document;
    }
  }

  function findLabel(el) {
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl && lbl.textContent.trim()) return lbl.textContent.trim();
    }
    let prev = el.previousElementSibling;
    while (prev) {
      if (prev.tagName === 'LABEL' && prev.textContent.trim()) return prev.textContent.trim();
      if (prev.querySelector && prev.querySelector('label') && prev.querySelector('label').textContent.trim()) {
        return prev.querySelector('label').textContent.trim();
      }
      prev = prev.previousElementSibling;
    }
    if (el.parentElement) {
      const parentLabel = el.parentElement.querySelector(':scope > label');
      if (parentLabel && parentLabel.textContent.trim()) return parentLabel.textContent.trim();
    }
    const group = el.closest('.form-floating, .form-group, .input-group, .col-md-3, .col-md-2, .col-sm-4, .col-sm-3');
    if (group) {
      const lbl = group.querySelector(':scope > label, label');
      if (lbl && lbl.textContent.trim()) return lbl.textContent.trim();
    }
    if (el.getAttribute('data-placeholder')) return el.getAttribute('data-placeholder').trim();
    if (el.getAttribute('title')) return el.getAttribute('title').trim();
    if (el.placeholder) return el.placeholder.trim();
    return null;
  }

  function findFormBlock(el) {
    const tabPane = el.closest('.tab-pane, [role="tabpanel"]');
    if (tabPane) {
      const tabId = tabPane.id;
      const tabNav = tabId ? document.querySelector(`[data-bs-target="#${tabId}"], [href="#${tabId}"], #${tabId}-tab`) : null;
      const tabTitle = tabNav ? cleanTextToken(tabNav.textContent) : '';
      if (tabTitle) return `Tab: ${tabTitle}`;
      if (tabId) return `Tab: ${tabId}`;
    }
    const modal = el.closest('.modal');
    if (modal) {
      const mTitle = modal.querySelector('.modal-title, h4, h5');
      const txt = mTitle ? cleanTextToken(mTitle.textContent) : '';
      return txt ? `Modal: ${txt}` : 'Modal Dialog';
    }
    const container = el.closest('.card, .panel, .box, form, fieldset, .filter-section, .filter-box, .dataTables_wrapper');
    if (!container) return null;
    const titleEl = container.querySelector('.card-title, .box-title, .panel-title, .panel-heading, legend, h3, h4, h5');
    if (titleEl) {
      const txt = cleanTextToken(titleEl.textContent).replace(/\s+/g, ' ');
      if (txt && txt.length > 2 && txt.length < 100) return txt;
    }
    if (container.id) return container.id;
    if (container.getAttribute('name')) return container.getAttribute('name');
    return null;
  }

  function isIgnoredElement(el) {
    if (!el) return true;
    if (el.closest(ignoredDebugSelector)) return true;
    if (el.closest(ignoredNavSelector)) return true;
    return false;
  }

  function inferStateTag(el, defaultState) {
    if (defaultState && defaultState !== 'tabel') return defaultState;
    if (el.closest('.modal')) return 'modal';
    const tabPane = el.closest('.tab-pane, [role="tabpanel"]');
    if (tabPane) {
      const tabId = (tabPane.id || '').toLowerCase();
      const tabNav = tabPane.id ? document.querySelector(`[data-bs-target="#${tabPane.id}"], [href="#${tabPane.id}"], #${tabPane.id}-tab`) : null;
      const navText = tabNav ? (tabNav.textContent || '').toLowerCase() : '';
      if (tabId.includes('form') || tabId.includes('input') || tabId.includes('tambah') || navText.includes('form') || navText.includes('input') || navText.includes('tambah')) {
        return 'form';
      }
      if (tabId.includes('tabel') || tabId.includes('table') || tabId.includes('data') || navText.includes('tabel') || navText.includes('data')) {
        return 'tabel';
      }
    }
    return defaultState || 'tabel';
  }

  // ─── 1. INPUT & TEXTAREA ───
  root.querySelectorAll('input, textarea').forEach(el => {
    if (isHiddenOrInternalInput(el) || isIgnoredElement(el)) return;

    elements.push(createRecord({
      element_category: 'input',
      tag_name: el.tagName.toLowerCase(),
      element_name: el.name || null,
      element_id: el.id || null,
      element_type: el.type || 'text',
      label_text: findLabel(el),
      placeholder: el.placeholder || null,
      widget_type: el.classList.contains('datepicker') || el.type === 'date' ? 'datepicker' : 'native',
      css_selector: buildSelector(el),
      form_block_name: findFormBlock(el),
      is_visible: el.offsetParent !== null,
      is_required: el.required || el.hasAttribute('required'),
      state_tag: inferStateTag(el, stateTag),
      trigger_selector: triggerSelector,
      trigger_text: triggerText,
      aria_label: el.getAttribute('aria-label') || null,
      title_attr: el.getAttribute('title') || null,
      is_disabled_initial: isDisabledInitial(el),
      is_readonly: isReadonlyEl(el),
    }));
  });

  // ─── 2. SELECT & DROPDOWNS ───
  root.querySelectorAll('select').forEach(el => {
    if (el.name === 'csrf_test_name' || isIgnoredElement(el)) return;

    const nextSib = el.nextElementSibling;
    const isSelect2 = (nextSib && nextSib.classList.contains('select2-container'))
                   || el.classList.contains('select2-hidden-accessible');
    const isTomSelect = nextSib && nextSib.classList.contains('ts-wrapper');
    const widgetType = isSelect2 ? 'select2' : (isTomSelect ? 'tomselect' : 'native');

    const opts = [];
    el.querySelectorAll('option').forEach((opt, i) => {
      if (i > 0 && i <= 5 && opt.textContent.trim()) {
        opts.push(opt.textContent.trim());
      }
    });

    elements.push(createRecord({
      element_category: 'dropdown',
      tag_name: 'select',
      element_name: el.name || null,
      element_id: el.id || null,
      label_text: findLabel(el),
      widget_type: widgetType,
      css_selector: buildSelector(el),
      form_block_name: findFormBlock(el),
      is_visible: el.offsetParent !== null || isSelect2,
      is_required: el.required || el.hasAttribute('required'),
      options_sample: opts.length > 0 ? JSON.stringify(opts) : null,
      state_tag: inferStateTag(el, stateTag),
      trigger_selector: triggerSelector,
      trigger_text: triggerText,
      aria_label: el.getAttribute('aria-label') || null,
      title_attr: el.getAttribute('title') || null,
      is_disabled_initial: isDisabledInitial(el),
      is_readonly: isReadonlyEl(el),
    }));
  });

  // ─── 3. BUTTONS (with Icon-Only & state capture) ───
  root.querySelectorAll('button, a.btn, input[type="submit"], input[type="button"]').forEach(el => {
    if (isIgnoredElement(el)) return;

    const rawText = normalizeText(el.textContent);
    if (['«', '»', '‹', '›', 'Previous', 'Next', 'First', 'Last'].includes(rawText)) return;

    const isDismissBtn = isDismissButton(el, rawText, true);

    let cleanText = cleanTextToken(rawText);
    if (!cleanText && isDismissBtn) {
      cleanText = 'Tutup / Close (×)';
    } else if (!cleanText) {
      cleanText = rawText;
    }

    const ariaLabel = el.getAttribute('aria-label') || null;
    const titleAttr = el.getAttribute('title') || el.getAttribute('data-original-title') || el.getAttribute('data-bs-original-title') || null;
    const iconHint  = extractIconHint(el);

    const effectiveText = (isDismissBtn ? (cleanText || ariaLabel || 'Tutup / Close (×)') : (cleanText || iconHint || ariaLabel || titleAttr)) || null;
    const scanQuality   = effectiveText ? 'complete' : 'unlabeled';

    if (!effectiveText && !el.id && !el.name) return;

    let selector = buildSelector(el);
    if (!selector) {
      if (isDismissBtn) {
        selector = el.classList.contains('btn-close')
          ? '.modal.show .btn-close'
          : (el.closest('.modal') ? '.modal.show .close, .modal.show [data-dismiss="modal"]' : '[data-bs-dismiss="modal"], [data-dismiss="modal"]');
      } else if (el.classList.contains('dropdown-toggle')) {
        selector = '.dropdown-toggle';
      } else if (cleanText) {
        selector = `button:has-text("${cleanText}"), a.btn:has-text("${cleanText}")`;
      } else if (iconHint) {
        selector = `button:has(.fa-${iconHint}), a.btn:has(.fa-${iconHint})`;
      }
    }

    elements.push(createRecord({
      element_category: 'button',
      tag_name: el.tagName.toLowerCase(),
      element_name: el.name || null,
      element_id: el.id || null,
      element_type: el.type || null,
      button_text: effectiveText ? effectiveText.substring(0, 200) : null,
      css_selector: selector,
      form_block_name: findFormBlock(el),
      is_visible: el.offsetParent !== null,
      state_tag: inferStateTag(el, stateTag),
      trigger_selector: triggerSelector,
      trigger_text: triggerText,
      aria_label: ariaLabel,
      title_attr: titleAttr,
      icon_hint: iconHint,
      is_disabled_initial: isDisabledInitial(el),
      scan_quality: scanQuality,
    }));
  });

  // ─── 4. TABLES (Only during initial 'tabel' state) ───
  if (stateTag === 'tabel') {
    root.querySelectorAll('table').forEach(el => {
      if (isIgnoredElement(el)) return;
      const headers = extractTableHeaders(el);

      const isDataTable = el.classList.contains('dataTable')
                       || el.id.includes('DataTable')
                       || el.closest('.dataTables_wrapper') !== null;

      const badgeColors = new Set();
      el.querySelectorAll('.badge-danger, .bg-danger, .table-danger, .text-danger').forEach(() => badgeColors.add('danger (merah/nunggak)'));
      el.querySelectorAll('.badge-success, .bg-success, .table-success, .text-success').forEach(() => badgeColors.add('success (hijau/lunas)'));
      el.querySelectorAll('.badge-warning, .bg-warning, .table-warning, .text-warning').forEach(() => badgeColors.add('warning (kuning/perhatian)'));
      el.querySelectorAll('.badge-dark, .bg-dark, .table-dark').forEach(() => badgeColors.add('dark (hitam/khusus)'));
      el.querySelectorAll('.badge-info, .bg-info, .badge-primary').forEach(() => badgeColors.add('info/primary (biru)'));

      elements.push(createRecord({
        element_category: 'table',
        tag_name: 'table',
        element_id: el.id || null,
        widget_type: isDataTable ? 'datatable' : 'native',
        css_selector: el.id ? `#${CSS.escape(el.id)}` : null,
        table_headers: headers.length > 0 ? JSON.stringify(headers) : null,
        table_row_count: el.querySelectorAll('tbody tr').length,
        badge_colors: badgeColors.size > 0 ? JSON.stringify([...badgeColors]) : null,
        form_block_name: findFormBlock(el),
        is_visible: el.offsetParent !== null,
        state_tag: 'tabel',
      }));
    });
  }

  // ─── 5. INDICATORS & METRIC CARDS (Display Values & Counters) ───
  root.querySelectorAll('.card, .box, .panel, .widget').forEach(card => {
    if (isIgnoredElement(card)) return;
    const headerEl = card.querySelector('.card-header, .card-title, .box-header, .panel-heading, h1, h2, h3, h4, h5, h6');
    const headerText = headerEl ? normalizeText(headerEl.textContent) : '';

    const hasCounterOrIndicator = /counter|indicator|rekap|statistik|saldo|status|metric|timbangan/i.test(headerText) ||
      card.querySelector('[id*="counter" i]:not(button):not(a), [class*="counter" i]:not(button):not(a), .display-1, .display-2, .display-3, .display-4') !== null;

    if (hasCounterOrIndicator && headerText) {
      const displayChild = card.querySelector('[id*="counter" i]:not(button):not(a), [class*="counter" i]:not(button):not(a), .display-1, .display-2, .display-3, .display-4, .card-body h1, .card-body h2, .card-body h3, .card-body div.fs-1, .card-body div.fs-2')
                        || card.querySelector('.card-body');

      const sel = displayChild && displayChild.id ? `#${CSS.escape(displayChild.id)}` : `.card:has-text("${headerText}") .card-body`;
      const currentVal = displayChild ? displayChild.textContent.trim().replace(/\s+/g, ' ') : '';

      elements.push(createRecord({
        element_category: 'heading',
        tag_name: displayChild ? displayChild.tagName.toLowerCase() : 'div',
        element_id: displayChild && displayChild.id ? displayChild.id : null,
        element_type: 'indicator',
        label_text: `Indikator ${headerText}`,
        button_text: currentVal ? currentVal.substring(0, 100) : null,
        css_selector: sel,
        form_block_name: findFormBlock(card) || headerText,
        is_visible: card.offsetParent !== null,
        state_tag: inferStateTag(card, stateTag),
        trigger_selector: triggerSelector,
        trigger_text: triggerText,
        is_readonly: 1,
      }));
    }
  });

  return elements;
}

/**
 * Universal static DOM inspection for all <div class="modal"> elements.
 * Guarantees that even if a modal was not triggered actively, its inputs, selects,
 * tables, and buttons are discovered and indexed with state_tag = 'modal'.
 */
async function extractAllDomModals(page) {
  try {
    return await page.evaluate(extractElementsInState, {
      mode: 'dormant_modals',
      iconMap: ICON_MAP,
    });
  } catch (err) {
    console.debug('[stateExplorer] extractAllDomModals note:', err.message);
    return [];
  }
}

module.exports = {
  extractElementsInState,
  extractAllDomModals,
};
