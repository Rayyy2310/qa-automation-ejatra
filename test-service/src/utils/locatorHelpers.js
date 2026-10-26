/**
 * locatorHelpers.js — Pure Utility Functions for Locator Resolution
 *
 * Berisi fungsi-fungsi stateless yang tidak memerlukan Playwright page object:
 * - isSelectorString    : deteksi apakah string adalah CSS/XPath selector
 * - normalizeText       : normalisasi teks untuk perbandingan
 * - stripActionFluff    : hapus kata "tombol", "klik", dll dari target
 * - getSynonyms         : expand kata ke sinonim bilingual (ID ↔ EN)
 * - matchesKeywords     : pencocokan keyword dengan sinonim
 *
 * Dipecah dari locatorResolver.js (baris 1-141 + konstanta MODAL_CONTAINER_SELECTOR)
 * agar bisa di-require tanpa menarik dependency Playwright ke module lain.
 */

const BILINGUAL_SYNONYMS = require('../config/synonyms.json');

// ---------------------------------------------------------------------------
// KONSTANTA BERSAMA
// ---------------------------------------------------------------------------

/**
 * Selector CSS untuk mendeteksi modal dialog yang sedang terbuka di halaman.
 * Dipakai oleh resolveLocatorWithFallback & pickBestInteractiveCandidate.
 */
const MODAL_CONTAINER_SELECTOR = [
  '.modal.show:visible',
  '.modal.in:visible',
  '.modal:visible',
  '.modal-dialog:visible',
  '[role="dialog"]:visible',
  'div[id*="modal" i]:visible',
  '.swal2-container:visible',
  '.swal2-popup:visible',
  '.bootbox:visible'
].join(', ');

// ---------------------------------------------------------------------------
// FUNGSI UTILITY
// ---------------------------------------------------------------------------

/**
 * Deteksi apakah string adalah CSS selector, XPath, atau Playwright selector —
 * bukan teks natural bahasa manusia.
 *
 * @param {string} str
 * @returns {boolean}
 */
function isSelectorString(str) {
  if (!str || typeof str !== 'string') return false;
  const s = str.trim();
  if (!s) return false;
  return (
    s.startsWith('#') ||
    s.startsWith('.') ||
    s.startsWith('[') ||
    s.startsWith('//') ||
    s.startsWith('xpath=') ||
    s.includes(':has-text(') ||
    s.includes(' > ') ||
    s.includes(' + ') ||
    s.includes(' ~ ') ||
    s.includes('[name=') ||
    s.includes('[id=') ||
    s.includes('[type=') ||
    s.includes('[class=') ||
    s.includes(':visible') ||
    s.includes(':not(') ||
    s.includes(',') ||
    /^(button|a|input|select|textarea|div|span|form|label|table|tr|td|th)\b/i.test(s)
  );
}

/**
 * Normalisasi teks: hapus simbol khusus, lowercase, trim, collapse whitespace.
 *
 * @param {string} text
 * @returns {string}
 */
