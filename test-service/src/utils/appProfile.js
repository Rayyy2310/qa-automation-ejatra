'use strict';
/**
 * Loader profil aplikasi. Semua selector spesifik aplikasi dibaca dari
 * src/config/app-profile.json (atau env APP_PROFILE_PATH) agar kode runner generik.
 * Key yang hilang di profil custom jatuh ke default bawaan file JSON.
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_PATH = path.join(__dirname, '..', 'config', 'app-profile.json');

function load() {
    let base = {};
    try { base = JSON.parse(fs.readFileSync(DEFAULT_PATH, 'utf8')); } catch (_) { /* default kosong */ }
    const custom = process.env.APP_PROFILE_PATH;
    if (custom) {
        try { base = { ...base, ...JSON.parse(fs.readFileSync(custom, 'utf8')) }; } catch (_) { /* abaikan */ }
    }
    return base;
}

const profile = load();

/** Ambil nilai profil; fallback bila key tidak ada. */
function get(key, fallback = '') {
    const v = profile[key];
    return v === undefined || v === null ? fallback : v;
}

module.exports = { profile, get };
