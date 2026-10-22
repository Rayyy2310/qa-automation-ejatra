<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Fase 1 — Skema state-aware untuk ai_page_element.
 *
 * Semua kolom baru NULLABLE / punya DEFAULT sehingga:
 *  - scanner lama tetap bisa menyimpan data (kolom baru terisi default),
 *  - data scan yang sudah ada tetap utuh (state_tag otomatis 'tabel'),
 *  - kode lama yang tidak mengenal kolom ini tidak terpengaruh.
 *
 * Idempoten: kolom/index yang sudah ada dilewati.
 */
class AddStateAwareColumnsToAiPageElement extends Migration
{
    private const TABLE = 'ai_page_element';

    /** @var array<string, array<string, mixed>> */
    private function columns(): array
    {
        return [
            'state_tag' => [
                'type' => 'VARCHAR', 'constraint' => 20, 'default' => 'tabel',
                'comment' => 'tabel|form|modal|row_action|dynamic_dialog',
                'after' => 'form_block_name',
            ],
            'trigger_selector' => [
                'type' => 'VARCHAR', 'constraint' => 255, 'null' => true,
                'comment' => 'Selector yang memunculkan state ini (mis. #btnTambah)',
                'after' => 'state_tag',
            ],
            'trigger_text' => [
                'type' => 'VARCHAR', 'constraint' => 150, 'null' => true,
                'comment' => 'Teks pemicu untuk deskripsi ke LLM',
                'after' => 'trigger_selector',
            ],
            'aria_label' => [
                'type' => 'VARCHAR', 'constraint' => 200, 'null' => true,
                'after' => 'button_text',
            ],
            'title_attr' => [
                'type' => 'VARCHAR', 'constraint' => 200, 'null' => true,
                'after' => 'aria_label',
            ],
            'icon_hint' => [
                'type' => 'VARCHAR', 'constraint' => 80, 'null' => true,
                'comment' => 'Hasil normalisasi class ikon: trash, eye, pencil, print, plus',
                'after' => 'title_attr',
            ],
            'requires_json' => [
                'type' => 'TEXT', 'null' => true,
                'comment' => 'JSON array selector prasyarat yang harus terisi lebih dulu',
                'after' => 'options_sample',
            ],
            'is_disabled_initial' => [
                'type' => 'TINYINT', 'constraint' => 1, 'default' => 0,
                'comment' => '1 = disabled saat state terbuka (indikasi fitur bersyarat)',
                'after' => 'requires_json',
            ],
            'is_readonly' => [
                'type' => 'TINYINT', 'constraint' => 1, 'default' => 0,
                'comment' => '1 = field display-only, tidak dikirim ke LLM kecuali disebut prompt',
                'after' => 'is_disabled_initial',
            ],
            'scan_quality' => [
                'type' => 'VARCHAR', 'constraint' => 30, 'null' => true,
                'comment' => 'mis. table_empty|unlabeled; NULL = normal',
                'after' => 'is_readonly',
            ],
        ];
    }

    public function up()
    {
        $existing = $this->db->getFieldNames(self::TABLE);

        $toAdd = [];
        foreach ($this->columns() as $name => $def) {
            if (!in_array($name, $existing, true)) {
                $toAdd[$name] = $def;
            }
        }
        if ($toAdd !== []) {
            $this->forge->addColumn(self::TABLE, $toAdd);
        }

        // Index pencarian per state (tanpa menu_path agar ukuran key kecil).
        $indexes = array_column($this->db->query('SHOW INDEX FROM ' . self::TABLE)->getResultArray(), 'Key_name');
        if (!in_array('idx_scan_state', $indexes, true)) {
            $this->db->query('CREATE INDEX idx_scan_state ON ' . self::TABLE . ' (scan_id, state_tag)');
        }
    }

    public function down()
    {
        $indexes = array_column($this->db->query('SHOW INDEX FROM ' . self::TABLE)->getResultArray(), 'Key_name');
        if (in_array('idx_scan_state', $indexes, true)) {
            $this->db->query('DROP INDEX idx_scan_state ON ' . self::TABLE);
        }

        $existing = $this->db->getFieldNames(self::TABLE);
        $drop = array_values(array_intersect(array_keys($this->columns()), $existing));
        if ($drop !== []) {
            $this->forge->dropColumn(self::TABLE, $drop);
        }
    }
}
