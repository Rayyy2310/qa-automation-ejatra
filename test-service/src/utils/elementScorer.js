/**
 * elementScorer.js — Element Visibility Validation & Multi-Candidate Scoring
 *
 * Berisi fungsi yang memerlukan Playwright Locator untuk menilai dan memilih
 * elemen terbaik ketika ada beberapa kandidat yang cocok:
 * - isElementRealAndVisible : validasi visibilitas & tipe elemen sesuai aksi
 * - pickBestInteractiveCandidate : scoring algorithm untuk pilih kandidat terbaik
 *
 * Dipecah dari locatorResolver.js (baris 151-266 & 652-757)
 */

const { autoRevealParentContainer } = require('../runner/actions/overlayHandler');
const appProfile = require('./appProfile');

// ---------------------------------------------------------------------------
// VALIDASI VISIBILITAS & KECOCOKAN ELEMEN
// ---------------------------------------------------------------------------

/**
 * Validasi bahwa sebuah Playwright Locator benar-benar visible dan sesuai
 * dengan tipe aksi yang akan dilakukan.
 *
 * Menangani kasus khusus:
 * - <select> yang disembunyikan oleh Select2 (select2-hidden-accessible)
 * - Elemen di dalam tab-pane / accordion yang tidak aktif
 * - Filter berdasarkan tipe aksi: 'select' harus elemen dropdown, 'fill' harus input, dll.
 *
 * @param {import('@playwright/test').Locator} candidate
 * @param {string} action - 'click' | 'fill' | 'select' | 'search' | dll
 * @returns {Promise<boolean>}
 */
