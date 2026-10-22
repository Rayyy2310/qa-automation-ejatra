/**
 * searchSelect2Action.js — Bulletproof Select2, TomSelect, and DataTables Search Execution Handler
 */

const { autoRevealParentContainer } = require('./overlayHandler');
const { unwrapLocator, waitForJQuery, isSelect2Element } = require('../../utils/playwrightHelpers');
const appProfile = require('../../utils/appProfile');

/**
 * Escape special regex characters in a string.
 * @param {string} str - Input string
 * @returns {string} Regex-safe string
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Handle 'search' action with adaptive Select2 typing, spinner wait, and jQuery synchronization.
 */
async function searchSelect2Action({ page, locator, step }) {
  let activeLocator = unwrapLocator(locator, 'evaluate');

  const rawTarget = typeof step.target === 'object' ? step.target?.value || '' : step.target || '';
  const strVal = step.value !== undefined && step.value !== null ? String(step.value).trim() : '';

  if (!activeLocator || !activeLocator.__alreadyResolved) {
    await autoRevealParentContainer(page, activeLocator, rawTarget, 'search');
  }

  // ─── Smart Alias Resolver ───────────────────────────────────────────────────
  // Setiap halaman e-Jatra memiliki dua Set elemen dengan nama mirip:
  //   - Elemen di "Tab: Tabel" (filter toolbar atas tabel) → selector _filter / f_
  //   - Elemen di "Tab: Form"  (field isian form baru)     → selector biasa
  // Jika pengguna meminta filter TABEL, tetapi LLM salah mengirim selector Form,
  // kita deteksi dan otomatis koreksi ke selector filter tabel yang benar.
  const rawTargetLower = String(rawTarget).toLowerCase().trim();
  let resolvedTarget = rawTarget;

  // Peta alias dari konfigurasi profil aplikasi
  const FILTER_MAPS = (appProfile.get('filterFieldMaps', []) || []).map(m => ({
    pattern: m.pattern instanceof RegExp ? m.pattern : new RegExp(m.pattern, 'i'),
    candidates: m.candidates || []
  }));

  for (const alias of FILTER_MAPS) {
    if (alias.pattern.test(rawTargetLower)) {
      const originalVisible = activeLocator
        ? await activeLocator.isVisible().catch(() => false)
        : await page.locator(rawTarget).isVisible().catch(() => false);

      if (!originalVisible) {
        for (const candidate of alias.candidates) {
          const candidateEl = page.locator(candidate).first();
          const candidateVisible = (await candidateEl.count().catch(() => 0)) > 0
            && await candidateEl.isVisible().catch(() => false);
          if (candidateVisible) {
            resolvedTarget = candidate;
            activeLocator = candidateEl;
            break;
          }
        }
      }
      break;
    }
  }

  // Ganti rawTarget dengan yang sudah diresolve
  const effectiveTarget = resolvedTarget;
  // ─── End Smart Alias Resolver ───────────────────────────────────────────────



  const cleanField = String(effectiveTarget)
    .replace(/^[#\.\s]+/, '')
    .replace(/^select\[name=['"]?/, '')
    .replace(/['"]?\]$/, '')
    .replace(/^(f_|filter_|filter\-|sel_|select_)/i, '')
    .replace(/(_filter|-filter|_select|-select|_dropdown|-dropdown|_box)$/i, '')
    .trim();

  // 1. Detect Select2 Container
  const isFilterTarget = String(effectiveTarget).toLowerCase().includes('filter') || /^#?f_/i.test(String(effectiveTarget));
  const fieldTrigger = cleanField ? (isFilterTarget
    ? page.locator(`[id="f_${cleanField}"] + .select2-container .select2-selection, [id="filter_${cleanField}"] + .select2-container .select2-selection, [id="${cleanField}"] + .select2-container .select2-selection`).first()
    : page.locator(`.tab-pane.active [id="${cleanField}"] + .select2-container .select2-selection, .tab-pane.active [id="f_${cleanField}"] + .select2-container .select2-selection, [id="${cleanField}"] + .select2-container .select2-selection, [aria-labelledby*="${cleanField}"], [id*="select2-${cleanField}"], [id="f_${cleanField}"] + .select2-container .select2-selection`).first()
  ) : null;


  const select2Triggers = [
    activeLocator ? activeLocator.locator('.select2-selection') : null,
    activeLocator ? activeLocator.locator('xpath=following-sibling::*[contains(@class, "select2")][1]//span[contains(@class, "select2-selection")]') : null,
    activeLocator ? activeLocator.locator('xpath=following-sibling::span[contains(@class, "select2")]//span[contains(@class, "select2-selection")]') : null,
    activeLocator ? activeLocator.locator('xpath=following-sibling::*[contains(@class, "select2-container")][1]') : null,
    activeLocator ? activeLocator.locator('xpath=parent::*//*[contains(@class, "select2-selection")]') : null,
    fieldTrigger,
    page.locator('.select2-container--open .select2-selection'),
    page.locator('.select2-container .select2-selection'),
    page.locator('span.select2-selection--single, span.select2-selection--multiple'),
    activeLocator
  ].filter(Boolean);

  let targetEl = null;
  for (const trig of select2Triggers) {
    if ((await trig.count().catch(() => 0)) > 0 && (await trig.first().isVisible().catch(() => false))) {
      targetEl = trig.first();
      break;
    }
  }

  if (!targetEl && activeLocator) {
    targetEl = activeLocator;
  }

  const isSelect2 = await isSelect2Element(targetEl);

  if (isSelect2) {
    // 1.5. Wait for any pending jQuery AJAX (e.g. from prior parent field selection) to settle
    await waitForJQuery(page, 10000);

    // 2. Wait for options to be loaded into underlying select if empty or still loading
    const selectTarget = typeof rawTarget === 'string' && rawTarget.startsWith('#') ? rawTarget : null;
    if (selectTarget) {
      await page.waitForFunction(sel => {
        const el = document.querySelector(sel);
        if (!el || !el.options) return true;
        const firstText = (el.options[0]?.text || '').toLowerCase();
        // Hanya tunggu jika memang ada teks 'memuat' / 'loading'
        if (firstText.includes('memuat') || firstText.includes('loading')) return false;
        // Tunggu jika jQuery AJAX masih aktif dan select belum punya opsi
        const hasPendingAjax = window.jQuery && window.jQuery.active > 0;
        if (hasPendingAjax && el.options.length <= 1) return false;
        return true;
      }, selectTarget, { timeout: 3000 }).catch(() => {});
    }

    // 3. Open Select2 dropdown (via click + programmatic open guarantee)
    await targetEl.scrollIntoViewIfNeeded().catch(() => {});
    await targetEl.click({ force: true }).catch(() => {});

    // Programmatic open backup for jQuery Select2
    if (activeLocator) {
      await activeLocator.evaluate(el => {
        const select = el.tagName.toLowerCase() === 'select' ? el : (el.closest('.select2-container')?.previousElementSibling || el.querySelector('select'));
        if (select && (window.jQuery || window.$)) {
          const $ = window.jQuery || window.$;
          if ($.fn && $.fn.select2) {
            $(select).select2('open');
          }
        }
      }).catch(() => {});
    }

    await page.waitForTimeout(100);

    // 4. Locate search input inside open Select2 dropdown
    const searchInput = page.locator('input.select2-search__field:visible, .select2-dropdown input[type="search"]:visible, .select2-container--open input:visible').first();

    if ((await searchInput.count().catch(() => 0)) > 0 && (await searchInput.isVisible().catch(() => false))) {
      await searchInput.fill(strVal);

      await searchInput.evaluate(el => {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('search', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
        const $ = window.jQuery || window.$;
        if ($) $(el).trigger('input').trigger('keyup');
      }).catch(() => {});
    }

    // 5. Adaptive Loading & AJAX Wait
    const loadingSpinner = page.locator('.select2-results__option.loading-results, .select2-results__option--load-more, .select2-results .loading');
    if ((await loadingSpinner.count().catch(() => 0)) > 0) {
      await loadingSpinner.first().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    }

    await page.waitForTimeout(100);

    // 6. Select Result Option (with intelligent punctuation & PT/CV prefix fallback)
    const resultOptions = page.locator('.select2-results__option:not(.loading-results):not([aria-disabled="true"]):not([role="group"]):visible');
    
    // Check if initial search produced valid selectable results
    let hasSelectable = (await resultOptions.count().catch(() => 0)) > 0;
    const cleanVal = strVal.replace(/\b(pt|cv|ud)\.\s*/gi, '$1 ').replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
    const coreVal = strVal.replace(/\b(pt|cv|ud)\.?\s*/gi, '').trim();

    // If 0 options found (e.g. searching "PT." when option has "PT " or vice versa), retry search with variations
    if (!hasSelectable && searchInput && (await searchInput.isVisible().catch(() => false))) {
      const fallbackTerms = [cleanVal, coreVal].filter(t => t && t.toLowerCase() !== strVal.toLowerCase());
      for (const term of fallbackTerms) {
        await searchInput.fill(term);
        await searchInput.evaluate(el => {
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('search', { bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
          const $ = window.jQuery || window.$;
          if ($) $(el).trigger('input').trigger('keyup');
        }).catch(() => {});
        await page.waitForTimeout(150);
        if ((await resultOptions.count().catch(() => 0)) > 0) {
          hasSelectable = true;
          break;
        }
      }
    }

    if (hasSelectable) {
      await resultOptions.first().waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
    }

    let select2Option = resultOptions.filter({ hasText: new RegExp('^\\s*' + escapeRegex(strVal) + '\\s*$', 'i') }).first();
    if ((await select2Option.count().catch(() => 0)) === 0) {
      select2Option = resultOptions.filter({ hasText: new RegExp(escapeRegex(strVal), 'i') }).first();
    }
    if ((await select2Option.count().catch(() => 0)) === 0 && cleanVal) {
      select2Option = resultOptions.filter({ hasText: new RegExp(escapeRegex(cleanVal), 'i') }).first();
    }
    if ((await select2Option.count().catch(() => 0)) === 0 && coreVal) {
      select2Option = resultOptions.filter({ hasText: new RegExp(escapeRegex(coreVal), 'i') }).first();
    }
    if ((await select2Option.count().catch(() => 0)) === 0) {
      select2Option = page.locator('.select2-results__option--highlighted, .select2-results__option.select2-results__option--selectable').first();
    }
    if ((await select2Option.count().catch(() => 0)) === 0) {
      select2Option = resultOptions.first();
    }

    if ((await select2Option.count().catch(() => 0)) > 0 && (await select2Option.isVisible().catch(() => false))) {
      await select2Option.click({ force: true });
      await page.waitForTimeout(100);
    } else {
      await page.keyboard.press('Enter').catch(() => {});
      await page.waitForTimeout(100);
    }

    // 7. Dual-Guarantee Direct Select2 Synchronization on Page
    if (activeLocator) {
      await activeLocator.evaluate((el, { selHint, cleanHint, val, cleanValText, coreValText }) => {
        let selectEl = el.tagName.toLowerCase() === 'select' ? el : (el.closest('.select2-container')?.previousElementSibling || el.querySelector('select'));
        if (!selectEl && selHint && selHint.startsWith('#')) {
          try { selectEl = document.querySelector(selHint); } catch (e) {}
        }
        if (!selectEl && cleanHint) {
          const isFilter = selHint && (selHint.includes('filter') || /^#?f_/i.test(selHint));
          selectEl = document.querySelector(
            isFilter
              ? `[id="f_${cleanHint}"], [id="filter_${cleanHint}"], [id="${cleanHint}"], select[name="${cleanHint}"]`
              : `.tab-pane.active [id="${cleanHint}"], [id="${cleanHint}"], select[name="${cleanHint}"], [id="f_${cleanHint}"], [id="filter_${cleanHint}"]`
          );
        }
        if (!selectEl) {
          const openContainer = document.querySelector('.select2-container--open');
          if (openContainer && openContainer.previousElementSibling && openContainer.previousElementSibling.tagName.toLowerCase() === 'select') {
            selectEl = openContainer.previousElementSibling;
          }
        }
        if (!selectEl || !selectEl.options) return;

        const valLower = (val || '').toLowerCase().trim();
        const cleanLower = (cleanValText || '').toLowerCase().trim();
        const coreLower = (coreValText || '').toLowerCase().trim();

        // Cek apakah nilai saat ini sudah tepat dan tidak kosong
        const currentVal = (selectEl.value || '').trim();
        const currentSelectedOpt = selectEl.options[selectEl.selectedIndex];
        const currentTxt = (currentSelectedOpt?.text || '').toLowerCase().trim();
        if (currentVal && (currentVal.toLowerCase() === valLower || currentTxt === valLower)) {
          return;
        }

        // Filter opsi valid: ABAIKAN opsi placeholder kosong (misal: "Pilih...", "Select...", value="")
        // agar teks "Pilih Ka TAC" tidak secara salah mencocokkan substring "ka tac" dan mengosongkan nilai!
        const opts = Array.from(selectEl.options);
        const validOpts = opts.filter(o => {
          const v = (o.value || '').trim();
          if (!v) return false;
          const txt = (o.text || '').toLowerCase().trim();
          if ((txt.startsWith('pilih') || txt.startsWith('select') || txt.startsWith('--')) && !valLower.startsWith('pilih')) {
            return false;
          }
          return true;
        });

        // Pencarian bertingkat (Tiered Match) pada opsi valid
        // Tier 1: Kecocokan persis (Exact Match)
        let match = validOpts.find(o => {
          const txt = o.text.toLowerCase().trim();
          const v = o.value.toLowerCase().trim();
          return txt === valLower || v === valLower;
        });

        if (!match && cleanLower) {
          match = validOpts.find(o => {
            const txt = o.text.toLowerCase().trim();
            const v = o.value.toLowerCase().trim();
            return txt === cleanLower || v === cleanLower;
          });
        }

        if (!match && coreLower) {
          match = validOpts.find(o => {
            const txt = o.text.toLowerCase().trim();
            const v = o.value.toLowerCase().trim();
            return txt === coreLower || v === coreLower;
          });
        }

        // Tier 2: Awalan (Starts-with)
        if (!match) {
          match = validOpts.find(o => {
            const txt = o.text.toLowerCase().trim();
            const v = o.value.toLowerCase().trim();
            return txt.startsWith(valLower) || v.startsWith(valLower);
          });
        }

        // Tier 3: Substring includes (hanya pada opsi valid yang memiliki value)
        if (!match) {
          match = validOpts.find(o => {
            const txt = o.text.toLowerCase().trim();
            const v = o.value.toLowerCase().trim();
            return txt.includes(valLower) || v.includes(valLower);
          });
        }

        if (!match && cleanLower) {
          match = validOpts.find(o => o.text.toLowerCase().trim().includes(cleanLower) || o.value.toLowerCase().trim().includes(cleanLower));
        }

        if (!match && coreLower) {
          match = validOpts.find(o => o.text.toLowerCase().trim().includes(coreLower) || o.value.toLowerCase().trim().includes(coreLower));
        }

        const $ = (window.jQuery || window.$);

        if (match) {
          selectEl.value = match.value;
          if ($) {
            if ($.fn && $.fn.select2) {
              $(selectEl).val(match.value).trigger('change');
              try {
                $(selectEl).trigger({
                  type: 'select2:select',
                  params: { data: { id: match.value, text: match.text } }
                });
              } catch (e) {}
            } else {
              $(selectEl).trigger('change');
            }
          } else {
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } else {
          // Jika tidak ada opsi yang cocok di DOM (misal Select2 tags: true),
          // buat opsi baru secara dinamis dan set sebagai selected
          const isTagSelect = $ && $(selectEl).data('select2')?.options?.options?.tags;
          if (isTagSelect || (!selectEl.value && val)) {
            const newOpt = new Option(val, val, true, true);
            selectEl.appendChild(newOpt);
            selectEl.value = val;
            if ($) {
              if ($.fn && $.fn.select2) {
                $(selectEl).val(val).trigger('change');
                try {
                  $(selectEl).trigger({
                    type: 'select2:select',
                    params: { data: { id: val, text: val } }
                  });
                } catch (e) {}
              } else {
                $(selectEl).trigger('change');
              }
            } else {
              selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }

        // Picu native events
        selectEl.dispatchEvent(new Event('input', { bubbles: true }));
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      }, { selHint: rawTarget, cleanHint: cleanField, val: strVal, cleanValText: cleanVal, coreValText: coreVal }).catch(() => {});
    }

    // Tunggu request jQuery AJAX yang dipicu oleh event change
    await waitForJQuery(page, 10000);
    await page.waitForTimeout(200);

    // ─── Auto-Wait DataTables Processing ─────────────────────────────────────
    // Hanya tunggu jika target adalah filter tabel (DataTables)
    if (isFilterTarget) {
      try {
        const dtSpinner = page.locator('.dataTables_processing');
        const appeared = await dtSpinner.waitFor({ state: 'visible', timeout: 800 }).then(() => true).catch(() => false);
        if (appeared) {
          await dtSpinner.waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
          await page.waitForTimeout(200);
        }
      } catch (_) {}
    }
    // ─── End Auto-Wait DataTables Processing ─────────────────────────────────

  } else {

    // Native Table Filter / DataTables Search Box
    const activeSearch = page.locator('.dataTables_filter input, input[type="search"]:visible, input.form-control-sm:visible, input[type="text"]:visible').first();
    if ((await activeSearch.count()) > 0) {
      await activeSearch.fill(strVal).catch(async () => {
        await activeSearch.click({ force: true }).catch(() => {});
        await activeSearch.fill(strVal, { force: true }).catch(() => {});
      });
      await activeSearch.evaluate((el, val) => {
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
        if (window.jQuery || window.$) {
          const $ = window.jQuery || window.$;
          $(el).trigger('input').trigger('keyup').trigger('change');
          if ($.fn && $.fn.dataTable) {
            try {
              $('.dataTable, table.dataTable').DataTable().search(val).draw();
            } catch (e) {}
          }
        }
      }, strVal).catch(() => {});

      // ─── Auto-Wait DataTables Processing (native search) ─────────────────
      try {
        const dtSpinner = page.locator('.dataTables_processing');
        const appeared = await dtSpinner.waitFor({ state: 'visible', timeout: 600 }).then(() => true).catch(() => false);
        if (appeared) {
          await dtSpinner.waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
          await page.waitForTimeout(250);
        } else {
          await page.waitForTimeout(250);
        }
      } catch (_) {}
      // ─── End Auto-Wait ────────────────────────────────────────────────────

      // DataTables Fallback: If table is empty and search had "PT." or dots, retry with core term or without dots
      const cleanSearch = strVal.replace(/\b(pt|cv|ud)\.\s*/gi, '$1 ').replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
      const coreSearch = strVal.replace(/\b(pt|cv|ud)\.?\s*/gi, '').trim();
      const fallbackSearch = coreSearch || cleanSearch;
      if (fallbackSearch && fallbackSearch.toLowerCase() !== strVal.toLowerCase()) {
        const emptyTable = page.locator('.dataTables_empty:visible');
        if ((await emptyTable.count().catch(() => 0)) > 0) {
          await activeSearch.fill(fallbackSearch).catch(() => {});
          await activeSearch.evaluate((el, val) => {
            el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
            if (window.jQuery || window.$) {
              const $ = window.jQuery || window.$;
              $(el).trigger('input').trigger('keyup').trigger('change');
              if ($.fn && $.fn.dataTable) {
                try {
                  $('.dataTable, table.dataTable').DataTable().search(val).draw();
                } catch (e) {}
              }
            }
          }, fallbackSearch).catch(() => {});
        }
      }
    }
  }
}

module.exports = {
  searchSelect2Action,
  escapeRegex
};
