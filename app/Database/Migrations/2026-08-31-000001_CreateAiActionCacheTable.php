<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateAiActionCacheTable extends Migration
{
    public function up()
    {
        // 1. ai_action_cache — Caching selector yang sudah terbukti sukses & self-healing
        $this->forge->addField([
            'id'                => ['type' => 'INT', 'constraint' => 11, 'auto_increment' => true],
            'page_url'          => ['type' => 'VARCHAR', 'constraint' => 255],
            'action_type'       => ['type' => 'VARCHAR', 'constraint' => 50],
            'intent_keyword'    => ['type' => 'VARCHAR', 'constraint' => 150],
            'resolved_selector' => ['type' => 'VARCHAR', 'constraint' => 500],
            'widget_type'       => ['type' => 'VARCHAR', 'constraint' => 50, 'default' => 'native'],
            'hit_count'         => ['type' => 'INT', 'constraint' => 11, 'default' => 1],
            'last_used_at'      => ['type' => 'DATETIME', 'null' => true],
            'created_at'        => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['page_url', 'intent_keyword', 'action_type']);
        $this->forge->createTable('ai_action_cache', true);

        // 2. Tambah kolom form_block_name & badge_colors ke ai_page_element jika belum ada
        $fieldsToAdd = [];
        if (!$this->db->fieldExists('form_block_name', 'ai_page_element')) {
            $fieldsToAdd['form_block_name'] = [
                'type'       => 'VARCHAR',
                'constraint' => 255,
                'null'       => true,
                'after'      => 'page_title'
            ];
        }
        if (!$this->db->fieldExists('badge_colors', 'ai_page_element')) {
            $fieldsToAdd['badge_colors'] = [
                'type'       => 'TEXT',
                'null'       => true,
                'after'      => 'table_row_count',
                'comment'    => 'JSON list of badge/status colors detected in table rows'
            ];
        }
        if (!empty($fieldsToAdd)) {
            $this->forge->addColumn('ai_page_element', $fieldsToAdd);
        }
    }

    public function down()
    {
        $this->forge->dropTable('ai_action_cache', true);
        if ($this->db->fieldExists('form_block_name', 'ai_page_element')) {
            $this->forge->dropColumn('ai_page_element', ['form_block_name', 'badge_colors']);
        }
    }
}
