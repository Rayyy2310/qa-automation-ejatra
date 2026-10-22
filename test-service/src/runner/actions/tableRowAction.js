/**
 * tableRowAction.js — 2-Step Compound Row Action Handler for DataTables
 * Handles hamburger menu trigger + menu item click for table row operations.
 */

const { resolveUrl } = require('../../utils/urlHelper');
const { TIMEOUTS } = require('../../utils/constants');
const appProfile = require('../../utils/appProfile');

// ---------------------------------------------------------------------------
// DEFINISI AKSI (dibaca dari konfigurasi app-profile.json)
// ---------------------------------------------------------------------------

const ROW_ACTION_DEFS = appProfile.get('rowActionDefs', {});

// ---------------------------------------------------------------------------
// GENERATE SELECTOR DARI DEFINISI (menggantikan array hardcoded)
// ---------------------------------------------------------------------------

const BASE = '.dropdown-menu.show';

/**
 * Buat selector CSS Playwright dari satu definisi aksi.
 * Menghasilkan string yang setara dengan array hardcoded sebelumnya.
 *
 * @param {Object} def - Satu entry dari ROW_ACTION_DEFS
 * @returns {string} CSS selector
 */
function buildRowMenuSelector(def) {
  const parts = [];
  const excl = def.exclude ? `:not(:has-text("${def.exclude}"))` : '';

  // Selector berdasarkan CSS class utama
  if (def.cssClass) {
    parts.push(`${BASE} a.${def.cssClass}`);
    parts.push(`${BASE} button.${def.cssClass}`);
  }

  // Ambil daftar teks label dari labels atau keywords
  const labelList = def.labels || def.keywords || [];

  // Selector berdasarkan class tambahan
  if (def.extraClass) {
    for (const cls of def.extraClass) {
      if (labelList.length > 0) {
        parts.push(`${BASE} a.${cls}:has-text("${labelList[0]}")`);
      } else {
        parts.push(`${BASE} a.${cls}`);
      }
    }
  }

  // Selector berdasarkan teks label (mencakup a, button, dropdown-item)
  if (labelList.length > 0) {
    for (const label of labelList) {
      parts.push(`${BASE} a:has-text("${label}")${excl}`);
      parts.push(`${BASE} button:has-text("${label}")${excl}`);
      parts.push(`${BASE} .dropdown-item:has-text("${label}")${excl}`);
    }
  }

  // Selector berdasarkan href
  if (def.hrefs) {
    for (const href of def.hrefs) {
      parts.push(`${BASE} a[href*="${href}"]`);
    }
  }

  return parts.join(', ');
}

/**
 * ROW_MENU_SELECTORS — dihasilkan secara otomatis dari ROW_ACTION_DEFS.
 * Menggantikan array hardcoded sebelumnya. Fungsi yang mengonsumsinya
 * (clickRowMenuItem) tidak perlu diubah sama sekali.
 */
const ROW_MENU_SELECTORS = Object.fromEntries(
  Object.entries(ROW_ACTION_DEFS).map(([key, def]) => [key, buildRowMenuSelector(def)])
);

/**
 * ROW_INTENT_SELECTORS — selector jQuery untuk bridge event-delegation.
 * Dihasilkan dari definisi — menggantikan objek hardcoded sebelumnya.
 */
const ROW_INTENT_SELECTORS = Object.fromEntries(
  Object.entries(ROW_ACTION_DEFS).map(([key, def]) => [key, def.jqSel || ''])
);

/**
 * ROW_INTENT_TEXTS — array teks kecil untuk jQuery text match.
 * Mendukung def.keywords, def.texts, maupun def.labels.
 */
const ROW_INTENT_TEXTS = Object.fromEntries(
  Object.entries(ROW_ACTION_DEFS).map(([key, def]) => [
    key,
    (def.keywords || def.texts || def.labels || [key]).map(k => String(k).toLowerCase().trim())
  ])
);


// ---------------------------------------------------------------------------
// HAMBURGER TRIGGER SELECTORS (tidak berubah)
// ---------------------------------------------------------------------------

/**
 * Hamburger trigger selectors for table row action column.
 */
