<?php

namespace App\Database\Seeds;

use CodeIgniter\Database\Seeder;

class AiTestModuleSeeder extends Seeder
{
    public function run()
    {
        $data = [
            [
                'code'     => 'aspal',
                'name'     => 'Aspal',
                'base_url' => 'http://localhost:8080',
            ],
            [
                'code'     => 'kendaraan',
                'name'     => 'Kendaraan',
                'base_url' => 'http://localhost:8080',
            ],
            [
                'code'     => 'aset',
                'name'     => 'Aset',
                'base_url' => 'http://localhost:8080',
            ],
            [
                'code'     => 'tabung',
                'name'     => 'Tabung',
                'base_url' => 'http://localhost:8080',
            ],
            [
                'code'     => 'he',
                'name'     => 'Heavy Equipment (HE)',
                'base_url' => 'http://localhost:8080',
            ],
        ];

        $this->db->table('ai_test_module')->insertBatch($data);
    }
}
