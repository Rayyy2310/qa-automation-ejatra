<?php

namespace App\Models;

use CodeIgniter\Model;

class AiTestModuleModel extends Model
{
    protected $table = 'ai_test_module';
    protected $primaryKey = 'id';
    protected $useAutoIncrement = true;
    protected $allowedFields = ['code', 'name', 'base_url', 'business_flow', 'key_elements', 'status'];
    protected $useTimestamps = true;

    public function getActiveModules()
    {
        return $this->where('status', 'active')->findAll();
    }
}
