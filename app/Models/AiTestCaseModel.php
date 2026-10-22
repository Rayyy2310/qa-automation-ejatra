<?php

namespace App\Models;

use CodeIgniter\Model;

class AiTestCaseModel extends Model
{
    protected $table = 'ai_test_case';
    protected $primaryKey = 'id';
    protected $useAutoIncrement = true;
    protected $allowedFields = ['module_id', 'test_name', 'prompt', 'expected_result', 'mode', 'test_plan_json', 'llm_provider', 'llm_model', 'status', 'is_saved'];
    protected $useTimestamps = true;

    public function getByModule($moduleId, bool $onlySaved = true)
    {
        $builder = $this->where('module_id', $moduleId);
        if ($onlySaved) {
            $builder->where('is_saved', 1);
        }
        return $builder->orderBy('test_name', 'ASC')->findAll();
    }
}
