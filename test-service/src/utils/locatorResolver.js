/**
 * locatorResolver.js — Universal Locator Resolution Engine (Entry Point)
 *
 * File ini adalah titik masuk utama yang digunakan oleh stepExecutor.js dan
 * module lainnya. Semua fungsi yang sebelumnya ada di file ini tetap tersedia
 * melalui export yang sama persis — tidak ada breaking change.
 *
 * Arsitektur setelah refactoring:
 * ┌─────────────────────────────────────────────────────┐
 * │  locatorResolver.js  ← Entry point (file ini)       │
 * │    ├── locatorHelpers.js   → isSelectorString,       │
 * │    │                          normalizeText,          │
 * │    │                          stripActionFluff,       │
 * │    │                          getSynonyms,            │
 * │    │                          matchesKeywords,        │
 * │    │                          MODAL_CONTAINER_SELECTOR│
 * │    ├── elementScorer.js    → isElementRealAndVisible, │
 * │    │                          pickBestInteractiveCandidate│
 * │    └── elementDiscovery.js → autoExpandTargetParent, │
 * │                               findElementHeuristic,  │
 * │                               discoverByProximity    │
 * └─────────────────────────────────────────────────────┘
 *
 * File locatorResolver.js sendiri mengandung:
 * - resolveLocator            : mengubah target (string/object) → Playwright Locator
 * - resolveLocatorWithFallback: entry point utama dengan 8 strategi fallback bertingkat
 * - Re-export semua fungsi dari sub-module agar backward compatible
 */

// ---------------------------------------------------------------------------
// IMPORT DARI SUB-MODULE
// ---------------------------------------------------------------------------

const ENTERPRISE_FIELD_ALIASES = require('../config/field-aliases.json');
const appProfile = require('./appProfile');

const {
  MODAL_CONTAINER_SELECTOR,
  isSelectorString,
  normalizeText,
  stripActionFluff,
  getSynonyms,
  matchesKeywords,
} = require('./locatorHelpers');

const {
  isElementRealAndVisible,
  pickBestInteractiveCandidate,
} = require('./elementScorer');

const {
  autoExpandTargetParent,
  findElementHeuristic,
  discoverByProximity,
} = require('./elementDiscovery');

// ---------------------------------------------------------------------------
// RESOLVE LOCATOR — Konversi target ke Playwright Locator
// ---------------------------------------------------------------------------

/**
 * Konversi target (string natural atau object {strategy, value}) menjadi
 * Playwright Locator secara sinkron. Tidak melakukan await / browser call.
 *
 * Untuk string:
 * - Jika terdeteksi sebagai CSS/XPath → page.locator(target)
 * - Untuk aksi 'click' → buat multi-candidate button/link locator
 * - Default → page.getByText(clean)
 *
 * Untuk object {strategy, value}:
 * - Mendukung strategy: css, role, label, placeholder, text, xpath, id, name
 *
 * @param {import('@playwright/test').Page|import('@playwright/test').Locator} page
 * @param {string|Object} target
 * @param {string} action
 * @returns {import('@playwright/test').Locator|null}
 */
