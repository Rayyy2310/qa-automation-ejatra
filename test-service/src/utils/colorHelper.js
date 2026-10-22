/**
 * colorHelper.js — RGB Parsing & Color Classification Utility
 * Provides bilingual (Indonesian/English) color name detection from computed CSS.
 */

/**
 * Parse an RGB/RGBA CSS color string into component values.
 * @param {string} str - CSS color string (e.g. 'rgb(255, 0, 0)' or 'rgba(255, 0, 0, 0.5)')
 * @returns {{ r: number, g: number, b: number, a: number }|null}
 */
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

/** @type {number} Threshold for near-zero RGB (black) */
const BLACK_THRESHOLD = 55;
/** @type {number} Threshold for near-max RGB (white) */
const WHITE_THRESHOLD = 245;
/** @type {number} Max channel difference for grayscale detection */
const GRAY_TOLERANCE = 20;
/** @type {number} Grayscale midpoint (below = dark gray, above = white) */
const GRAY_MIDPOINT = 180;

/**
 * Classify RGB values into an Indonesian color name.
 * @param {number} r - Red channel (0-255)
 * @param {number} g - Green channel (0-255)
 * @param {number} b - Blue channel (0-255)
 * @param {number} [a=1.0] - Alpha channel (0-1)
 * @returns {string} Indonesian color name
 */
function classifyRgb(r, g, b, a = 1.0) {
  if (a !== undefined && a < 0.1) return 'transparan';
  if (r < BLACK_THRESHOLD && g < BLACK_THRESHOLD && b < BLACK_THRESHOLD) return 'hitam';
  if (r > WHITE_THRESHOLD && g > WHITE_THRESHOLD && b > WHITE_THRESHOLD) return 'putih';
  if (Math.abs(r - g) < GRAY_TOLERANCE && Math.abs(g - b) < GRAY_TOLERANCE && Math.abs(r - b) < GRAY_TOLERANCE) {
    return r < GRAY_MIDPOINT ? 'abu-abu' : 'putih';
  }
  if (r > 170 && g > 150 && b < 140) return 'kuning';
  if (r > 130 && r > g * 1.25 && r > b * 1.25) return 'merah';
  if (g > 110 && g > r * 1.15 && g > b * 1.15) return 'hijau';
  if (b > 120 && b > r * 1.15) return 'biru';
  return 'abu-abu';
}

module.exports = {
  parseRgb,
  classifyRgb
};