function normalizeText(text) {
  return (text || '')
    .replace(/[•\-\*\>\|\#\:\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Strip kata-kata fluff dari prompt LLM seperti:
 * - "tombol bertuliskan 'X'" → "X"
 * - "klik tombol X" → "X"
 * - "tombol dengan teks/label X" → "X"
 * - wrapping quotes → dihilangkan
 *
 * Tidak mengubah string yang sudah berupa CSS/XPath selector.
 *
 * @param {string} text
 * @returns {string}
 */
function stripActionFluff(text) {
  if (!text || typeof text !== 'string') return text;
  let s = text.trim();
  if (!s) return s;

  // Langsung kembalikan jika sudah berupa selector teknis
  if (
    s.startsWith('#') ||
    s.startsWith('.') ||
    s.startsWith('[') ||
    s.startsWith('//') ||
    s.startsWith('xpath=') ||
    s.includes(':has-text(') ||
    s.includes(' > ') ||
    /^(button|a|input|select|textarea|label|table|tr|td|th)\b/i.test(s)
  ) {
    return s;
  }

  // Hapus tanda kutip pembungkus
  s = s.replace(/^["'`](.*)["`']$/, '$1').trim();

  const fluffPatterns = [
    /^(?:klik|tekan|pencet|pilih)?\s*(?:tombol|button|btn)\s+(?:bertuliskan|dengan\s+tulisan|dengan\s+teks|teks|label|bernama)\s+["'`](.+?)["'`]$/i,
    /^(?:klik|tekan|pencet|pilih)?\s*(?:tombol|button|btn)\s+(?:bertuliskan|dengan\s+tulisan|dengan\s+teks|teks|label|bernama)\s+(.+)$/i,
    /^(?:klik|tekan|pencet|pilih)?\s*(?:tombol|button|btn)\s+["'`](.+?)["'`]$/i,
    /^(?:klik|tekan|pencet|pilih)?\s*(?:tombol|button|btn)\s+(.+)$/i,
    /^(?:klik|tekan|pencet)\s+["'`](.+?)["'`]$/i,
    /^(?:klik|tekan|pencet)\s+(.+)$/i,
  ];

  for (const pat of fluffPatterns) {
    const m = s.match(pat);
    if (m && m[1] && m[1].trim()) {
      let candidate = m[1].trim();
      candidate = candidate.replace(/^["'`](.*)["`']$/, '$1').trim();
      if (candidate.length > 0) return candidate;
    }
  }

  return s;
}

/**
 * Expand satu kata/frasa ke semua sinonim bilingual (Indonesia ↔ Inggris).
 * Menggunakan kamus dari config/synonyms.json.
 *
 * @param {string} phrase
 * @returns {string[]} Array sinonim unik
 */
function getSynonyms(phrase) {
  const norm = normalizeText(phrase);
  const words = norm.split(' ').filter(w => w.length > 1);
  const result = new Set([norm, phrase.trim()]);

  words.forEach(w => {
    if (BILINGUAL_SYNONYMS[w]) {
      BILINGUAL_SYNONYMS[w].forEach(syn => {
        result.add(syn);
        result.add(norm.replace(w, syn));
      });
    }
  });

  return Array.from(result);
}

/**
 * Cek apakah string `candidate` mengandung semua kata dari `target`,
 * termasuk menggunakan sinonim bilingual.
 *
 * @param {string} candidate
 * @param {string} target
 * @returns {boolean}
 */
function matchesKeywords(candidate, target) {
  const normCandidate = normalizeText(candidate);
  const normTarget = normalizeText(target);

  if (!normCandidate || !normTarget) return false;
  if (normCandidate.includes(normTarget)) return true;

  const targetWords = normTarget.split(' ').filter(w => w.length > 1);
  if (targetWords.length === 0) return false;

  return targetWords.every(word => {
    if (normCandidate.includes(word)) return true;
    const syns = BILINGUAL_SYNONYMS[word] || [];
    return syns.some(s => normCandidate.includes(s));
  });
}

/**
 * Escape karakter spesial RegExp pada string.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeRegExp(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Cari baris tabel (<tr>) terbaik berdasarkan rowKey dengan 3 tingkat presisi:
 * - Tier 1 (Exact Cell Match): ada <td> atau <th> yang teks penuhnya persis sama dengan rowKey
 * - Tier 2 (Token Boundary Match): teks baris memuat rowKey sebagai token utuh (tidak diikuti -A, _1, /B, atau karakter kode lainnya)
 * - Tier 3 (Substring Fallback): fallback substring biasa jika Tier 1 & 2 tidak menemukan baris
 *
 * Mencegah bug salah pilih baris bersufiks (misal mencari "SMA00020260014" tapi memilih "SMA00020260014-A" di atasnya).
 *
 * @param {import('playwright').Page | import('playwright').Locator} container
 * @param {string} rowKey
 * @param {string} [rowSelector='tbody tr, tr']
 * @returns {Promise<import('playwright').Locator>}
 */
async function findBestMatchingRow(container, rowKey, rowSelector = 'tbody tr, tr') {
  const cleanKey = String(rowKey || '').replace(/^[#\.\s]+/, '').trim();
  if (!cleanKey) {
    return container.locator(rowSelector).first();
  }

  const escaped = escapeRegExp(cleanKey);
  const exactCellRegex = new RegExp(`^\\s*${escaped}\\s*$`, 'i');
  const tokenBoundaryRegex = new RegExp(`(?:^|[^A-Za-z0-9\\-_\\/])${escaped}(?![A-Za-z0-9\\-_\\/])`, 'i');

  try {
    // Tier 1: Exact Cell Match pada <td> atau <th>
    const exactTdRow = container
      .locator(rowSelector)
      .filter({ has: container.locator('td, th', { hasText: exactCellRegex }) })
      .first();
    if ((await exactTdRow.count().catch(() => 0)) > 0) {
      return exactTdRow;
    }

    // Tier 2: Token Boundary Match pada baris (menolak sufiks seperti -A, -1, /REV)
    const boundaryRow = container
      .locator(rowSelector)
      .filter({ hasText: tokenBoundaryRegex })
      .first();
    if ((await boundaryRow.count().catch(() => 0)) > 0) {
      return boundaryRow;
    }
  } catch (_) {}

  // Tier 3: Substring Fallback
  return container.locator(rowSelector).filter({ hasText: cleanKey }).first();
}

module.exports = {
  MODAL_CONTAINER_SELECTOR,
  isSelectorString,
  normalizeText,
  stripActionFluff,
  getSynonyms,
  matchesKeywords,
  escapeRegExp,
  findBestMatchingRow,
};
