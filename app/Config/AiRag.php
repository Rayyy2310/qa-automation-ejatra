<?php

namespace Config;

use CodeIgniter\Config\BaseConfig;

/**
 * AiRag — Konfigurasi heuristik retrieval Ground Truth (RAG).
 *
 * Semua data domain (sinonim menu, pola intent, kuota per state) dipusatkan di sini
 * agar AiPageElementModel hanya berisi logika, bukan data. Ubah nilai di sini
 * untuk menyesuaikan perilaku RAG tanpa menyentuh kode model.
 */
class AiRag extends BaseConfig
{
    /**
     * Sinonim keyword -> istilah yang dicari pada segmen menu_path.
     *
     * @var array<string, list<string>>
     */
    public array $synonyms = [
        'po'        => ['purchaseorder', 'purchase order', 'order'],
        'spm'       => ['spm'],
        'spb'       => ['spb', 'surat pengantar'],
        'kps'       => ['lap kps', 'kps'],
        'btu'       => ['btu', 'lap btu'],
        'fp'        => ['faktur pajak'],
        'um'        => ['uang muka'],
        'addendum'  => ['pengajuanaddendum', 'addendum'],
        'timbangan' => ['timbangan spb', 'timbangan'],
        'konsol'    => ['konsol spb', 'konsol'],
        'realisasi' => ['realisasi spb', 'spb kwt', 'real-spb-kwt', 'realisasi-spb', 'realisasi'],
    ];

    /**
     * Pola regex deteksi intent dari prompt (sudah lowercase & whitespace-normalized).
     *
     * @var array<string, string>
     */
    public array $patterns = [
        // Kata "input" yang merupakan bagian nama menu (mis. "submenu input SPB") bukan intent isi form
        'navInputStrip' => '/\b(sub\s*menu|menu|halaman|modul|ke|buka|klik|masuk)\s+input\b/i',
        'formTab'       => '/\b([a-z0-9_]*form[a-z0-9_]*-tab|tab\s*form|tab\s*input|form)\b/i',
        'tableTab'      => '/\b([a-z0-9_]*(?:tabel|table|data)[a-z0-9_]*-tab|tab\s*(?:tabel|table|data)|tabel|table)\b/i',
        'report'        => '/\b(cetak|laporan|export|print|report|download|pdf|excel)\b/i',
        'create'        => '/\b(buat|tambah|input|baru|simpan|create|new|isi|pilih|ketik|masukkan|lengkapi)\b/i',
        'createExclude' => '/\b(tampilkan\s+entri|entri\s+sebanyak|jumlah\s+entri)\b/i',
        'modal'         => '/\b(modal|popup|dialog|cari|browse|lookup|pilih|pilihkan|po|spm|spb|tiket|dokumen|referensi)\b/i',
        'rowAction'     => '/\b(edit|ubah|aksi|baris|row|hapus|delete|batal|nonaktifkan|lihat|view|detail)\b/i',
    ];

    /**
     * Rencana urutan state & kuota elemen per intent.
     * Nilai 'modal' berupa [kuota_jika_modal_disebut, kuota_jika_tidak]; 'modal' => int untuk kuota tetap.
     *
     * @var array<string, array{priority: list<string>, quotas: array<string, int|array{0:int,1:int}>}>
     */
    public array $statePlans = [
        'default' => [
            'priority' => ['tabel', 'row_action', 'modal', 'form'],
            'quotas'   => ['tabel' => 30, 'form' => 0, 'modal' => [15, 0], 'row_action' => 10],
        ],
        'form' => [
            'priority' => ['form', 'modal', 'tabel', 'row_action'],
            'quotas'   => ['form' => 40, 'modal' => [15, 10], 'tabel' => 15, 'row_action' => 5],
        ],
        'report' => [
            'priority' => ['modal', 'tabel', 'form', 'row_action'],
            'quotas'   => ['modal' => 35, 'tabel' => 20, 'form' => 10, 'row_action' => 5],
        ],
        'rowAction' => [
            'priority' => ['row_action', 'tabel', 'form', 'modal'],
            'quotas'   => ['row_action' => 25, 'tabel' => 25, 'form' => 10, 'modal' => [10, 5]],
        ],
    ];

    /** Skor halaman >= nilai ini => hanya ambil halaman #1. */
    public int $dominantScore = 100;

    /** Selisih skor #1 dan #2 >= nilai ini => hanya ambil halaman #1. */
    public int $dominantGap = 10;

    /** Kategori elemen yang boleh masuk RAG (query utama). */
    public array $actionableCategories = ['input', 'dropdown', 'button', 'table', 'row_action', 'heading'];

    /** Kategori elemen pada backfill (tanpa heading). */
    public array $backfillCategories = ['input', 'dropdown', 'button', 'table', 'row_action'];
}
