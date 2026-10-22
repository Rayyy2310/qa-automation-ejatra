// Inventaris hardcode aplikasi di runner. Jalankan: node scripts/audit-hardcode.js [--json] [--check]
// --check : exit 1 bila ada hardcode di luar baseline (dipakai sebagai guard Fase 5.5)
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['src/runner', 'src/utils', 'src/scanner'];
// Konfigurasi/helper yang memang tempat data -> dikecualikan
const EXCLUDE_FILES = new Set(['appProfile.js', 'constants.js']);

const ID_RX = /['"`](#[A-Za-z_][A-Za-z0-9_-]*)/g;
// Penanda khusus aplikasi e-Jatra (class/atribut/teks) selain #id
const APP_TOKENS = [
  'btn-pilih-po', 'btn-pilih-rk', 'btn-pilih-kontrak', 'btn-ubah-harga', 'btn-toggle-status',
  'btn-aktifkan', 'btn-batalkan', 'btn-hapus', 'btn-edit', 'btn-cetak', 'btn-view',
  'spm-type-card', 'addDeliveryItem', 'removeRow', 'chk-spm', 'dp-portal-fix',
  'Verifikasi Sekarang', 'tabel_spm_aspal', 'tbl_kontrak', 'table_po_aspal', 'add-task',
  'data-po-id', 'details-control',
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js') && !EXCLUDE_FILES.has(e.name)) out.push(p);
  }
  return out;
}

const findings = [];
for (const d of DIRS) {
  for (const file of walk(path.join(ROOT, d))) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return; // abaikan komentar
      const hits = new Set();
      let m;
      ID_RX.lastIndex = 0;
      while ((m = ID_RX.exec(line))) hits.add(m[1]);
      for (const tok of APP_TOKENS) if (line.includes(tok)) hits.add(tok);
      if (hits.size) findings.push({ file: rel, line: i + 1, tokens: [...hits], text: t.slice(0, 140) });
    });
  }
}

const byFile = {};
for (const f of findings) (byFile[f.file] = byFile[f.file] || []).push(f);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(findings, null, 2));
} else {
  const uniq = new Set(findings.flatMap(f => f.tokens));
  console.log(`Total baris dengan hardcode: ${findings.length} | token unik: ${uniq.size}\n`);
  for (const [file, arr] of Object.entries(byFile).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${file}  (${arr.length} baris)`);
    if (process.argv.includes('--verbose')) arr.forEach(f => console.log(`  L${f.line} [${f.tokens.join(' ')}] ${f.text}`));
  }
}

if (process.argv.includes('--check')) {
  const baselinePath = path.join(ROOT, 'scripts', 'hardcode-baseline.json');
  const baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : { max: 0 };
  console.log(`\nBaseline maksimum: ${baseline.max} | Sekarang: ${findings.length}`);
  if (findings.length > baseline.max) {
    console.error('GAGAL: hardcode bertambah. Pindahkan ke src/config/app-profile.json.');
    process.exit(1);
  }
  console.log('OK: hardcode tidak bertambah.');
}
