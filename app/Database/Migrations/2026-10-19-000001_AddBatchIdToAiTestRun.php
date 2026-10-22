<?php

namespace App\Database\Migrations;

use CodeIgniter\Database\Migration;

/**
 * Batch Runner — menambahkan batch_id pada ai_test_run.
 *
 * Satu batch = sekumpulan run (skenario tersimpan) yang dijalankan bersamaan
 * (maks MAX_CONCURRENT_RUNS paralel, sisanya diantre oleh Node test-service).
 * Kolom NULLABLE sehingga run tunggal lama tidak terpengaruh. Idempoten.
 */
class AddBatchIdToAiTestRun extends Migration
{
    private const TABLE = 'ai_test_run';

    public function up()
    {
        $db = $this->db;

        if (!$db->fieldExists('batch_id', self::TABLE)) {
            $this->forge->addColumn(self::TABLE, [
                'batch_id' => [
                    'type'       => 'VARCHAR',
                    'constraint' => 40,
                    'null'       => true,
                    'default'    => null,
                    'comment'    => 'Pengelompokan run dari Batch Runner',
                ],
                'headless' => [
                    'type'       => 'TINYINT',
                    'constraint' => 1,
                    'default'    => 0,
                    'comment'    => '1 = headless, 0 = visual',
                ],
            ]);
            $db->query('CREATE INDEX idx_ai_test_run_batch_id ON ' . self::TABLE . ' (batch_id)');
        }
    }

    public function down()
    {
        if ($this->db->fieldExists('batch_id', self::TABLE)) {
            $this->forge->dropColumn(self::TABLE, ['batch_id', 'headless']);
        }
    }
}
