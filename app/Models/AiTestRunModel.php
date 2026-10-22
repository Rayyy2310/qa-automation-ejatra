<?php

namespace App\Models;

use CodeIgniter\Model;

class AiTestRunModel extends Model
{
    protected $table = 'ai_test_run';
    protected $primaryKey = 'id';
    protected $useAutoIncrement = true;
    protected $allowedFields = ['test_case_id', 'test_plan_json', 'llm_provider', 'llm_model', 'environment', 'mode', 'status', 'total_steps', 'passed_steps', 'failed_steps', 'skipped_steps', 'total_duration_ms', 'started_at', 'finished_at', 'created_by', 'batch_id', 'headless'];
    protected $useTimestamps = true;

    public function getRunsWithDetails($limit = 50)
    {
        return $this->select('ai_test_run.*, ai_test_case.test_name, ai_test_case.prompt as test_prompt, ai_test_module.name as module_name, ai_test_module.code as module_code')
                    ->join('ai_test_case', 'ai_test_case.id = ai_test_run.test_case_id', 'left')
                    ->join('ai_test_module', 'ai_test_module.id = ai_test_case.module_id', 'left')
                    ->orderBy('ai_test_run.created_at', 'DESC')
                    ->limit($limit)
                    ->findAll();
    }

    public function getRunsByTestCase($testCaseId)
    {
        return $this->select('ai_test_run.*, ai_test_case.test_name, ai_test_module.name as module_name')
                    ->join('ai_test_case', 'ai_test_case.id = ai_test_run.test_case_id', 'left')
                    ->join('ai_test_module', 'ai_test_module.id = ai_test_case.module_id', 'left')
                    ->where('ai_test_run.test_case_id', $testCaseId)
                    ->orderBy('ai_test_run.created_at', 'DESC')
                    ->findAll();
    }

    public function isAnyRunning()
    {
        return $this->whereIn('status', ['QUEUED', 'RUNNING'])->countAllResults() > 0;
    }

    public function getRecentRuns($limit = 10)
    {
        return $this->getRunsWithDetails($limit);
    }

    public function getNextQueuedRun()
    {
        return $this->where('status', 'QUEUED')->orderBy('id', 'ASC')->first();
    }

    public function getStatistics()
    {
        $total = $this->countAllResults(false);
        $passed = $this->where('status', 'PASSED')->countAllResults(false);
        $failed = $this->where('status', 'FAILED')->countAllResults(false);
        $running = $this->whereIn('status', ['RUNNING', 'QUEUED'])->countAllResults(false);

        return [
            'total' => $total,
            'passed' => $passed,
            'failed' => $failed,
            'running' => $running,
            'pass_rate' => $total > 0 ? round(($passed / $total) * 100) : 0
        ];
    }

    public function getQueuePosition(int $runId): int
    {
        $count = $this->where('status', 'QUEUED')
                      ->where('id <=', $runId)
                      ->countAllResults();
        return max(1, $count);
    }
}