async function isElementRealAndVisible(candidate, action = '', allowAutoReveal = false) {
  if (!candidate) return false;
  try {
    let isVis = await candidate.isVisible().catch(() => false);

    // Kasus khusus: <select> yang disembunyikan oleh Select2
    // Cek apakah Select2 container-nya yang visible
    if (!isVis) {
      isVis = await candidate.evaluate(el => {
        if (el && el.tagName && el.tagName.toLowerCase() === 'select') {
          const next = el.nextElementSibling;
          if (next && next.classList.contains('select2-container')) {
            const style = window.getComputedStyle(next);
            return style.display !== 'none' && style.visibility !== 'hidden' && next.offsetWidth > 0;
          }
          const parent = el.closest('.select2-container') || (el.parentElement && el.parentElement.querySelector('.select2-container'));
          if (parent) {
            const style = window.getComputedStyle(parent);
            return style.display !== 'none' && style.visibility !== 'hidden' && parent.offsetWidth > 0;
          }
        }
        return false;
      }).catch(() => false);
    }

    // Kasus khusus: elemen di dalam tab-pane atau collapse yang tidak aktif → auto-reveal (hanya jika diizinkan)
    if (!isVis && allowAutoReveal && typeof candidate.page === 'function') {
      const isInsideHiddenContainer = await candidate.evaluate(el => {
        const pane = el.closest('.tab-pane, [role="tabpanel"], .collapse:not(.show)');
        if (!pane) return false;
        const style = window.getComputedStyle(pane);
        return style.display === 'none' || (!pane.classList.contains('active') && !pane.classList.contains('show'));
      }).catch(() => false);

      if (isInsideHiddenContainer) {
        await autoRevealParentContainer(candidate.page(), candidate, '', action);
        isVis = await candidate.isVisible().catch(() => false);
      }
    }

    if (!isVis) return false;

    const isValid = await candidate.evaluate((el, { act, debugContainerSel, loginFormSel }) => {
      // 1. Jangan pernah cocokkan elemen debugbar atau toolbar CI4
      if (debugContainerSel && el.closest(debugContainerSel)) {
        return false;
      }

      // 2. Aksi 'select': elemen HARUS berupa <select>, Select2, atau combobox
      if (act === 'select') {
        const tag = el.tagName.toLowerCase();
        const isSelect = tag === 'select';
        const isSelect2 = el.classList.contains('select2-selection') ||
                          el.classList.contains('select2-container') ||
                          el.classList.contains('select2-hidden-accessible') ||
                          Boolean(el.closest('.select2-container'));
        const isCombobox = el.getAttribute('role') === 'combobox';
        const hasSiblingSelect2 = Boolean(el.nextElementSibling && el.nextElementSibling.classList.contains('select2-container'));

        if (!isSelect && !isSelect2 && !isCombobox && !hasSiblingSelect2) {
          return false; // Tolak <input type="search">, <div>, button dll untuk aksi select!
        }
        // Jangan arahkan ke form login
        if (el.id === 'username' || el.id === 'password' || el.name === 'username' || el.name === 'password' || (loginFormSel && el.closest(loginFormSel))) {
          return false;
        }
      }

      // 3. Aksi 'fill'/'search'/'type': elemen HARUS editable
      if (act === 'fill' || act === 'search' || act === 'type') {
        const tag = el.tagName.toLowerCase();
        const isInput = tag === 'input' || tag === 'textarea' || tag === 'select';
        const isEditable = el.isContentEditable || el.getAttribute('contenteditable') === 'true';
        const isSelect2 = el.classList.contains('select2-selection') || el.classList.contains('select2-container') || el.classList.contains('select2-search__field') || Boolean(el.closest('.select2-container'));
        const isRoleInput = ['textbox', 'searchbox', 'combobox'].includes(el.getAttribute('role'));

        if (!isInput && !isEditable && !isSelect2 && !isRoleInput) {
          return false; // Tolak <strong>, <div>, <p>, <span> untuk fill/search!
        }
        // Aksi 'search' tidak boleh mengisi field login
        if (act === 'search') {
          if (el.id === 'username' || el.id === 'password' || el.name === 'username' || el.name === 'password' || (loginFormSel && el.closest(loginFormSel))) {
            return false;
          }
        }
      }

      // 4. Aksi 'click': tolak container statis (heading, body, footer)
      if (act === 'click') {
        const tag = el.tagName.toLowerCase();
        if (['body', 'html', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'legend'].includes(tag)) {
          const interactiveParent = el.closest('button, a, [role="button"], .btn, input, [onclick], label, .dropdown-item, .nav-link');
          if (!interactiveParent) {
            return false; // Tolak heading statis seperti <h3>Masuk ke Sistem</h3>
          }
        }
      }

      return true;
    }, {
      act: action,
      debugContainerSel: appProfile.get('debugOverlayContainer'),
      loginFormSel: appProfile.get('loginForm')
    }).catch(() => false);

    return Boolean(isValid);
  } catch (e) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// SCORING & PEMILIHAN KANDIDAT TERBAIK
// ---------------------------------------------------------------------------

/**
 * Pilih elemen terbaik dari sekumpulan kandidat Playwright Locator yang cocok.
 *
 * Algoritma scoring (dijalankan di dalam browser):
 * - +500 / -500  : Modal isolation (prioritaskan elemen di dalam modal yang terbuka)
 * - +150 / -150  : Active Tab Scoping (prioritaskan elemen di dalam .tab-pane.active)
 * - +80          : Input di dalam form aktif (untuk fill/select/search/check)
 * - +250         : Exact id/name attribute match
 * - +200 / +40   : Exact/partial text match bonus
 * - +80          : Di dalam sidebar/navigation (jika tidak ada modal)
 * - +100         : Di dalam container yang sedang terbuka (accordion, dropdown)
 * - +60          : Link navigasi nyata (bukan href="#")
 * - -20          : Toggle container (data-bs-toggle)
 * - +25          : Submenu tersarang (li li, .nav-treeview)
 * - +25          : Tombol aksi utama (btn-primary, btn-success, type="submit")
 *
 * @param {import('@playwright/test').Locator} locator
 * @param {string} action
 * @param {string} targetText
 * @returns {Promise<import('@playwright/test').Locator|null>}
 */
async function pickBestInteractiveCandidate(locator, action = 'click', targetText = '') {
  if (!locator) return null;
  const count = await locator.count().catch(() => 0);
  if (count === 0) return null;

  // Kandidat tunggal: langsung validasi & kembalikan (boleh auto-reveal jika tersembunyi)
  if (count === 1) {
    const single = locator.first();
    return (await isElementRealAndVisible(single, action, true)) ? single : null;
  }

  // Multi-kandidat: evaluasi visibilitas, validasi tipe aksi, dan scoring sekaligus dalam 1 panggilan browser (evaluateAll)
  try {
    const bestIndex = await locator.evaluateAll((elements, { targetText, act, debugContainerSel, loginFormSel }) => {
      const limit = Math.min(elements.length, 15);
      let bestIdx = -1;
      let highestScore = -99999;

      const isAnyModalOpen = Boolean(document.querySelector(
        '.modal.show, .modal.in, .modal:not([style*="display: none"]), [role="dialog"]:not([style*="display: none"]), div[id*="modal" i]:not([style*="display: none"]), .swal2-container.swal2-shown, .swal2-popup:not([style*="display: none"])'
      ));

      function isDomVisible(el) {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        if (style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && el.getClientRects().length > 0) return true;

        if (el.tagName && el.tagName.toLowerCase() === 'select') {
          const next = el.nextElementSibling;
          if (next && next.classList.contains('select2-container')) {
            const ns = window.getComputedStyle(next);
            return ns.display !== 'none' && ns.visibility !== 'hidden' && next.offsetWidth > 0;
          }
          const parent = el.closest('.select2-container') || (el.parentElement && el.parentElement.querySelector('.select2-container'));
          if (parent) {
            const ps = window.getComputedStyle(parent);
            return ps.display !== 'none' && ps.visibility !== 'hidden' && parent.offsetWidth > 0;
          }
        }
        return false;
      }

      function isActionValid(el) {
        if (debugContainerSel && el.closest(debugContainerSel)) return false;
        const tag = el.tagName.toLowerCase();

        if (act === 'select') {
          const isSelect = tag === 'select';
          const isSelect2 = el.classList.contains('select2-selection') ||
                            el.classList.contains('select2-container') ||
                            el.classList.contains('select2-hidden-accessible') ||
                            Boolean(el.closest('.select2-container'));
          const isCombobox = el.getAttribute('role') === 'combobox';
          const hasSiblingSelect2 = Boolean(el.nextElementSibling && el.nextElementSibling.classList.contains('select2-container'));
          if (!isSelect && !isSelect2 && !isCombobox && !hasSiblingSelect2) return false;
          if (el.id === 'username' || el.id === 'password' || el.name === 'username' || el.name === 'password' || (loginFormSel && el.closest(loginFormSel))) {
            return false;
          }
        }

        if (act === 'fill' || act === 'search' || act === 'type') {
          const isInput = tag === 'input' || tag === 'textarea' || tag === 'select';
          const isEditable = el.isContentEditable || el.getAttribute('contenteditable') === 'true';
          const isSelect2 = el.classList.contains('select2-selection') || el.classList.contains('select2-container') || el.classList.contains('select2-search__field') || Boolean(el.closest('.select2-container'));
          const isRoleInput = ['textbox', 'searchbox', 'combobox'].includes(el.getAttribute('role'));
          if (!isInput && !isEditable && !isSelect2 && !isRoleInput) return false;
          if (act === 'search' && (el.id === 'username' || el.id === 'password' || el.name === 'username' || el.name === 'password' || (loginFormSel && el.closest(loginFormSel)))) {
            return false;
          }
        }

        if (act === 'click') {
          if (['body', 'html', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'legend'].includes(tag)) {
            const interactiveParent = el.closest('button, a, [role="button"], .btn, input, [onclick], label, .dropdown-item, .nav-link');
            if (!interactiveParent) return false;
          }
        }
        return true;
      }

      for (let i = 0; i < limit; i++) {
        const el = elements[i];
        if (!isDomVisible(el) || !isActionValid(el)) continue;

        let s = 0;
        const tag = el.tagName.toLowerCase();
        const href = el.getAttribute('href') || '';
        const isHashOrEmpty = !href || href === '#' || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('void(0)');
        const isToggle = el.classList.contains('dropdown-toggle') ||
                         el.classList.contains('menu-toggle') ||
                         el.hasAttribute('data-bs-toggle') ||
                         el.hasAttribute('data-toggle') ||
                         (el.getAttribute('role') === 'button' && isHashOrEmpty);

        const isInsideModal = Boolean(el.closest('.modal.show, .modal.in, .modal:not([style*="display: none"]), [role="dialog"], .modal-dialog, div[id*="modal" i], .swal2-container, .swal2-popup, .bootbox'));
        if (isAnyModalOpen) {
          s += isInsideModal ? 500 : -500;
        } else {
          const isInsideActiveTab = Boolean(el.closest('.tab-pane.active, .tab-pane.show, [role="tabpanel"].active'));
          const isInsideInactiveTab = Boolean(el.closest('.tab-pane:not(.active):not(.show), [role="tabpanel"]:not(.active):not(.show)'));
          if (isInsideActiveTab) s += 150;
          else if (isInsideInactiveTab) s -= 150;

          const formNotSel = loginFormSel ? `form:not(${loginFormSel}):not([style*="display: none"])` : 'form:not([style*="display: none"])';
          const isInsideForm = Boolean(el.closest(`${formNotSel}, div[id*="form" i]:not([style*="display: none"])`));
          if (isInsideForm && act !== 'click') s += 80;
        }

        if (targetText && typeof targetText === 'string') {
          const normTarget = targetText.trim().toLowerCase();
          const cleanNormTarget = normTarget.replace(/^[#\.\s]+/, '').replace(/_/g, ' ');
          const elText = (el.innerText || el.textContent || el.value || '').trim().toLowerCase();
          const elId = (el.id || '').toLowerCase();
          const elName = (el.name || '').toLowerCase();

          if (elId === normTarget || elName === normTarget) s += 250;
          else if (elId === cleanNormTarget.replace(/\s+/g, '_') || elName === cleanNormTarget.replace(/\s+/g, '_')) s += 220;
          else if (elText === normTarget) s += 200;
          else if (elText.startsWith(normTarget) || elText.endsWith(normTarget)) s += 40;
          else if (elId.includes(normTarget) || elName.includes(normTarget)) s += 60;

          // Row-level Exact Cell & Token Boundary Scoring:
          // Mencegah salah pilih baris bersufiks (misal mencari "SMA00020260014" tapi memilih "SMA00020260014-A")
          const trKeyMatch = targetText.match(/tr:has-text\(['"]([^'"]+)['"]\)/i);
          const docKeyMatch = !trKeyMatch
            ? targetText.match(/\b[A-Za-z]{2,5}\d{5,}[A-Za-z0-9\-\/._]*\b|\b\d{2,}[A-Za-z0-9\-\/._]+\b/)
            : null;
          const targetRowKey = trKeyMatch ? trKeyMatch[1].trim() : (docKeyMatch ? docKeyMatch[0].trim() : '');

          if (targetRowKey) {
            const parentRow = el.closest('tr');
            if (parentRow) {
              const escapedKey = targetRowKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const exactCellRe = new RegExp('^\\s*' + escapedKey + '\\s*$', 'i');
              const tokenBoundaryRe = new RegExp('(?:^|[^A-Za-z0-9\\-_\\/])' + escapedKey + '(?![A-Za-z0-9\\-_\\/])', 'i');
              const cells = Array.from(parentRow.querySelectorAll('td, th'));
              const hasExactCell = cells.some(td => exactCellRe.test((td.innerText || td.textContent || '').trim()));
              const rowText = (parentRow.innerText || parentRow.textContent || '');

              if (hasExactCell) {
                s += 400;
              } else if (tokenBoundaryRe.test(rowText)) {
                s += 250;
              } else {
                s -= 150;
              }
            }
          }
        }

        const isSidebarOrNav = Boolean(el.closest('.sidebar, aside, nav, .navbar-nav, .sidebar-menu, [role="navigation"], #sidebar, ul.nav, .nav-item'));
        if (isSidebarOrNav && !isAnyModalOpen) s += 80;

        let openContainer = el.closest('.collapse.show, .show, .menu-open, .dropdown-menu.show, .submenu.show, .sub-menu.show');
        if (!openContainer) {
          const parent = el.closest('ul, div');
          if (parent && parent.parentElement && parent.parentElement.querySelector('[aria-expanded="true"]')) {
            openContainer = parent;
          }
        }
        if (openContainer) s += 100;

        if (act === 'click') {
          if (!isHashOrEmpty && tag === 'a') s += 60;
          if (isToggle) s -= 20;
          if (el.closest('li li, .nav-treeview, .sidebar-submenu, .submenu, .dropdown-menu')) s += 25;
          if (el.classList.contains('btn-primary') || el.classList.contains('btn-info') || el.classList.contains('btn-success') || el.type === 'submit') {
            s += 25;
          }

          const isPagination = Boolean(el.closest('.dataTables_paginate, .pagination, [class*="paginate"]'));
          if (isPagination) {
            const normT = (targetText || '').toLowerCase().trim();
            const isExplicitPagination = ['halaman', 'page', 'next', 'prev', 'sebelumnya', 'selanjutnya'].some(k => normT.includes(k));
            if (!isExplicitPagination) s -= 500;
          }
        }

        if (s > highestScore) {
          highestScore = s;
          bestIdx = i;
        }
      }

      return bestIdx;
    }, {
      targetText,
      act: action,
      debugContainerSel: appProfile.get('debugOverlayContainer'),
      loginFormSel: appProfile.get('loginForm'),
    });

    if (bestIndex >= 0) {
      return locator.nth(bestIndex);
    }
  } catch (e) {}

  // Jika tidak ada satu pun kandidat yang visible di state saat ini,
  // coba kandidat pertama dengan auto-reveal
  const firstCand = locator.first();
  if (await isElementRealAndVisible(firstCand, action, true)) {
    return firstCand;
  }
  return null;
}

module.exports = {
  isElementRealAndVisible,
  pickBestInteractiveCandidate,
};
