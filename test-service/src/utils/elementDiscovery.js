/**
 * elementDiscovery.js — Heuristic & Proximity-Based Element Discovery
 *
 * Berisi strategi pencarian elemen yang lebih "cerdas" ketika resolusi
 * CSS/XPath langsung tidak ditemukan:
 * - autoExpandTargetParent : buka accordion/menu yang sedang collapse
 * - findElementHeuristic   : pencarian dengan sinonim bilingual + heuristik fallback
 * - discoverByProximity    : pencarian semantik berdasarkan label/heading terdekat
 *
 * Dipecah dari locatorResolver.js (baris 271-551 & 759-842)
 */

const { autoRevealParentContainer } = require('../runner/actions/overlayHandler');
const { isSelectorString, getSynonyms } = require('./locatorHelpers');
const { isElementRealAndVisible, pickBestInteractiveCandidate } = require('./elementScorer');
const appProfile = require('./appProfile');

// ---------------------------------------------------------------------------
// ACCORDION / SIDEBAR EXPANSION
// ---------------------------------------------------------------------------

/**
 * Buka parent accordion, dropdown, atau submenu yang sedang collapse
 * agar elemen target di dalamnya bisa menjadi visible.
 *
 * Scoped hanya ke container yang berisi target yang dimaksud — tidak membuka
 * semua accordion di halaman.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} targetText
 */