const ROW_TRIGGER_SELECTORS = [
  ...appProfile.get('rowTriggerSelectors', []),
  '.dataTable tbody tr:first-child td:first-child .dropdown-toggle',
  'table.dataTable tbody tr:first-child td:first-child .dropdown-toggle',
  'table.table-striped tbody tr:first-child td:first-child .dropdown-toggle',
  'tbody tr:first-child td:first-child button.dropdown-toggle',
  'tbody tr:first-child td:first-child button:has(.fa-bars)',
  'tbody tr:first-child td:first-child button',
  'tbody tr:first-child td:first-child [data-bs-toggle="dropdown"]',
  'tbody tr:first-child td:first-child [data-toggle="dropdown"]',
  'tbody tr:first-child td:first-child i.fa-bars',
  'tbody tr:first-child .dropdown-toggle'
].join(', ');

// ---------------------------------------------------------------------------
// DETECT INTENT (tidak berubah)
// ---------------------------------------------------------------------------

/**
 * Detect the user's intent for a table row action from target/value strings.
 * @param {string} targetStr - Lowercased target string
 * @param {string} valStr - Lowercased value string
 * @returns {string} One of: 'edit', 'cetak', 'aktifkan', 'batalkan', 'hapus', 'view', 'ubah_harga', 'open_menu_only'
 */
