<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

class CreateAiTestTables extends Migration
{
    public function up()
    {
        // 1. ai_test_module
        $this->forge->addField([
            'id'         => ['type' => 'INT', 'constraint' => 11, 'auto_increment' => true],
            'code'       => ['type' => 'VARCHAR', 'constraint' => 50, 'unique' => true],
            'name'       => ['type' => 'VARCHAR', 'constraint' => 100],
            'base_url'   => ['type' => 'VARCHAR', 'constraint' => 255],
            'status'     => ['type' => 'ENUM', 'constraint' => ['active', 'inactive'], 'default' => 'active'],
            'created_at' => ['type' => 'DATETIME', 'null' => true],
            'updated_at' => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->createTable('ai_test_module');

        // 2. ai_test_case
        $this->forge->addField([
            'id'              => ['type' => 'INT', 'constraint' => 11, 'auto_increment' => true],
            'module_id'       => ['type' => 'INT', 'constraint' => 11],
            'test_name'       => ['type' => 'VARCHAR', 'constraint' => 255],
            'prompt'          => ['type' => 'TEXT'],
            'expected_result' => ['type' => 'TEXT', 'null' => true],
            'mode'            => ['type' => 'ENUM', 'constraint' => ['read_only', 'write_test'], 'default' => 'read_only'],
            'test_plan_json'  => ['type' => 'LONGTEXT', 'null' => true],
            'llm_provider'    => ['type' => 'VARCHAR', 'constraint' => 50, 'null' => true],
            'llm_model'       => ['type' => 'VARCHAR', 'constraint' => 100, 'null' => true],
            'status'          => ['type' => 'ENUM', 'constraint' => ['active', 'inactive'], 'default' => 'active'],
            'created_at'      => ['type' => 'DATETIME', 'null' => true],
            'updated_at'      => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addForeignKey('module_id', 'ai_test_module', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('ai_test_case');

        // 3. ai_test_run
        $this->forge->addField([
            'id'                => ['type' => 'INT', 'constraint' => 11, 'auto_increment' => true],
            'test_case_id'      => ['type' => 'INT', 'constraint' => 11],
            'test_plan_json'    => ['type' => 'LONGTEXT'],
            'llm_provider'      => ['type' => 'VARCHAR', 'constraint' => 50, 'null' => true],
            'llm_model'         => ['type' => 'VARCHAR', 'constraint' => 100, 'null' => true],
            'environment'       => ['type' => 'VARCHAR', 'constraint' => 50, 'default' => 'testing'],
            'mode'              => ['type' => 'ENUM', 'constraint' => ['read_only', 'write_test'], 'default' => 'read_only'],
            'status'            => ['type' => 'ENUM', 'constraint' => ['QUEUED', 'RUNNING', 'PASSED', 'FAILED', 'CANCELLED'], 'default' => 'QUEUED'],
            'total_steps'       => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'passed_steps'      => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'failed_steps'      => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'skipped_steps'     => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'total_duration_ms' => ['type' => 'INT', 'constraint' => 11, 'null' => true],
            'started_at'        => ['type' => 'DATETIME', 'null' => true],
            'finished_at'       => ['type' => 'DATETIME', 'null' => true],
            'created_by'        => ['type' => 'VARCHAR', 'constraint' => 100, 'null' => true],
            'created_at'        => ['type' => 'DATETIME', 'null' => true],
            'updated_at'        => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addForeignKey('test_case_id', 'ai_test_case', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('ai_test_run');

        // 4. ai_test_run_detail
        $this->forge->addField([
            'id'                    => ['type' => 'INT', 'constraint' => 11, 'auto_increment' => true],
            'test_run_id'           => ['type' => 'INT', 'constraint' => 11],
            'step_no'               => ['type' => 'INT', 'constraint' => 11],
            'action'                => ['type' => 'VARCHAR', 'constraint' => 50],
            'target_json'           => ['type' => 'TEXT', 'null' => true],
            'value'                 => ['type' => 'TEXT', 'null' => true],
            'wait_before_json'      => ['type' => 'TEXT', 'null' => true],
            'post_action_wait_json' => ['type' => 'TEXT', 'null' => true],
            'expected_result'       => ['type' => 'TEXT', 'null' => true],
            'result'                => ['type' => 'ENUM', 'constraint' => ['PASS', 'FAIL', 'SKIPPED'], 'null' => true],
            'error'                 => ['type' => 'TEXT', 'null' => true],
            'error_category'        => ['type' => 'ENUM', 'constraint' => ['element_not_found', 'timeout_waiting_condition', 'assertion_failed', 'network_error', 'action_rejected_not_whitelisted'], 'null' => true],
            'retry_count'           => ['type' => 'INT', 'constraint' => 11, 'default' => 0],
            'duration_ms'           => ['type' => 'INT', 'constraint' => 11, 'null' => true],
            'screenshot'            => ['type' => 'VARCHAR', 'constraint' => 500, 'null' => true],
            'dom_snapshot'          => ['type' => 'LONGTEXT', 'null' => true],
            'created_at'            => ['type' => 'DATETIME', 'null' => true],
            'updated_at'            => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addForeignKey('test_run_id', 'ai_test_run', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('ai_test_run_detail');
    }

    public function down()
    {
        $this->forge->dropTable('ai_test_run_detail', true);
        $this->forge->dropTable('ai_test_run', true);
        $this->forge->dropTable('ai_test_case', true);
        $this->forge->dropTable('ai_test_module', true);
    }
}
