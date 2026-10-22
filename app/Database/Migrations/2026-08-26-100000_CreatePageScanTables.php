<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreatePageScanTables extends Migration
{
    public function up()
    {
        // 1. ai_page_scan — Header per sesi scan
        $this->forge->addField([
            'id'             => ['type' => 'INT', 'constraint' => 11, 'auto_increment' => true],
            'scan_status'    => ['type' => 'ENUM', 'constraint' => ['running', 'completed', 'failed'], 'default' => 'running'],
            'base_url'       => ['type' => 'VARCHAR', 'constraint' => 255],
            'total_pages'    => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'total_elements' => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'duration_ms'    => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'scanned_by'     => ['type' => 'VARCHAR', 'constraint' => 100, 'default' => 'system'],
            'error_log'      => ['type' => 'TEXT', 'null' => true],
            'created_at'     => ['type' => 'DATETIME', 'null' => true],
            'completed_at'   => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['scan_status', 'id']);
        $this->forge->createTable('ai_page_scan');

        // 2. ai_page_element — Hasil scan per elemen per halaman
        $this->forge->addField([
            'id'               => ['type' => 'INT', 'constraint' => 11, 'auto_increment' => true],
            'scan_id'          => ['type' => 'INT', 'constraint' => 11],
            'menu_path'        => ['type' => 'VARCHAR', 'constraint' => 500],
            'page_url'         => ['type' => 'VARCHAR', 'constraint' => 500],
            'page_title'       => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
            'element_category' => ['type' => 'ENUM', 'constraint' => ['input', 'button', 'dropdown', 'table', 'heading', 'link', 'tab']],
            'tag_name'         => ['type' => 'VARCHAR', 'constraint' => 50],
            'element_name'     => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
            'element_id'       => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
            'element_type'     => ['type' => 'VARCHAR', 'constraint' => 50, 'null' => true],
            'label_text'       => ['type' => 'VARCHAR', 'constraint' => 500, 'null' => true],
            'placeholder'      => ['type' => 'VARCHAR', 'constraint' => 500, 'null' => true],
            'button_text'      => ['type' => 'VARCHAR', 'constraint' => 255, 'null' => true],
            'widget_type'      => ['type' => 'ENUM', 'constraint' => ['native', 'select2', 'tomselect', 'datepicker', 'sweetalert', 'datatable', 'other'], 'default' => 'native'],
            'css_selector'     => ['type' => 'VARCHAR', 'constraint' => 500, 'null' => true],
            'table_headers'    => ['type' => 'TEXT', 'null' => true],
            'table_row_count'  => ['type' => 'INT', 'constraint' => 11, 'null' => true],
            'is_visible'       => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 1],
            'is_required'      => ['type' => 'TINYINT', 'constraint' => 1, 'default' => 0],
            'options_sample'   => ['type' => 'TEXT', 'null' => true, 'comment' => 'JSON array sample options for dropdowns'],
            'created_at'       => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['scan_id', 'element_category']);
        $this->forge->addForeignKey('scan_id', 'ai_page_scan', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('ai_page_element');
    }

    public function down()
    {
        $this->forge->dropTable('ai_page_element', true);
        $this->forge->dropTable('ai_page_scan', true);
    }
}