function detectRowIntent(targetStr, valStr) {
  const tLower = String(targetStr || '').toLowerCase();
  const vLower = String(valStr || '').toLowerCase();

  // Check if intent is ONLY opening the hamburger menu itself without clicking sub-items
  const isOnlyHamburger = ['hamburger', 'tombol hamburger', 'menu hamburger', 'tombol aksi', 'buka hamburger', 'buka aksi', 'dropdown-toggle', 'fa-bars'].some(k => tLower.includes(k) || vLower.includes(k));
  const hasSubAction = ['edit', 'ubah', 'cetak', 'print', 'close', 'tutup', 'aktifkan', 'batalkan', 'batal', 'hapus', 'delete', 'view', 'lihat', 'detail', 'harga'].some(k => tLower.includes(k) || vLower.includes(k));
  if (isOnlyHamburger && !hasSubAction) {
    return 'open_menu_only';
  }

  // Priority 1: Multi-word compound intents (e.g. ubah harga)
  const isUbahHarga = ['ubah harga', 'ubah_harga', 'edit harga', 'ganti harga'].some(k => tLower.includes(k) || vLower.includes(k));
  if (isUbahHarga) {
    return 'ubah_harga';
  }

  // Priority 2: Negative/destructive actions that contain substrings of other actions
  // (e.g. 'nonaktifkan' / 'batalkan' contains 'aktif', 'deactivate' contains 'activate')
  if (tLower.includes('batalkan') || tLower.includes('nonaktifkan') || tLower.includes('deactivate') || (tLower.includes('batal') && !tLower.includes('modal'))) {
    return 'batalkan';
  }

  // Priority 3: Dynamic lookup across all configured actions in ROW_ACTION_DEFS
  for (const [key, def] of Object.entries(ROW_ACTION_DEFS)) {
    if (key === 'view' || key === 'ubah_harga' || key === 'batalkan') continue;
    const keywords = (def.keywords || def.labels || [key]).map(k => String(k).toLowerCase());
    if (keywords.some(k => tLower.includes(k) || vLower.includes(k))) {
      return key;
    }
  }

  // Priority 4: 'view' / detail hanya dikembalikan bila memang diminta eksplisit
  const viewDef = ROW_ACTION_DEFS.view || {};
  const viewKeywords = (viewDef.keywords || viewDef.labels || ['view', 'lihat', 'detail']).map(k => String(k).toLowerCase());
  if (viewKeywords.some(k => tLower.includes(k) || vLower.includes(k))) {
    return 'view';
  }

  // Priority 5: Dynamic Intent Extraction from :has-text() or raw text
  // Mendukung aksi baris dinamis seperti 'Pecah SPB', 'Realisasi SPB', dll. tanpa hardcode
  // PENTING: Jika target mengandung tr:has-text('...'), JANGAN ambil nomor/teks baris tabel sebagai intent!
  // Ambil teks :has-text() yang terikat pada menu item dropdown
  const dropdownMatch = tLower.match(/\.dropdown-(?:menu|item)[^:]*:has-text\(['"]([^'"]+)['"]\)/i)
                     || tLower.match(/:is\([^)]*\):has-text\(['"]([^'"]+)['"]\)/i)
                     || tLower.match(/(?:\.dropdown-menu|\.dropdown-item|\.show|button|a)\s*:has-text\(['"]([^'"]+)['"]\)/i);
  if (dropdownMatch && dropdownMatch[1]) {
    return dropdownMatch[1].trim();
  }

  // Fallback jika ada multiple :has-text, abaikan yang berada di dalam tr:has-text
  const trMatch = tLower.match(/tr:has-text\(['"]([^'"]+)['"]\)/i);
  const trVal = trMatch ? trMatch[1].toLowerCase().trim() : '';
  const allMatches = [...tLower.matchAll(/:has-text\(['"]([^'"]+)['"]\)/gi)];
  for (const m of allMatches) {
    const val = m[1].toLowerCase().trim();
    if (val !== trVal && val.length >= 2) {
      return m[1].trim();
    }
  }

  // Jika targetStr bukan selector teknis murni (tidak diawali #, ., [) dan memiliki panjang memadai
  if (!tLower.startsWith('#') && !tLower.startsWith('.') && !tLower.startsWith('[') && !tLower.includes('=')) {
    const cleanIntent = tLower.replace(/^[#\.\s]+/, '').trim();
    if (cleanIntent.length >= 2) {
      return cleanIntent;
    }
  }

  // Aksi tidak dikenal: JANGAN menebak 'view'
  return null;
}




// ---------------------------------------------------------------------------
// OPEN HAMBURGER MENU
// ---------------------------------------------------------------------------

/**
 * Open the hamburger dropdown menu on the matching table row.
 * Prioritizes:
 * 1. Specific row query if passed (e.g. from tr:has-text or document number)
 * 2. Active search filter query in the table filter
 * 3. First row fallback
 * @param {import('playwright').Page} page
 * @param {string} [rowQuery='']
 */
async function openHamburgerMenu(page, rowQuery = '') {
  // If a dropdown menu is already open, verify whether it belongs to the target row
  const portalMenuSel = appProfile.get('portalMenuSelector', '.dropdown-menu.show, [class*="portal-fix"].show');
  const openMenu = page.locator(portalMenuSel).first();
  const isMenuOpen = (await openMenu.count().catch(() => 0)) > 0 &&
                     (await openMenu.isVisible().catch(() => false));

  if (isMenuOpen) {
    if (rowQuery) {
      const cleanKey = rowQuery.replace(/^[#\.\s]+/, '').trim();
      const isCorrectRow = await page.evaluate(({ key, pSel }) => {
        const $ = window.jQuery;
        const $menu = $(pSel).first();
        if (!$menu.length) return false;
        let $row = $menu.closest('tr');
        if ((!$row || !$row.length) && $) {
          const $parentDropdown = $menu.data('dpParentDropdown');
          if ($parentDropdown && $parentDropdown.length) {
            $row = $parentDropdown.closest('tr');
          }
        }
        return Boolean($row && $row.length > 0 && $row.text().includes(key));
      }, { key: cleanKey, pSel: portalMenuSel }).catch(() => false);

      if (isCorrectRow) {
        return; // Menu untuk baris yang diminta sudah terbuka
      }

      // Menu yang sedang terbuka adalah milik baris lain — tutup terlebih dahulu
      await page.keyboard.press('Escape').catch(() => {});
      await page.evaluate((pSel) => {
        const $ = window.jQuery;
        if ($) {
          $(pSel).removeClass('show').hide();
        }
      }, portalMenuSel).catch(() => {});
      await page.waitForTimeout(200);
    } else {
      return; // Tidak ada rowQuery spesifik dan menu sudah terbuka
    }
  }

  // 1. If table is currently processing / filtering, wait for it to settle
  const processing = page.locator('.dataTables_processing');
  if ((await processing.count().catch(() => 0)) > 0) {
    await processing.first().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }

  let rowTrigger = null;

  // 2. Specific rowQuery provided (from tr:has-text or document number)
  if (rowQuery) {
    const cleanKey = rowQuery.replace(/^[#\.\s]+/, '').trim();
    const specificRow = page.locator(`tbody tr:has-text("${cleanKey}")`).first();
    if ((await specificRow.count().catch(() => 0)) > 0 && (await specificRow.isVisible().catch(() => false))) {
      const specificTrigger = specificRow.locator(
        'td:first-child .dropdown-toggle, ' +
        'td:first-child button, ' +
        '.dropdown-toggle, ' +
        'button:has(.fa-bars), ' +
        'button[data-bs-toggle="dropdown"], ' +
        'button[data-toggle="dropdown"], ' +
        '[data-bs-toggle="dropdown"], ' +
        '[data-toggle="dropdown"], ' +
        'i.fa-bars'
      ).first();

      if ((await specificTrigger.count().catch(() => 0)) > 0 && (await specificTrigger.isVisible().catch(() => false))) {
        rowTrigger = specificTrigger;
      }
    }
  }

  // 3. Check if the table has an active search filter query
  if (!rowTrigger) {
    const searchFilter = page.locator('input[type="search"], .dataTables_filter input').first();
    const searchVal = ((await searchFilter.count().catch(() => 0)) > 0)
      ? (await searchFilter.inputValue().catch(() => '')).trim()
      : '';

    if (searchVal) {
      await page.waitForTimeout(600);
      const matchedRow = page.locator(`tbody tr:has-text("${searchVal}")`).first();
      if ((await matchedRow.count().catch(() => 0)) > 0 && (await matchedRow.isVisible().catch(() => false))) {
        const matchedRowTrigger = matchedRow.locator(
          'td:first-child .dropdown-toggle, ' +
          'td:first-child button, ' +
          '.dropdown-toggle, ' +
          'button:has(.fa-bars), ' +
          '[data-bs-toggle="dropdown"], ' +
          '[data-toggle="dropdown"]'
        ).first();

        if ((await matchedRowTrigger.count().catch(() => 0)) > 0 && (await matchedRowTrigger.isVisible().catch(() => false))) {
          rowTrigger = matchedRowTrigger;
        }
      }
    }
  }

  // 4. Fallback to first row trigger
  if (!rowTrigger) {
    rowTrigger = page.locator(ROW_TRIGGER_SELECTORS).first();
  }

  if ((await rowTrigger.count().catch(() => 0)) > 0 && (await rowTrigger.isVisible().catch(() => false))) {
    await rowTrigger.scrollIntoViewIfNeeded().catch(() => {});
    await rowTrigger.click({ force: true }).catch(() => {});
    await page.locator('.dropdown-menu.show').first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// CLICK ROW MENU ITEM
// ---------------------------------------------------------------------------

/**
 * Click the appropriate menu item based on intent.
 * Handles portal dropdown menus (e.g. dropdown-portal-fix.js) by restoring menu hierarchy
 * so that table-level delegated event listeners (e.g. $tbl.on('click', '.btn-edit')) fire reliably.
 * @param {import('playwright').Page} page
 * @param {string} intent - One of the ROW_ACTION_DEFS keys
 * @returns {{ menuItem: import('playwright').Locator|null, href: string|null }}
 */
async function clickRowMenuItem(page, intent) {
  // PENTING: JANGAN PERNAH fallback ke .view bila intent bukan view!
  // Fallback ke .view sebelumnya menyebabkan aksi aktifkan/batalkan salah mengklik "View Data".
  const selector = ROW_MENU_SELECTORS[intent] || null;
  const jqSelector = ROW_INTENT_SELECTORS[intent] || null;
  const textKeywords = ROW_INTENT_TEXTS[intent] || [intent];

  // 1. Resilient event-delegation bridge for portal fix menus
  const portalMenuSel = appProfile.get('portalMenuSelector', '.dropdown-menu.show, [class*="portal-fix"].show');
  const bridgedResult = await page.evaluate(({ jqSel, textList, pSel }) => {
    const $ = window.jQuery;
    if ($) {
      const $menu = $(pSel).first();
      if ($menu.length) {
        const $dropdown = $menu.data('dpParentDropdown');
        // If menu was teleported to <body>, put it back into the table cell so delegated click events bubble through the table
        if ($dropdown && $dropdown.length && $menu.parent()[0] !== $dropdown[0]) {
          $menu.appendTo($dropdown);
        }

        // Fast check by CSS class/attribute — strictly scoped inside the open $menu!
        if (jqSel) {
          const $item = $menu.find(jqSel);
          if ($item.length) {
            const hrefVal = $item.first().attr('href') || null;
            const domEl = $item[0];
            $item.first().trigger('click');
            if (domEl && typeof domEl.click === 'function') {
              domEl.click();
            }
            return { clicked: true, href: hrefVal };
          }
        }

        // Semantic text match check — strictly scoped inside the open $menu!
        if (Array.isArray(textList) && textList.length > 0) {
          const $items = $menu.find('a, button, .dropdown-item');
          for (let i = 0; i < $items.length; i++) {
            const txt = $($items[i]).text().toLowerCase().trim();
            if (textList.some(k => txt.includes(k))) {
              const hrefVal = $($items[i]).attr('href') || null;
              const domEl = $items[i];
              $($items[i]).trigger('click');
              if (domEl && typeof domEl.click === 'function') {
                domEl.click();
              }
              return { clicked: true, href: hrefVal };
            }
          }
        }
      }
    }
    return { clicked: false, href: null };
  }, { jqSel: jqSelector, textList: textKeywords, pSel: portalMenuSel }).catch(() => ({ clicked: false, href: null }));

  if (bridgedResult.clicked) {
    await page.waitForTimeout(800);
    return {
      menuItem: selector ? page.locator(selector).first() : null,
      href: bridgedResult.href,
      clicked: true
    };
  }

  // 2. Standard Playwright click fallback (scoped to .dropdown-menu.show)
  const effectiveSelector = selector || `.dropdown-menu.show a:has-text("${intent}"), .dropdown-menu.show button:has-text("${intent}"), .dropdown-menu.show .dropdown-item:has-text("${intent}")`;
  const targetMenuItem = page.locator(effectiveSelector).first();
  if ((await targetMenuItem.count().catch(() => 0)) > 0 && (await targetMenuItem.isVisible().catch(() => false))) {
    const href = await targetMenuItem.getAttribute('href').catch(() => null);
    await targetMenuItem.click({ force: true }).catch(() => {});
    await page.waitForTimeout(800);
    return { menuItem: targetMenuItem, href, clicked: true };
  }

  return { menuItem: null, href: null, clicked: false };
}


// ---------------------------------------------------------------------------
// POST-CLICK HANDLER (tidak berubah)
// ---------------------------------------------------------------------------

/**
 * Handle post-click behavior for each intent type.
 * @param {import('playwright').Page} page
 * @param {string} intent
 * @param {string} baseUrl
 * @param {{ menuItem: import('playwright').Locator|null, href: string|null }} clickResult
 */
async function handlePostRowClick(page, intent, baseUrl, clickResult) {
  const { href } = clickResult;
  const initialPageUrl = page.url();

  if (intent === 'ubah_harga') {
    await page.waitForTimeout(500);
    const modalLoc = page.locator('.modal.show, #modal_ubah_harga, #modal_harga, .modal:visible').first();
    await modalLoc.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(400);
    return;
  }

  if (intent === 'edit') {
    // 1. Check if navigation required via href
    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      if (page.url() === initialPageUrl) {
        const editDest = resolveUrl(baseUrl, href);
        await page.goto(editDest, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.NAVIGATION }).catch(() => {});
      }
    }

    // 2. Allow edit click event to initiate AJAX request
    await page.waitForTimeout(600);

    // 3. Wait for complete data hydration (including all dependent dropdowns)
    const hydrationInputs = appProfile.get('formHydrationInputs', ['input[name*="harga"]', 'input[name*="volume"]', 'input[name*="no"]']);
    await page.waitForFunction((inputSels) => {
      const jActive = typeof window.jQuery !== 'undefined' ? window.jQuery.active : 0;
      let hasHydratedDetail = false;
      for (const sel of inputSels) {
        const el = document.querySelector(sel);
        if (el && el.value && el.value.trim() !== '' && el.value.trim() !== '0') {
          hasHydratedDetail = true;
          break;
        }
      }
      return jActive === 0 && hasHydratedDetail;
    }, hydrationInputs, { timeout: 15000 }).catch(() => {});

    // 4. Ensure form tab is active
    const formTabSel = appProfile.get('formTabAll', 'a[href*="form" i], button[data-bs-target*="form" i]');
    await page.evaluate((tSel) => {
      const formTab = document.querySelector(tSel);
      if (window.bootstrap?.Tab && formTab) {
        new bootstrap.Tab(formTab).show();
      }
    }, formTabSel).catch(() => {});

    // 5. Safety cushion to allow final UI render updates to settle
    await page.waitForTimeout(800);
    return;
  }

  if (intent === 'aktifkan' || intent === 'close' || intent === 'batalkan' || intent === 'hapus') {
    // Handle SweetAlert confirmation popup
    await page.waitForTimeout(500);
    const confirmBtn = page.locator(`
      .swal2-confirm, 
      .swal2-actions button.swal2-confirm,
      button:has-text("Ya, Lanjutkan"),
      button:has-text("Ya, Simpan"),
      button:has-text("Ya, Hapus"),
      button:has-text("Ya, Batalkan"),
      button:has-text("Ya, Aktifkan"),
      button:has-text("Ya, Tutup"),
      button:has-text("Ya"),
      button:has-text("OK")
    `.replace(/\s+/g, ' ').trim()).first();

    // Listen for the AJAX response of toggle-status or batal
    const statusResponsePromise = page.waitForResponse(
      res => res.request().method() === 'POST' && (res.url().includes('toggle-status') || res.url().includes('batal')),
      { timeout: 8000 }
    ).catch(() => null);

    if ((await confirmBtn.count().catch(() => 0)) > 0 && (await confirmBtn.isVisible().catch(() => false))) {
      await confirmBtn.click({ force: true }).catch(() => {});
      const statusRes = await statusResponsePromise;
      if (statusRes) {
        try {
          const body = await statusRes.json().catch(() => null);
          if (body) {
            page.__lastSaveMessage = body.message || (body.success ? 'Sukses' : 'Info');
            if (body.success) page.__lastSaveSuccess = true;
          }
        } catch (e) {}
      }
      await page.waitForTimeout(TIMEOUTS.MEDIUM);
    }
    return;
  }

  if (intent === 'cetak') {
    await page.waitForTimeout(1000);
    const pages = page.context().pages();
    if (pages.length > 1) {
      const latest = pages[pages.length - 1];
      await latest.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
      await latest.bringToFront().catch(() => {});
    } else if (clickResult.href && !clickResult.href.startsWith('#') && !clickResult.href.startsWith('javascript:')) {
      // Fallback non-hardcode: jika browser popup blocker menghalangi spawn tab baru, buka tab baru secara eksplisit ke URL target
      const printUrl = resolveUrl(baseUrl, clickResult.href);
      const newTab = await page.context().newPage();
      await newTab.goto(printUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      await newTab.bringToFront().catch(() => {});
    }
    return;
  }

  // View Data / Detail — can be modal popup (PO Aspal) OR Form Tab transition (Kontrak, SPM, Pengiriman)
  await page.waitForTimeout(600);

  // 1. Wait for AJAX requests to finish
  await page.waitForFunction(() => {
    return typeof window.jQuery === 'undefined' || window.jQuery.active === 0;
  }, { timeout: 8000 }).catch(() => {});

  // 2. Check if a modal opened OR if Form Tab is active
  const modalLoc = page.locator('.modal.show, [role="dialog"]:visible, div[id*="modal" i]:visible').first();
  const formTabLoc = page.locator(appProfile.get('formTabPane', '.tab-pane[id*="form" i].active')).first();

  await Promise.race([
    modalLoc.waitFor({ state: 'visible', timeout: 3000 }),
    formTabLoc.waitFor({ state: 'visible', timeout: 3000 })
  ]).catch(() => {});

  // 3. Ensure form tab is active if framework tab switch lagged
  const formTabConfig = {
    formTab: appProfile.get('formTabAll', 'a[href*="form" i]'),
    formPane: appProfile.get('formPaneAll', '.tab-pane[id*="form" i]'),
    tablePane: appProfile.get('tablePaneAll', '.tab-pane[id*="tab" i]:not([id*="form" i])'),
    tableTab: appProfile.get('tableTabAll', 'a[href*="tabTable" i]'),
    portalSel: appProfile.get('portalMenuSelector', '.dropdown-menu.show, [class*="portal-fix"].show')
  };
  await page.evaluate((cfg) => {
    const formTab = document.querySelector(cfg.formTab);
    if (window.bootstrap?.Tab && formTab) {
      try { new bootstrap.Tab(formTab).show(); } catch (e) {}
    } else {
      const formPane = document.querySelector(cfg.formPane);
      const tablePane = document.querySelector(cfg.tablePane);
      const tableTab = document.querySelector(cfg.tableTab);
      if (tablePane) tablePane.classList.remove('active', 'show');
      if (formPane) formPane.classList.add('active', 'show');
      if (formTab) formTab.classList.add('active');
      if (tableTab) tableTab.classList.remove('active');
    }

    // Clean up any lingering dropdown menu portal element
    const $ = window.jQuery;
    if ($) {
      $(cfg.portalSel).removeClass('show').hide();
    }
  }, formTabConfig).catch(() => {});

  await page.waitForTimeout(400);
}

// ---------------------------------------------------------------------------
// EXECUTE TABLE ROW ACTION — Entry Point (tidak berubah)
// ---------------------------------------------------------------------------

/**
 * Execute the full 2-step compound table row action.
 * @param {object} params
 * @param {import('playwright').Page} params.page
 * @param {object} params.step
 * @param {string} params.baseUrl
 * @param {string} params.targetStr - Lowercased target string
 * @param {string} params.valStr - Lowercased value string
 * @param {string} [params.rowQuery=''] - Optional specific row text from tr:has-text or doc number
 * @returns {Promise<boolean>} true if action was handled
 */
async function executeTableRowAction({ page, step, baseUrl, targetStr, valStr, rowQuery = '' }) {
  const intent = detectRowIntent(targetStr, valStr);

  // Aksi tidak dikenal: jangan membuka hamburger / menebak 'view'. Kembalikan false agar
  // clickAction melanjutkan resolusi klik biasa (dan gagal dengan pesan jelas bila tidak ketemu).
  if (!intent) {
    console.warn(`[tableRowAction] Aksi baris tidak dikenal untuk target="${targetStr}" value="${valStr}" — tidak ada tebakan 'view'.`);
    return false;
  }

  // Step 1: Open hamburger menu (with specific row targeting if available)
  await openHamburgerMenu(page, rowQuery);


  // If intent was only to open the hamburger menu
  if (intent === 'open_menu_only') {
    await page.waitForTimeout(400);
    return true;
  }

  // Step 2: Click the target menu item
  const clickResult = await clickRowMenuItem(page, intent);

  if (clickResult.menuItem || clickResult.clicked) {
    // Step 3: Post-click handling
    await handlePostRowClick(page, intent, baseUrl, clickResult);
    return true;
  }


  if (rowQuery) {
    throw new Error(`ROW_ACTION_NOT_FOUND: Opsi menu aksi "${intent}" tidak ditemukan di dalam dropdown baris tabel.`);
  }

  // Jika tidak ada rowQuery spesifik dan dropdown tidak memiliki opsi ini,
  // kembalikan false agar clickAction melanjutkan pencarian sebagai tombol biasa di halaman/form.
  return false;
}


module.exports = {
  executeTableRowAction,
  detectRowIntent,
};