async function autoExpandTargetParent(page, targetText) {
  if (!targetText) return;
  try {
    const parentContainer = page.locator(`
      :is(.nav-item, li, .dropdown, .menu-item, .sidebar-item, .accordion-item):has(:is(a, button, p, span):has-text("${targetText}"))
    `.replace(/\s+/g, ' ').trim()).first();

    if (await parentContainer.count() > 0) {
      const toggle = parentContainer.locator(':scope > a, :scope > button, :scope > .dropdown-toggle, :scope > [data-toggle="collapse"], :scope > [data-bs-toggle="collapse"], :scope > .menu-toggle').first();
      if (await toggle.count() > 0 && await toggle.isVisible().catch(() => false)) {
        await toggle.click({ force: true }).catch(() => {});
        await page.waitForTimeout(300);
      }
    }
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// HEURISTIC DISCOVERY
// ---------------------------------------------------------------------------

/**
 * Pencarian elemen cerdas dengan sinonim bilingual + banyak fallback heuristik.
 *
 * Urutan strategi:
 * 1. CSS/XPath fast path (0ms)
 * 2. Bilingual role matching (button, link, tab, menuitem)
 * 3. Form input matching (getByLabel, getByPlaceholder)
 * 4. Text matching
 * 5. Table row action (dropdown aksi, hamburger menu)
 * 6. Select All checkbox
 * 7. Search input
 * 8. Shortcut login/save/user/password
 * 9. Expand accordion dan fallback getByText
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} targetText
 * @param {number} timeout
 * @param {string} action
 * @returns {Promise<import('@playwright/test').Locator|null>}
 */
async function findElementHeuristic(page, targetText, timeout = 2500, action = '') {
  if (!targetText || typeof targetText !== 'string') return null;
  const trimmed = targetText.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();

  // ── 1. CSS/XPath Fast Path (0ms) ──────────────────────────────────────────
  if (isSelectorString(trimmed)) {
    try {
      // Ekstrak nama field bersih (e.g. "status" dari "#f_status", "select[name='status']")
      const nameMatch = trimmed.match(/(?:#|name=['"]?|id=['"]?|^)([a-zA-Z0-9_\-]+)/);
      let cleanName = nameMatch ? nameMatch[1] : '';
      cleanName = cleanName
        .replace(/^(f_|filter_|filter\-|sel_|select_)/i, '')
        .replace(/(_filter|-filter|_select|-select|_dropdown|-dropdown|_box)$/i, '');

      // Cek apakah ada Select2 atau filter visible untuk field ini
      if (cleanName) {
        const isFilterTarget = trimmed.toLowerCase().includes('filter') || trimmed.toLowerCase().includes('f_');
        const filterPattern = isFilterTarget
          ? `[id="f_${cleanName}"], [id="filter_${cleanName}"], [id="${cleanName}_filter"], [id="${cleanName}"], [id="f_${cleanName}"] + .select2-container, [id="filter_${cleanName}"] + .select2-container, select[name="${cleanName}"], select[id="${cleanName}"], [aria-labelledby*="f_${cleanName}"], [aria-labelledby*="filter_${cleanName}"], [aria-labelledby*="${cleanName}"]`
          : `.tab-pane.active [id="${cleanName}"], .tab-pane.active [id="f_${cleanName}"], [id="${cleanName}"], select[name="${cleanName}"], select[id="${cleanName}"], [aria-labelledby*="${cleanName}"], [id="f_${cleanName}"], [id="filter_${cleanName}"], [id="${cleanName}_filter"], [id="f_${cleanName}"] + .select2-container, [id="filter_${cleanName}"] + .select2-container`;

        const visibleFilter = page.locator(filterPattern.replace(/\s+/g, ' ').trim());
        const vCount = await visibleFilter.count().catch(() => 0);
        for (let vi = 0; vi < vCount; vi++) {
          const item = visibleFilter.nth(vi);
          if (await isElementRealAndVisible(item, action)) return item;
        }
      }

      const loc = page.locator(trimmed);
      if (await loc.count() > 0) {
        // Langsung visible → kembalikan
        if (await loc.first().isVisible().catch(() => false)) return loc.first();

        // Coba reveal jika di dalam tab/accordion tersembunyi
        await autoRevealParentContainer(page, loc.first(), trimmed, action);
        if (await loc.first().isVisible().catch(() => false)) return loc.first();

        // <select> yang punya Select2 sibling → kembalikan select aslinya
        const siblingSelect2 = loc.first().locator('xpath=following-sibling::*[contains(@class, "select2-container")][1]').first();
        if (await siblingSelect2.count() > 0 && await siblingSelect2.isVisible().catch(() => false)) {
          return loc.first();
        }

        // Radio/Checkbox yang disembunyikan via CSS → redirect ke <label for="id">
        const hiddenRadioOrCheckbox = await loc.first().evaluate(el => {
          const tag = el.tagName.toLowerCase();
          if (tag !== 'input') return false;
          const type = (el.type || '').toLowerCase();
          if (type !== 'radio' && type !== 'checkbox') return false;
          const style = window.getComputedStyle(el);
          const isHiddenByCSS = (
            parseFloat(style.opacity) === 0 ||
            style.pointerEvents === 'none' ||
            (parseInt(style.width) <= 1 && parseInt(style.height) <= 1) ||
            (style.position === 'absolute' && parseInt(style.width) <= 1)
          );
          return isHiddenByCSS && !!el.id;
        }).catch(() => false);

        if (hiddenRadioOrCheckbox && action === 'click') {
          const elId = await loc.first().getAttribute('id').catch(() => null);
          if (elId) {
            const labelLoc = page.locator(`label[for="${elId}"]`).first();
            if (await labelLoc.count() > 0 && await labelLoc.isVisible().catch(() => false)) {
              return labelLoc;
            }
          }
        }

        // Jika elemen ada di tab tidak aktif, coba cari alternatif di tab aktif
        const isInsideHiddenTab = await loc.first().evaluate(el => {
          const pane = el.closest('.tab-pane, [role="tabpanel"]');
          return pane && (!pane.classList.contains('active') && !pane.classList.contains('show') || window.getComputedStyle(pane).display === 'none');
        }).catch(() => false);

        if (isInsideHiddenTab && cleanName) {
          const filterVariant = page.locator(`[id="f_${cleanName}"], [id="filter_${cleanName}"], select[name="f_${cleanName}"]`);
          if (await filterVariant.count() > 0 && await filterVariant.first().isVisible().catch(() => false)) {
            return filterVariant.first();
          }
        }

        return loc.first();
      }
    } catch (e) {}
  }

  // ── 2. Bilingual Interactive Roles Matching ────────────────────────────────
  const allSynonyms = getSynonyms(trimmed);

  for (const syn of allSynonyms) {
    const escaped = syn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^\\s*${escaped}\\s*$`, 'i');
    const regexLoose = new RegExp(escaped, 'i');

    try {
      const roleMatch = page.getByRole('button', { name: regex })
        .or(page.getByRole('link', { name: regex }))
        .or(page.getByRole('tab', { name: regex }))
        .or(page.getByRole('menuitem', { name: regex }));

      if (await roleMatch.count() > 0) {
        const best = await pickBestInteractiveCandidate(roleMatch, action, trimmed);
        if (best) return best;
      }
    } catch (e) {}

    // Form input (hanya untuk aksi bukan click)
    if (action !== 'click') {
      try {
        const formInput = page.getByLabel(regexLoose)
          .or(page.getByPlaceholder(regexLoose))
          .or(page.getByRole('textbox', { name: regexLoose }))
          .or(page.getByRole('combobox', { name: regexLoose }));

        if (await formInput.count() > 0) return formInput.first();
      } catch (e) {}
    }

    // Direct text matching
    try {
      const textLoc = page.getByText(regexLoose);
      if (await textLoc.count() > 0) {
        const best = await pickBestInteractiveCandidate(textLoc, action, trimmed);
        if (best) return best;
      }
    } catch (e) {}
  }

  // ── 3. Table Row Action Dropdowns ─────────────────────────────────────────
  if (['lihat', 'view', 'detail', 'edit', 'aksi', 'action', 'opsi', 'cetak', 'hapus', 'hamburger', 'trash', 'delete', 'remove'].some(k => lower.includes(k))) {
    try {
      if (['hapus', 'delete', 'remove', 'trash', 'sampah'].some(k => lower.includes(k))) {
        const inlineDeleteSels = appProfile.get('inlineDeleteButtons', []);
        const inlineTrash = page.locator([
          ...inlineDeleteSels,
          'button:has-text("🗑️")',
          'button:has-text("🗑")',
          'button[onclick*="remove"]',
          'button[onclick*="hapus"]',
          ':is(.tab-pane.active, .tab-pane.show, form:visible) button.btn-danger'
        ].join(', ')).first();
        if ((await inlineTrash.count().catch(() => 0)) > 0 && (await isElementRealAndVisible(inlineTrash, action))) {
          return inlineTrash;
        }
      }

      const openItem = page.locator(`
        .dropdown-menu a:has-text("${trimmed}"),
        .dropdown-menu button:has-text("${trimmed}"),
        .dropdown-item:has-text("${trimmed}"),
        tbody tr a:has-text("${trimmed}"),
        tbody tr button:has-text("${trimmed}")
      `.replace(/\s+/g, ' ').trim()).first();

      if (await openItem.count() > 0) return openItem;

      // Aksi / Hamburger trigger button di baris tabel
      if (['aksi', 'action', 'opsi', 'menu', 'hamburger'].some(k => lower.includes(k))) {
        const searchFilter = page.locator('input[type="search"], .dataTables_filter input').first();
        const searchVal = ((await searchFilter.count().catch(() => 0)) > 0)
          ? (await searchFilter.inputValue().catch(() => '')).trim()
          : '';

        if (searchVal) {
          const matchedBtn = page.locator(`
            tbody tr:has-text("${searchVal}") td:first-child .dropdown-toggle,
            tbody tr:has-text("${searchVal}") td:first-child button,
            tbody tr:has-text("${searchVal}") .dropdown-toggle
          `.replace(/\s+/g, ' ').trim()).first();
          if (await matchedBtn.count() > 0 && await matchedBtn.isVisible().catch(() => false)) {
            return matchedBtn;
          }
        }

        const rowAksiBtn = page.locator(`
          tbody tr:first-child td:first-child .dropdown-toggle,
          tbody tr:first-child td:first-child button,
          tbody tr:first-child .dropdown-toggle,
          tbody tr:first-child .btn-primary,
          tbody tr:first-child td:first-child .btn,
          .dataTable tbody tr:first-child td:first-child button
        `.replace(/\s+/g, ' ').trim()).first();

        if (await rowAksiBtn.count() > 0 && await rowAksiBtn.isVisible().catch(() => false)) {
          return rowAksiBtn;
        }
      }
    } catch (e) {}
  }

  // ── 4. Select All Checkbox ─────────────────────────────────────────────────
  if (['select all', 'select_all', 'check all', 'check_all', 'chk_all', 'checkbox all', 'pilih semua', 'centang semua', 'semua spm', 'chk_all_spm'].some(k => lower.includes(k))) {
    try {
      const selectAllLoc = page.locator(`
        #chk_all_spm,
        #select_all,
        thead th input[type="checkbox"]:visible,
        table thead th:first-child input[type="checkbox"],
        .dataTable thead input[type="checkbox"]
      `.replace(/\s+/g, ' ').trim()).first();
      if (await selectAllLoc.count() > 0 && await selectAllLoc.isVisible().catch(() => false)) {
        return selectAllLoc;
      }
    } catch (e) {}
  }

  // ── 5. Search Input ────────────────────────────────────────────────────────
  // Dikecualikan untuk aksi 'select' agar tidak salah arahkan ke DataTables search
  if (action !== 'select' && (['cari', 'search', 'pencarian', 'dt-search'].some(k => lower.includes(k)) || lower === 'filter' || lower === 'cari')) {
    try {
      const searchInput = page.locator('input[type="search"]:visible, .dataTables_filter input:visible, .filter-box input[type="search"]:visible, input[placeholder*="cari" i]:visible, input[placeholder*="search" i]:visible').first();
      if (await searchInput.count() > 0) return searchInput;
    } catch (e) {}
  }

  // ── 6. Shortcut untuk tombol Login / Simpan ────────────────────────────────
  if (lower.includes('login') || lower.includes('masuk') || lower.includes('sign in')) {
    try {
      const loginFormSel = appProfile.get('loginForm');
      const loginBtn = page.locator(`${loginFormSel ? loginFormSel + ' button[type="submit"], ' : ''}button:has-text("Masuk"), button:has-text("Login"), input[type="submit"]`).first();
      if (await loginBtn.count() > 0 && await loginBtn.isVisible().catch(() => false)) return loginBtn;
    } catch (e) {}
  } else if (lower.includes('simpan') || lower.includes('save') || lower.includes('submit')) {
    try {
      const saveBtn = page.locator('button:has-text("Simpan"), a.btn:has-text("Simpan"), button[type="submit"]:has-text("Simpan"), button:has-text("Save"), input[type="submit"][value*="Simpan" i], button.btn-primary:has-text("Simpan"), .btn:has-text("Simpan")').first();
      if (await saveBtn.count() > 0 && await saveBtn.isVisible().catch(() => false)) return saveBtn;
    } catch (e) {}
  }

  // ── 7. Shortcut field Username / Password ──────────────────────────────────
  if (lower.includes('user') || lower.includes('email') || lower.includes('identity')) {
    try {
      const userField = page.locator('input[name="username"], input[name="email"], input[name="identity"], input[name="user"], #username, #email').first();
      if (await userField.count() > 0) return userField;
    } catch (e) {}
  }

  if (lower.includes('password') || lower.includes('pass') || lower.includes('sandi')) {
    try {
      const passField = page.locator('input[type="password"], input[name*="pass" i], #password').first();
      if (await passField.count() > 0) return passField;
    } catch (e) {}
  }

  // ── 8. Last Resort: expand accordion lalu fallback ke getByText ────────────
  await autoExpandTargetParent(page, trimmed);
  return page.getByText(trimmed).first();
}

// ---------------------------------------------------------------------------
// PROXIMITY DISCOVERY
// ---------------------------------------------------------------------------

/**
 * Temukan elemen form berdasarkan label / heading terdekat di DOM.
 * Berguna untuk input tanpa atribut 'for', 'id', 'name', atau 'placeholder'
 * yang jelas — dicari dari teks label/heading yang ada di sekitarnya.
 *
 * Contoh: label "Customer" → temukan <select> atau <input> di sebelahnya.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} targetText
 * @param {string} action
 * @returns {Promise<import('@playwright/test').Locator|null>}
 */
async function discoverByProximity(page, targetText, action = '') {
  if (!targetText || typeof targetText !== 'string') return null;
  const rawClean = targetText
    .replace(/^[#\.\s]+/, '')
    .replace(/^select\[name=['"]?/, '')
    .replace(/['"]?\]$/, '')
    .replace(/^(f_|filter_|filter\-|sel_|select_)/i, '')
    .replace(/(_filter|-filter|_select|-select|_dropdown|-dropdown|_box)$/i, '')
    .replace(/[_\-]/g, ' ')
    .trim();
  if (!rawClean) return null;

  const synonyms = getSynonyms(rawClean);

  for (const syn of synonyms) {
    try {
      // ── 1. Label/Heading Scoped Proximity ───────────────────────────────────
      const matchingLabels = page.locator(`:is(label, th, span, strong, b, p):has-text("${syn}")`);
      const lblCount = await matchingLabels.count().catch(() => 0);

      for (let li = 0; li < Math.min(lblCount, 6); li++) {
        const lbl = matchingLabels.nth(li);
        if (!(await lbl.isVisible().catch(() => false))) continue;

        // Lewati elemen di dalam tab panel yang tidak aktif
        const isHiddenTab = await lbl.evaluate(el => {
          const pane = el.closest('.tab-pane, [role="tabpanel"]');
          return pane && (!pane.classList.contains('active') && !pane.classList.contains('show') || window.getComputedStyle(pane).display === 'none');
        }).catch(() => false);
        if (isHiddenTab) continue;

        if (action === 'select' || action === 'search') {
          const selCandidate = lbl.locator('xpath=following-sibling::*[self::select or contains(@class, "select2") or .//select][1] | xpath=..//select | xpath=..//*[contains(@class, "select2-selection")]').first();
          if ((await selCandidate.count().catch(() => 0)) > 0) return selCandidate;
        } else if (action === 'fill' || action === 'type') {
          const inputCandidate = lbl.locator('xpath=following-sibling::*[self::input or self::textarea or .//input or .//textarea][1] | xpath=..//input[not(@type="hidden") and not(@type="submit") and not(@type="button") and not(@type="checkbox") and not(@type="radio")] | xpath=..//textarea').first();
          if ((await inputCandidate.count().catch(() => 0)) > 0 && (await inputCandidate.isVisible().catch(() => false))) {
            return inputCandidate;
          }
        } else if (action === 'click') {
          const clickCandidate = lbl.locator('xpath=following-sibling::*[self::button or self::a or .//button or .//a][1] | xpath=..//button | xpath=..//a | xpath=..//input[@type="checkbox" or @type="radio"]').first();
          if ((await clickCandidate.count().catch(() => 0)) > 0 && (await clickCandidate.isVisible().catch(() => false))) {
            return clickCandidate;
          }
        }
      }

      // ── 2. Direct Sibling Proximity ─────────────────────────────────────────
      if (action === 'select' || action === 'search') {
        const siblingSelect = page.locator(`
          :is(label, span, strong, b):has-text("${syn}") ~ :is(select, .select2-container, div select, div .select2-container)
        `.replace(/\s+/g, ' ').trim()).first();

        if ((await siblingSelect.count().catch(() => 0)) > 0) return siblingSelect;
      } else if (action === 'fill' || action === 'type') {
        const siblingInput = page.locator(`
          :is(label, span, strong, b):has-text("${syn}") ~ :is(input:not([type="hidden"]), textarea, div input:not([type="hidden"]))
        `.replace(/\s+/g, ' ').trim()).first();

        if ((await siblingInput.count().catch(() => 0)) > 0 && (await siblingInput.isVisible().catch(() => false))) {
          return siblingInput;
        }
      }
    } catch (e) {}
  }

  return null;
}

module.exports = {
  autoExpandTargetParent,
  findElementHeuristic,
  discoverByProximity,
};