function resolveLocator(page, target, action = '') {
  if (!target) return null;

  if (typeof target === 'string') {
    const trimmed = target.trim();
    if (isSelectorString(trimmed)) {
      return page.locator(trimmed);
    }
    const clean = stripActionFluff(trimmed);
    if (action === 'click') {
      const candidates = [
        `button:has-text("${clean}")`,
        `a.btn:has-text("${clean}")`,
        `a:has-text("${clean}")`,
        `input[type="submit"][value*="${clean}" i]`,
        `input[type="button"][value*="${clean}" i]`,
        `.btn:has-text("${clean}")`,
        `[role="button"]:has-text("${clean}")`,
        `label:has-text("${clean}")`,
        `label[class*="card"]:has-text("${clean}")`
      ];
      // Sertakan juga versi original (sebelum strip) jika berbeda
      if (clean !== trimmed) {
        candidates.push(
          `button:has-text("${trimmed}")`,
          `a.btn:has-text("${trimmed}")`,
          `a:has-text("${trimmed}")`,
          `.btn:has-text("${trimmed}")`,
          `label:has-text("${trimmed}")`,
          `label[class*="card"]:has-text("${trimmed}")`
        );
      }
      return page.locator(candidates.join(', '));
    }
    return page.getByText(clean, { exact: false });
  }

  if (typeof target === 'object') {
    const { strategy, value, fallback } = target;
    const strVal = String(value || '').trim();

    if (!strVal || strategy === 'none') return null;

    if (strategy === 'css' || isSelectorString(strVal)) {
      return page.locator(strVal);
    }

    switch (strategy) {
      case 'role': {
        const parts = strVal.split(':');
        const role = parts[0] || 'button';
        const name = parts[1] || '';
        return name ? page.getByRole(role, { name: new RegExp(name, 'i') }) : page.getByRole(role);
      }
      case 'label':
        return page.getByLabel(new RegExp(strVal, 'i'));
      case 'placeholder':
        return page.getByPlaceholder(new RegExp(strVal, 'i'));
      case 'text': {
        if (isSelectorString(strVal)) return page.locator(strVal);
        const cleanVal = stripActionFluff(strVal);
        if (action === 'click') {
          const candidates = [
            `button:has-text("${cleanVal}")`,
            `a.btn:has-text("${cleanVal}")`,
            `a:has-text("${cleanVal}")`,
            `input[type="submit"][value*="${cleanVal}" i]`,
            `input[type="button"][value*="${cleanVal}" i]`,
            `.btn:has-text("${cleanVal}")`,
            `[role="button"]:has-text("${cleanVal}")`,
            `label:has-text("${cleanVal}")`,
            `label[class*="card"]:has-text("${cleanVal}")`
          ];
          if (cleanVal !== strVal) {
            candidates.push(
              `button:has-text("${strVal}")`,
              `a.btn:has-text("${strVal}")`,
              `a:has-text("${strVal}")`,
              `.btn:has-text("${strVal}")`,
              `label:has-text("${strVal}")`,
              `label[class*="card"]:has-text("${strVal}")`
            );
          }
          return page.locator(candidates.join(', '));
        }
        return page.getByText(cleanVal, { exact: false });
      }
      case 'xpath':
        return page.locator(`xpath=${strVal}`);
      case 'id':
        return page.locator(`#${strVal.replace(/^#/, '')}`);
      case 'name':
        return page.locator(`[name="${strVal}"]`);
      default:
        return page.locator(strVal);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// RESOLVE LOCATOR WITH FALLBACK — Entry Point Utama (8 Strategi Bertingkat)
// ---------------------------------------------------------------------------

/**
 * Entry point utama untuk semua resolusi elemen di stepExecutor.
 *
 * Strategi dijalankan berurutan (berhenti ketika elemen ditemukan):
 * 0.  Active Modal Isolation   — prioritaskan elemen di modal yang terbuka
 * 1.  Hierarchical Arrow       — "Dashboard -> Aspal" → buka parent → cari child
 * 1.5 Auto-Expand Sidebar      — buka menu sidebar yang sedang collapse
 * 2.  Primary Locator          — resolveLocator() + pickBestInteractiveCandidate()
 * 2.5 Row-Level Action         — "No PO :: Edit" → tr:has-text + button
 * 2.8 Submit/Login Shortcut    — shortcut langsung untuk tombol login
 * 3.5 Enterprise Field Aliases — kamus alias field dari config/field-aliases.json
 * 4.  Fallback Property        — gunakan step.target.fallback jika ada
 * 5.  Heuristic Discovery      — findElementHeuristic() dengan sinonim bilingual
 * 5.5 Proximity Discovery      — discoverByProximity() berdasarkan label terdekat
 *
 * @param {import('@playwright/test').Page} page
 * @param {string|Object} target
 * @param {number} timeout
 * @param {string} action
 * @returns {Promise<{locator: import('@playwright/test').Locator, strategyUsed: string}>}
 */
async function resolveLocatorWithFallback(page, target, timeout = 3000, action = '') {
  const targetText = typeof target === 'string' ? target : (target?.value || target?.name || '');
  const lower = (targetText || '').toLowerCase();

  // ── 0. Active Modal Isolation ─────────────────────────────────────────────
  const activeModal = page.locator(MODAL_CONTAINER_SELECTOR).last();
  const isModalOpen = (await activeModal.count().catch(() => 0)) > 0 && (await activeModal.isVisible().catch(() => false));

  if (isModalOpen) {
    try {
      const cleanTarget = stripActionFluff(targetText);
      const lowerClean = (cleanTarget || '').toLowerCase();

      // 0.1 Direct Scoped Selector Resolution (Specific CSS / XPath within active modal)
      // E.g. #query_modal, tr:has-text('...') input[type='checkbox'], .btn-close, etc.
      const rawSel = (typeof target === 'object' && target?.strategy === 'css') ? target.value : (isSelectorString(targetText) ? targetText : null);
      if (rawSel) {
        const scopedLoc = activeModal.locator(rawSel);
        if ((await scopedLoc.count().catch(() => 0)) > 0) {
          const bestModalCand = await pickBestInteractiveCandidate(scopedLoc, action, rawSel);
          if (bestModalCand && (await isElementRealAndVisible(bestModalCand, action))) {
            return { locator: bestModalCand, strategyUsed: 'active_modal_scoped_direct' };
          }
          if (await scopedLoc.first().isVisible().catch(() => false)) {
            return { locator: scopedLoc.first(), strategyUsed: 'active_modal_scoped_direct' };
          }
        }
      }

      // 0.2 Target adalah Baris Spesifik (tr:has-text, nomor PO/SPM/SPB/Tiket, atau kode dokumen)
      const trMatch = (targetText || '').match(/tr:has-text\(['"]([^'"]+)['"]\)/i);
      const docMatch = (targetText || '').match(/\b\d{2,}[A-Za-z0-9\-\/._]+\b/);
      const rowKey = trMatch ? trMatch[1] : (docMatch ? docMatch[0] : null);

      if (rowKey && rowKey.length >= 3 && !rowKey.startsWith('http')) {
        const modalRow = activeModal.locator(`tr:has-text("${rowKey}")`).first();
        if ((await modalRow.count().catch(() => 0)) > 0 && (await modalRow.isVisible().catch(() => false))) {
          // A. Checkbox pada baris spesifik ini
          if (lowerClean.includes('checkbox') || lowerClean.includes('centang') || action === 'check') {
            const rowCb = modalRow.locator('input[type="checkbox"]').first();
            if ((await rowCb.count().catch(() => 0)) > 0 && (await rowCb.isVisible().catch(() => false))) {
              return { locator: rowCb, strategyUsed: 'active_modal_row_checkbox' };
            }
          }
          // B. Tombol aksi / Pilih pada baris spesifik ini
          const modalPickSels = appProfile.get('modalPickButtons', []);
          const rowBtn = modalRow.locator([
            ...modalPickSels,
            'button[class*="btn-pilih"]',
            ':is(button, a):has-text("Pilih")',
            ':is(button, a):has-text("Select")',
            ':is(button, a):has-text("Ambil")',
            'button', '.btn', 'a.btn', '[role="button"]'
          ].join(', ')).first();
          if ((await rowBtn.count().catch(() => 0)) > 0 && (await isElementRealAndVisible(rowBtn, action))) {
            return { locator: rowBtn, strategyUsed: 'active_modal_row_action_button' };
          }
        }
      }

      // 0.3 Intent "Pilih" / "select" pertama di dalam tabel modal (jika tanpa nomor baris spesifik)
      const isChooseIntent = action === 'click' && !rowKey && (
        lowerClean === 'pilih' ||
        lowerClean.includes('pilih') ||
        lowerClean.includes('select') ||
        lowerClean.includes('choose')
      );
      if (isChooseIntent) {
        const modalPickSels = appProfile.get('modalPickButtons', []);
        const modalPilihBtn = activeModal.locator([
          ...modalPickSels,
          'button[class*="btn-pilih"]',
          'table tbody tr button:has-text("Pilih")', 'table tbody tr .btn:has-text("Pilih")',
          'button:has-text("Pilih")', 'a.btn:has-text("Pilih")', 'a:has-text("Pilih")',
          'table tbody tr button', 'table tbody tr .btn'
        ].join(', ')).first();

        if ((await modalPilihBtn.count().catch(() => 0)) > 0 && (await modalPilihBtn.isVisible().catch(() => false))) {
          return { locator: modalPilihBtn, strategyUsed: 'active_modal_pilih_button' };
        }
      }

      // 0.4 Checkbox Persetujuan Umum di dalam modal (HANYA jika bukan baris data spesifik)
      // (misal #modal_verifikasi input[type='checkbox'], chkConfirmAgree, persetujuan)
      const isModalGeneralCheckboxIntent = !rowKey && (action === 'click' || action === 'check') && (
        lowerClean.includes('checkbox') ||
        lowerClean.includes('centang') ||
        lowerClean.includes('agree') ||
        lowerClean.includes('meninjau') ||
        (lowerClean.includes('setuju') && !lowerClean.includes('button'))
      );
      if (isModalGeneralCheckboxIntent) {
        const modalCheckbox = activeModal.locator('input[type="checkbox"], #chkConfirmAgree, .form-check-input').first();
        if ((await modalCheckbox.count().catch(() => 0)) > 0 && (await modalCheckbox.isVisible().catch(() => false))) {
          return { locator: modalCheckbox, strategyUsed: 'active_modal_checkbox' };
        }
      }

      // 0.5 Close / Tutup / Silang (X) / Batal Intent di dalam modal aktif
      const isModalCloseIntent = action === 'click' && (
        lowerClean === 'x' ||
        lowerClean === 'close' ||
        lowerClean === 'tutup' ||
        lowerClean === 'batal' ||
        lowerClean === 'cancel' ||
        lowerClean === '×' ||
        lowerClean.includes('tutup') ||
        lowerClean.includes('close') ||
        lowerClean.includes('silang') ||
        lowerClean.includes('batal') ||
        lowerClean.includes('cancel') ||
        lowerClean.includes('dismiss') ||
        lowerClean.includes('btn-close') ||
        lowerClean.includes('close-modal') ||
        lowerClean.includes('close_modal')
      );

      if (isModalCloseIntent) {
        // Jika diminta silang / x / atas, prioritaskan tombol header (Bootstrap 3/4/5)
        const wantsHeaderX = lowerClean === 'x' || lowerClean === '×' || lowerClean.includes('silang') || lowerClean.includes('atas') || lowerClean.includes('btn-close');

        const headerCloseSels = [
          '[data-bs-dismiss="modal"]',
          '[data-dismiss="modal"]',
          '.btn-close',
          '.modal-header .close',
          'button.close',
          'a.close',
          '.close',
          'button[aria-label*="close" i]',
          'button[aria-label*="tutup" i]',
          'button:has-text("×")',
          'button:has-text("✕")',
          'button:has-text("✖")',
          'button:has(.fa-times)',
          'button:has(.bi-x)',
          'button:has(.bi-x-lg)',
          'button:has(.fa-close)',
          'button:has(.fa-xmark)'
        ].join(', ');

        const footerCloseSels = [
          'button:has-text("Tutup")',
          'a:has-text("Tutup")',
          'button:has-text("Close")',
          'a:has-text("Close")',
          'button:has-text("Batal")',
          'a:has-text("Batal")',
          '.swal2-cancel',
          '.swal2-close',
          '.modal-footer button.btn-secondary',
          '.modal-footer .btn-default',
          '.modal-footer button'
        ].join(', ');

        const candidates = wantsHeaderX
          ? `${headerCloseSels}, ${footerCloseSels}`
          : `${footerCloseSels}, ${headerCloseSels}`;

        const modalCloseBtn = activeModal.locator(candidates).first();
        if ((await modalCloseBtn.count().catch(() => 0)) > 0 && (await modalCloseBtn.isVisible().catch(() => false))) {
          return { locator: modalCloseBtn, strategyUsed: 'active_modal_close_button' };
        }
      }

      // 0E. Action / Confirm / Verifikasi Button Intent di dalam modal aktif
      // (misal #modal_verifikasi button:has-text('Verifikasi'), .btn-approve, konfirmasi)
      const isModalConfirmIntent = action === 'click' && (
        lowerClean.includes('verif') ||
        lowerClean.includes('approve') ||
        lowerClean.includes('setuju') ||
        lowerClean.includes('confirm') ||
        lowerClean.includes('konfirmasi') ||
        lowerClean.includes('simpan') ||
        lowerClean.includes('submit') ||
        lowerClean.includes('ya')
      );
      if (isModalConfirmIntent) {
        const specialActionBtns = appProfile.get('specialActionButtons', []);
        const modalConfirmBtn = activeModal.locator([
          '.swal2-confirm',
          ...specialActionBtns,
          'button:has-text("Verifikasi")',
          'button:has-text("Approve")',
          'button:has-text("Konfirmasi")',
          'button:has-text("Simpan")',
          'button:has-text("Ya")',
          'button.btn-primary',
          'button[type="submit"]'
        ].join(', ')).first();
        if ((await modalConfirmBtn.count().catch(() => 0)) > 0 && (await isElementRealAndVisible(modalConfirmBtn, action))) {
          return { locator: modalConfirmBtn, strategyUsed: 'active_modal_confirm_button' };
        }
      }

      // 0F. Resolusi standar yang di-scope ke dalam modal
      const modalPrimary = resolveLocator(activeModal, cleanTarget || target, action);
      if (modalPrimary && (await modalPrimary.count().catch(() => 0)) > 0) {
        const bestModalCand = await pickBestInteractiveCandidate(modalPrimary, action, cleanTarget || targetText);
        if (bestModalCand && (await isElementRealAndVisible(bestModalCand, action))) {
          return { locator: bestModalCand, strategyUsed: 'active_modal_scoped' };
        }
      }
    } catch (e) {}
  }

  // ── 1. Hierarchical Arrow Notation ("Dashboard -> Aspal") ─────────────────
  if (targetText && (targetText.includes('->') || targetText.includes('>'))) {
    const parts = targetText.split(/->|>/).map(s => s.trim()).filter(s => s.length > 0);
    if (parts.length >= 2) {
      const parentName = parts[0];
      const childName = parts[1];

      const parentContainer = page.locator(`:is(.nav-item, li, .sidebar-item, .accordion-item, .dropdown):has(:is(a, button, p, span):has-text("${parentName}"))`).first();
      if (await parentContainer.count() > 0) {
        const childLoc = parentContainer.locator(`:is(a, button, .nav-link, p, span):has-text("${childName}")`).first();
        if (await childLoc.count() > 0 && !(await childLoc.isVisible().catch(() => false))) {
          const toggle = parentContainer.locator(':scope > a, :scope > button, :scope > .dropdown-toggle, :scope > [data-bs-toggle], :scope > .nav-link').first();
          if (await toggle.count() > 0) {
            await toggle.click({ force: true }).catch(() => {});
            await page.waitForTimeout(350);
          }
        }
        if (await childLoc.count() > 0 && await isElementRealAndVisible(childLoc, action)) {
          return { locator: childLoc, strategyUsed: 'hierarchical_arrow_scope' };
        }
      }
    }
  }

  // ── 2. Primary Locator + Multi-Candidate Scoring (Fast-Path) ───────────────
  const primaryLocator = resolveLocator(page, target, action);
  if (primaryLocator) {
    try {
      let count = await primaryLocator.count();
      if (count === 0 && targetText && (targetText.includes('tr:') || targetText.includes('tr:has-text') || targetText.includes('tbody'))) {
        // Jika sedang re-render DataTables atau AJAX, tunggu hingga 4 detik sebelum menyimpulkan elemen tidak ada
        await primaryLocator.first().waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
        count = await primaryLocator.count();
      }
      if (count > 0) {
        const best = await pickBestInteractiveCandidate(primaryLocator, action, targetText);
        if (best) return { locator: best, strategyUsed: 'primary' };
      }
    } catch (e) {}
  }

  // ── 2.1 Auto-Expand Sidebar Accordion (hanya jika primary belum ketemu & bukan raw CSS selector) ─
  if (action === 'click' && targetText && !isSelectorString(targetText) && !targetText.includes('->') && !targetText.includes('>')) {
    try {
      const hiddenSidebarItem = page.locator(`:is(.sidebar, .main-sidebar, nav) :is(a, .nav-link, span):has-text("${targetText}")`).first();
      if ((await hiddenSidebarItem.count().catch(() => 0)) > 0 && !(await hiddenSidebarItem.isVisible().catch(() => false))) {
        const parentContainer = hiddenSidebarItem.locator('xpath=ancestor::*[self::li or contains(@class, "nav-item") or contains(@class, "has-treeview")][last()]').first();
        if ((await parentContainer.count().catch(() => 0)) > 0) {
          const toggle = parentContainer.locator(':scope > a, :scope > button, :scope > .dropdown-toggle, :scope > [data-bs-toggle], :scope > .nav-link').first();
          if ((await toggle.count().catch(() => 0)) > 0) {
            await toggle.click({ force: true }).catch(() => {});
            await page.waitForTimeout(350);
            if (primaryLocator && (await primaryLocator.count().catch(() => 0)) > 0) {
              const bestAfterExpand = await pickBestInteractiveCandidate(primaryLocator, action, targetText);
              if (bestAfterExpand) return { locator: bestAfterExpand, strategyUsed: 'sidebar_auto_expanded' };
            }
          }
        }
      }
    } catch (e) {}
  }


  // ── 2.2 Trash / Delete Icon & Emoji Recovery ──────────────────────────────
  // If target specified a trash icon (e.g. "button:has(.fa-trash)", "fa-trash", "trash can")
  // but the page uses an emoji (🗑️ / 🗑), an onclick handler (removeRow), or table action button:
  if (action === 'click' && (lower.includes('trash') || lower.includes('sampah') || lower.includes('fa-trash'))) {
    const inlineDelSels = appProfile.get('inlineDeleteButtons', []);
    const trashCandidate = page.locator([
      ...inlineDelSels,
      'button:has-text("🗑️")',
      'button:has-text("🗑")',
      'button.btn-danger:has-text("🗑")',
      'button[onclick*="remove"]',
      'button[onclick*="hapus"]',
      ':is(.tab-pane.active, form:visible) button.btn-danger',
      ':is(.tab-pane.active, form:visible) button[onclick*="remove"]',
      'tbody[id*="detail" i] button.btn-danger',
      'tbody[id*="item" i] button.btn-danger',
      'table[id*="detail" i] button.btn-danger',
      'tbody tr td:last-child button.btn-danger',
      'tbody tr td:last-child button[class*="danger"]',
      'button:has(.fa-trash, .fa-trash-alt, .bi-trash, [class*="trash"])',
      'a:has(.fa-trash, .fa-trash-alt, .bi-trash, [class*="trash"])'
    ].join(', ')).first();

    if ((await trashCandidate.count().catch(() => 0)) > 0 && (await isElementRealAndVisible(trashCandidate, action))) {
      return { locator: trashCandidate, strategyUsed: 'trash_icon_emoji_recovery' };
    }
  }

  // ── 2.3 Inline Table Delete Button Recovery (untuk baris tabel data dinamis) ──
  if (action === 'click' && (lower.includes('hapus') || lower.includes('delete') || lower.includes('remove'))) {
    const inlineDelSels = appProfile.get('inlineDeleteButtons', []);
    const inlineTableDel = page.locator([
      ...inlineDelSels,
      'button:has-text("🗑️")',
      'button:has-text("🗑")',
      'button.btn-danger:has-text("🗑")',
      'button[onclick*="remove"]',
      'button[onclick*="hapus"]',
      ':is(.tab-pane.active, form:visible) button.btn-danger',
      'tbody[id*="detail" i] button.btn-danger',
      'tbody[id*="item" i] button.btn-danger',
      'table[id*="detail" i] button.btn-danger',
      'tbody:not(:has(.dropdown-toggle)) tr td:last-child button.btn-danger',
      'tbody:not(:has(.dropdown-toggle)) tr button.btn-danger'
    ].join(', ')).first();

    if ((await inlineTableDel.count().catch(() => 0)) > 0 && (await isElementRealAndVisible(inlineTableDel, action))) {
      return { locator: inlineTableDel, strategyUsed: 'inline_table_delete_recovery' };
    }
  }

  // ── 2.4 Plus / Expand / Detail Icon Recovery in Table Rows ─────────────────
  // Menangani kasus klik "tanda plus", "icon plus", "+", atau selector buatan LLM
  // seperti "tr:has-text('...') button:has-text('+')" pada tabel DataTables (misal detail customer SPM)
  const isPlusIntent = action === 'click' && (
    lower.includes('plus') ||
    lower.includes('+') ||
    lower.includes('fa-plus') ||
    lower.includes('detail')
  );

  if (isPlusIntent) {
    const PLUS_SELECTORS = [
      'a.fa-plus-circle',
      'i.fa-plus-circle',
      '.fa-plus-circle',
      'a.fa-plus',
      'i.fa-plus',
      '.fa-plus',
      '[class*="fa-plus"]',
      '[class*="plus-circle"]',
      'a[onclick*="detail"]',
      'button[onclick*="detail"]',
      appProfile.get('dataTableDetailsControl', 'td[class*="control"]'),
      'a[class*="plus"]',
      'button[class*="plus"]',
      'a:has-text("+")',
      'button:has-text("+")'
    ].join(', ');

    // Cek jika ada pola tr:has-text('...') di dalam target selector
    const trMatch = targetText.match(/tr:has-text\(['"]([^'"]+)['"]\)/i);
    if (trMatch && trMatch[1]) {
      const rowLoc = page.locator(`tr:has-text("${trMatch[1]}")`).first();
      if ((await rowLoc.count().catch(() => 0)) > 0) {
        const plusInRow = rowLoc.locator(PLUS_SELECTORS).first();
        if ((await plusInRow.count().catch(() => 0)) > 0) {
          return { locator: plusInRow, strategyUsed: 'table_row_plus_icon_recovery' };
        }
      }
    }

    // Cek apakah ada nomor dokumen / teks baris di dalam target (misal "001/SMA000-ASC/DO/09/26")
    const docMatch = targetText.match(/\d{3}\/[A-Za-z0-9\-\/]+/);
    if (docMatch && docMatch[0]) {
      const rowLoc = page.locator(`tr:has-text("${docMatch[0]}")`).first();
      if ((await rowLoc.count().catch(() => 0)) > 0) {
        const plusInRow = rowLoc.locator(PLUS_SELECTORS).first();
        if ((await plusInRow.count().catch(() => 0)) > 0) {
          return { locator: plusInRow, strategyUsed: 'table_row_doc_plus_icon_recovery' };
        }
      }
    }

    // Cek tombol plus / expand pertama di tabel mana pun yang terlihat
    const genericPlus = page.locator(`table tbody tr ${PLUS_SELECTORS}`).first();
    if ((await genericPlus.count().catch(() => 0)) > 0) {
      return { locator: genericPlus, strategyUsed: 'table_generic_plus_icon_recovery' };
    }
  }

  // ── 2.5 Row-Level Action ("No PO :: Edit", "Customer | Hapus") ────────────
  if (action === 'click' && targetText && (targetText.includes('::') || targetText.includes('|'))) {
    const [rowKeyword, btnKeyword] = targetText.split(/::|\|/).map(s => s.trim());
    if (rowKeyword && btnKeyword) {
      const rowLoc = page.locator(`tr:has-text("${rowKeyword}")`).locator(`button:has-text("${btnKeyword}"), a:has-text("${btnKeyword}"), .btn:has-text("${btnKeyword}")`).first();
      if (await rowLoc.count() > 0 && await isElementRealAndVisible(rowLoc, action)) {
        return { locator: rowLoc, strategyUsed: 'row_level_action_targeting' };
      }
    }
  }

  // ── 2.8 Submit/Login Shortcut ──────────────────────────────────────────────
  if (action === 'click' && (lower.includes('masuk') || lower.includes('login') || lower === 'submit')) {
    const loginFormSel = appProfile.get('loginForm');
    const directBtn = page.locator(`${loginFormSel ? loginFormSel + ' button[type="submit"], ' : ''}button:has-text("Masuk"), button:has-text("Login"), button[type="submit"]`).first();
    if (await directBtn.count() > 0 && await isElementRealAndVisible(directBtn, action)) {
      return { locator: directBtn, strategyUsed: 'smart_submit_discovery' };
    }
  }

  // ── 3.5 Enterprise Field Alias ─────────────────────────────────────────────
  const cleanFieldKey = lower
    .replace(/^[#\.\s]+/, '')
    .replace(/^(select|input|textarea)\[name=['"]?/i, '')
    .replace(/['"]?\]$/, '')
    .replace(/[\s\-]/g, '_')
    .trim();

  if (ENTERPRISE_FIELD_ALIASES[cleanFieldKey]) {
    for (const sel of ENTERPRISE_FIELD_ALIASES[cleanFieldKey]) {
      const aliasLoc = page.locator(sel);
      const count = await aliasLoc.count().catch(() => 0);
      for (let i = 0; i < Math.min(count, 3); i++) {
        const item = aliasLoc.nth(i);
        if (await isElementRealAndVisible(item, action)) {
          return { locator: item, strategyUsed: 'enterprise_alias_visible' };
        }
        const s2Sibling = item.locator('xpath=following-sibling::*[contains(@class, "select2-container")][1]');
        if ((await s2Sibling.count().catch(() => 0)) > 0 && (await s2Sibling.first().isVisible().catch(() => false))) {
          return { locator: item, strategyUsed: 'enterprise_alias_select2' };
        }
      }
    }
  }

  // ── 4. Fallback dari property target.fallback ──────────────────────────────
  if (typeof target === 'object' && target?.fallback) {
    try {
      const fallbackLoc = resolveLocator(page, target.fallback, action);
      if (fallbackLoc && await fallbackLoc.count() > 0) {
        const best = await pickBestInteractiveCandidate(fallbackLoc, action, targetText);
        if (best) return { locator: best, strategyUsed: 'fallback_defined' };
      }
    } catch (e) {}
  }

  // ── 5. Heuristic Discovery (bilingual synonyms + DOM fallback) ─────────────
  const heuristic = await findElementHeuristic(page, targetText, timeout, action);
  if (heuristic && (await heuristic.count() > 0)) {
    const best = await pickBestInteractiveCandidate(heuristic, action, targetText);
    if (best) return { locator: best, strategyUsed: 'heuristic' };
  }

  // ── 5.5 Proximity Discovery (elemen tanpa label eksplisit) ────────────────
  const proximityMatch = await discoverByProximity(page, targetText, action);
  if (proximityMatch && (await proximityMatch.count().catch(() => 0)) > 0) {
    const best = await pickBestInteractiveCandidate(proximityMatch, action, targetText);
    if (best) return { locator: best, strategyUsed: 'proximity_discovery' };
  }

  // ── Fallback Akhir ─────────────────────────────────────────────────────────
  return { locator: (primaryLocator ? primaryLocator.first() : page.locator('body')), strategyUsed: 'fallback_primary' };
}

// ---------------------------------------------------------------------------
// EXPORTS — IDENTIK dengan versi sebelumnya (backward compatible)
// ---------------------------------------------------------------------------

module.exports = {
  // Entry points utama
  resolveLocator,
  resolveLocatorWithFallback,

  // Dari elementScorer.js
  pickBestInteractiveCandidate,
  isElementRealAndVisible,

  // Dari elementDiscovery.js
  findElementHeuristic,
  discoverByProximity,

  // Dari locatorHelpers.js
  isSelectorString,
  getSynonyms,
  matchesKeywords,
  stripActionFluff,
  MODAL_CONTAINER_SELECTOR,

  // Dari config
  ENTERPRISE_FIELD_ALIASES,
};
