<?php

namespace App\Models;

use CodeIgniter\Model;

class AiTestRunDetailModel extends Model
{
    protected $table = 'ai_test_run_detail';
    protected $primaryKey = 'id';
    protected $useAutoIncrement = true;
    protected $allowedFields = ['test_run_id', 'step_no', 'action', 'target_json', 'value', 'wait_before_json', 'post_action_wait_json', 'expected_result', 'result', 'error', 'error_category', 'retry_count', 'duration_ms', 'screenshot', 'dom_snapshot'];
    protected $useTimestamps = true;

    public function getByRunId($runId)
    {
        return $this->where('test_run_id', $runId)
                    ->orderBy('step_no', 'ASC')
                    ->findAll();
    }
}
