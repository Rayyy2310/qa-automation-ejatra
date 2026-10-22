<?php

namespace App\Services;

use App\Libraries\TestPlanValidator;
use App\Libraries\TestServiceRunner;
use App\Models\AiTestCaseModel;
use App\Models\AiTestModuleModel;
use App\Models\AiTestRunDetailModel;
use App\Models\AiTestRunModel;

/**
 * AiExecutionService — Service layer for test run dispatching, queue management, polling, and results recording.
 */
class AiExecutionService
{
    protected AiTestRunModel $runModel;
    protected AiTestRunDetailModel $detailModel;
    protected AiTestCaseModel $testCaseModel;
    protected AiTestModuleModel $moduleModel;
    protected TestServiceRunner $runner;
    protected TestPlanValidator $validator;

    public function __construct()
    {
        $this->runModel = new AiTestRunModel();
        $this->detailModel = new AiTestRunDetailModel();
        $this->testCaseModel = new AiTestCaseModel();
        $this->moduleModel = new AiTestModuleModel();
        $this->runner = new TestServiceRunner();
        $this->validator = new TestPlanValidator();
    }

    /**
     * Dispatch or queue a Playwright test run.
     */
    public function dispatchTestRun(array $params): array
    {
        $testPlan = $params['test_plan'];
        $moduleId = $params['module_id'];
        $mode = $params['mode'];
        $llmProvider = $params['llm_provider'] ?? null;
        $llmModel = $params['llm_model'] ?? null;
        $testCaseId = $params['test_case_id'] ?? null;
        $targetUrl = $params['target_url'] ?? null;
        $headless = $params['headless'] ?? false;
        $prompt = $params['prompt'] ?? '';

        $module = $this->moduleModel->find($moduleId);
        if (!$module) {
            return ['success' => false, 'error' => 'Modul tidak ditemukan', 'status_code' => 404];
        }

        $effectiveBaseUrl = !empty($targetUrl) ? $targetUrl : ($module['base_url'] ?? config('AiAutomationTest')->targetBaseUrl);

        $config = config('AiAutomationTest');
        $defaultUser = trim((string)($config->testUsername ?? env('EJATRA_TEST_USERNAME', '')), "'\"");
        $defaultPass = trim((string)($config->testPassword ?? env('EJATRA_TEST_PASSWORD', '')), "'\"");
        $this->resolveEnvPlaceholders($testPlan, $defaultUser, $defaultPass);

        $validation = $this->validator->validate($testPlan, $effectiveBaseUrl, $mode);
        if (!$validation['valid']) {
            return ['success' => false, 'error' => 'Invalid test plan', 'validation_errors' => $validation['errors'], 'status_code' => 400];
        }

        $environment = strtolower(ENVIRONMENT);
        if ($mode === 'write_test' && !in_array($environment, ['testing', 'development'])) {
            return ['success' => false, 'error' => 'Write test mode is only allowed in testing/development environment', 'status_code' => 403];
        }

        // Auto-create test case if running ad-hoc plan
        if (empty($testCaseId)) {
            try {
                $testCaseName = $testPlan['test_name'] ?? ($testPlan['description'] ?? 'Skenario ' . ($module['name'] ?? 'Modul') . ' ' . date('d/m/Y H:i'));
                $testCasePrompt = !empty($prompt) ? $prompt : ($testPlan['test_name'] ?? 'Adhoc Test Plan');
                $testCaseId = $this->testCaseModel->insert([
                    'module_id' => $moduleId,
                    'test_name' => $testCaseName,
                    'prompt' => $testCasePrompt,
                    'mode' => $mode,
                    'test_plan_json' => json_encode($testPlan),
                    'llm_provider' => $llmProvider,
                    'llm_model' => $llmModel,
                    'status' => 'active',
                    'is_saved' => 0
                ]);
            } catch (\Throwable $e) {
                $testCaseId = null;
            }
        }

        $plannedTotalSteps = !empty($testPlan['steps']) && is_array($testPlan['steps']) ? count($testPlan['steps']) : 0;
        $batchId = $params['batch_id'] ?? null;

        // Simpan effectiveBaseUrl di dalam testPlan agar jika antrean (QUEUED) dieksekusi belakangan, URL tetap akurat
        if (!empty($effectiveBaseUrl)) {
            $testPlan['base_url'] = $effectiveBaseUrl;
        }

        // Single Run (Panel Atas, tanpa batch_id): Eksekusi berurutan (Queue 1 per 1).
        // Batch Run (Panel Batch di bawah, dengan batch_id): Eksekusi paralel (hingga MAX_CONCURRENT_RUNS di Node).
        $shouldQueueInDb = empty($batchId) && $this->runModel->where('status', 'RUNNING')->countAllResults() > 0;
        $initialStatus = $shouldQueueInDb ? 'QUEUED' : 'RUNNING';

        $runId = $this->runModel->insert([
            'test_case_id' => $testCaseId,
            'test_plan_json' => json_encode($testPlan),
            'llm_provider' => $llmProvider,
            'llm_model' => $llmModel,
            'environment' => $environment,
            'mode' => $mode,
            'total_steps' => $plannedTotalSteps,
            'status' => $initialStatus,
            'started_at' => $shouldQueueInDb ? null : date('Y-m-d H:i:s'),
            'batch_id' => $batchId,
            'headless' => $headless ? 1 : 0
        ]);

        if ($shouldQueueInDb) {
            return [
                'success' => true,
                'run_id' => $runId,
                'status' => 'QUEUED',
                'queue_position' => $this->runModel->getQueuePosition((int)$runId)
            ];
        }

        $dispatchResult = $this->runner->dispatchRun($runId, $testPlan, $effectiveBaseUrl, $mode, $headless);
        if (!$dispatchResult['success']) {
            $this->runModel->update($runId, ['status' => 'FAILED', 'finished_at' => date('Y-m-d H:i:s')]);
            return ['success' => false, 'error' => $dispatchResult['error'], 'status_code' => 502];
        }

        return ['success' => true, 'run_id' => $runId, 'status' => 'RUNNING'];
    }

    /**
     * Get real-time status and step details of an active or completed test run.
     */
    public function getRunStatus(int $runId): ?array
    {
        $run = $this->runModel->find($runId);
        if (!$run) return null;

        $steps = $this->detailModel->getByRunId($runId);

        if ($run['status'] === 'RUNNING' || (empty($run['total_steps']) && empty($steps))) {
            $config = config('AiAutomationTest');
            $serviceUrl = $config->runnerUrl('/internal/test-runs/' . $runId . '/status');
            try {
                $client = \Config\Services::curlrequest(['timeout' => 2, 'http_errors' => false]);
                $resp = $client->get($serviceUrl, [
                    'headers' => ['X-Internal-Token' => $config->internalApiToken]
                ]);
                if ($resp->getStatusCode() === 200) {
                    $liveData = json_decode($resp->getBody(), true);
                    $stepsSource = !empty($liveData['result']['steps']) 
                        ? $liveData['result']['steps'] 
                        : (!empty($liveData['completed_steps']) ? $liveData['completed_steps'] : []);

                    if (!empty($stepsSource)) {
                        $steps = $stepsSource;
                    }

                    // Auto-sync status if runner already finished
                    $runnerStatus = strtoupper($liveData['status'] ?? '');
                    if (in_array($runnerStatus, ['COMPLETED', 'FAILED', 'CANCELLED', 'PASSED'])) {
                        $hasFail = false;
                        foreach ($steps as $st) {
                            if (($st['result'] ?? '') === 'FAIL') {
                                $hasFail = true;
                                break;
                            }
                        }
                        $syncedStatus = ($runnerStatus === 'CANCELLED') ? 'CANCELLED' : ($hasFail ? 'FAILED' : 'PASSED');
                        $run['status'] = $syncedStatus;
                        
                        $totalSteps = count($steps);
                        $passedSteps = count(array_filter($steps, fn($s) => ($s['result'] ?? '') === 'PASS'));
                        $failedSteps = count(array_filter($steps, fn($s) => ($s['result'] ?? '') === 'FAIL'));
                        $skippedSteps = count(array_filter($steps, fn($s) => ($s['result'] ?? '') === 'SKIPPED'));
                        $totalDuration = array_sum(array_column($steps, 'duration_ms'));

                        $run['total_steps'] = $totalSteps;
                        $run['passed_steps'] = $passedSteps;
                        $run['failed_steps'] = $failedSteps;
                        $run['skipped_steps'] = $skippedSteps;
                        $run['total_duration_ms'] = $totalDuration;

                        // Update in DB
                        $this->runModel->update($runId, [
                            'status' => $syncedStatus,
                            'total_steps' => $totalSteps,
                            'passed_steps' => $passedSteps,
                            'failed_steps' => $failedSteps,
                            'skipped_steps' => $skippedSteps,
                            'total_duration_ms' => $totalDuration,
                            'finished_at' => date('Y-m-d H:i:s')
                        ]);

                        // Sync steps into DB details if not populated yet
                        $existingDetails = $this->detailModel->getByRunId($runId);
                        if (empty($existingDetails) && !empty($steps)) {
                            foreach ($steps as $step) {
                                $this->detailModel->insert([
                                    'test_run_id' => $runId,
                                    'step_no' => $step['step_no'] ?? 1,
                                    'action' => $step['action'] ?? '',
                                    'target_json' => !empty($step['target']) ? (is_string($step['target']) ? $step['target'] : json_encode($step['target'])) : null,
                                    'value' => $step['value'] ?? null,
                                    'expected_result' => $step['expected_result'] ?? null,
                                    'result' => $step['result'] ?? 'PASS',
                                    'error' => $step['error'] ?? null,
                                    'error_category' => $step['error_category'] ?? null,
                                    'duration_ms' => $step['duration_ms'] ?? 0,
                                    'screenshot' => $step['screenshot'] ?? null,
                                    'dom_snapshot' => $step['dom_snapshot'] ?? null,
                                    'retry_count' => $step['retry_count'] ?? 0,
                                    'self_healed' => !empty($step['self_healed']) ? 1 : 0
                                ]);
                            }
                            $steps = $this->detailModel->getByRunId($runId);
                        }

                        // Dispatch next queued single run if no other runs are currently active
                        $this->dispatchNextQueuedRunIfIdle();
                    }
                }
            } catch (\Throwable $e) {}
        }

        // Resolve total planned steps from run, test_plan_json, or steps
        $totalSteps = !empty($run['total_steps']) ? (int)$run['total_steps'] : 0;
        if ($totalSteps === 0 && !empty($run['test_plan_json'])) {
            $planObj = json_decode($run['test_plan_json'], true);
            if (!empty($planObj['steps']) && is_array($planObj['steps'])) {
                $totalSteps = count($planObj['steps']);
                $this->runModel->update($runId, ['total_steps' => $totalSteps]);
            }
        }
        if ($totalSteps === 0) {
            $totalSteps = count($steps);
        }
        $passedSteps = !empty($run['passed_steps']) ? (int)$run['passed_steps'] : count(array_filter($steps, fn($s) => ($s['result'] ?? '') === 'PASS'));
        $failedSteps = !empty($run['failed_steps']) ? (int)$run['failed_steps'] : count(array_filter($steps, fn($s) => ($s['result'] ?? '') === 'FAIL'));
        $skippedSteps = !empty($run['skipped_steps']) ? (int)$run['skipped_steps'] : count(array_filter($steps, fn($s) => ($s['result'] ?? '') === 'SKIPPED'));

        // Calculate duration sum if total_duration_ms not set yet
        $totalDuration = $run['total_duration_ms'] ? (int)$run['total_duration_ms'] : 0;
        if ($totalDuration === 0 && !empty($steps)) {
            foreach ($steps as $s) {
                $totalDuration += (int)($s['duration_ms'] ?? 0);
            }
        }

        $progressPercent = $totalSteps > 0 ? round((($passedSteps + $failedSteps + $skippedSteps) / $totalSteps) * 100) : 0;

        $responsePayload = [
            'success' => true,
            'status' => $run['status'],
            'total_steps' => $totalSteps,
            'passed' => $passedSteps,
            'failed' => $failedSteps,
            'skipped' => $skippedSteps,
            'duration_ms' => $totalDuration,
            'progress_percent' => $progressPercent,
            'run' => [
                'id' => (int)$run['id'],
                'status' => $run['status'],
                'mode' => $run['mode'],
                'total_steps' => $totalSteps,
                'passed_steps' => $passedSteps,
                'failed_steps' => $failedSteps,
                'skipped_steps' => $skippedSteps,
                'total_duration_ms' => $totalDuration,
                'progress_percent' => $progressPercent,
                'started_at' => $run['started_at'],
                'finished_at' => $run['finished_at']
            ],
            'steps' => $steps
        ];

        if ($run['status'] === 'QUEUED') {
            $responsePayload['queue_position'] = $this->runModel->getQueuePosition($runId);
        }

        return $responsePayload;
    }

    /**
     * Record execution callback from Node.js Playwright Runner.
     */
    public function processCallback(array $data): array
    {
        $runId = $data['run_id'] ?? null;
        if (!$runId) return ['success' => false, 'error' => 'Missing run_id'];

        $run = $this->runModel->find($runId);
        if (!$run) return ['success' => false, 'error' => 'Run not found'];

        $status = $data['status'] ?? 'COMPLETED';
        $totalDurationMs = $data['total_duration_ms'] ?? 0;
        $passed = $data['passed'] ?? 0;
        $failed = $data['failed'] ?? 0;
        $skipped = $data['skipped'] ?? 0;
        $steps = $data['steps'] ?? [];

        $db = \Config\Database::connect();
        $db->transStart();

        $this->runModel->update($runId, [
            'status' => $status,
            'total_duration_ms' => $totalDurationMs,
            'passed_steps' => $passed,
            'failed_steps' => $failed,
            'skipped_steps' => $skipped,
            'total_steps' => count($steps),
            'finished_at' => date('Y-m-d H:i:s')
        ]);

        $this->detailModel->where('test_run_id', $runId)->delete();
        foreach ($steps as $step) {
            $this->detailModel->insert([
                'test_run_id' => $runId,
                'step_no' => $step['step_no'] ?? 1,
                'action' => $step['action'] ?? '',
                'target_json' => !empty($step['target']) ? json_encode($step['target']) : null,
                'value' => $step['value'] ?? null,
                'expected_result' => $step['expected_result'] ?? null,
                'result' => $step['result'] ?? 'PASS',
                'error' => $step['error'] ?? null,
                'error_category' => $step['error_category'] ?? null,
                'duration_ms' => $step['duration_ms'] ?? 0,
                'screenshot' => $step['screenshot'] ?? null,
                'dom_snapshot' => $step['dom_snapshot'] ?? null,
                'retry_count' => $step['retry_count'] ?? 0,
                'self_healed' => !empty($step['self_healed']) ? 1 : 0
            ]);
        }

        $db->transComplete();

        // Dispatch next queued single run if no other runs are currently active
        $this->dispatchNextQueuedRunIfIdle();

        return ['success' => true];
    }

    /**
     * Dispatch the next QUEUED single run in FIFO order when no other run is currently RUNNING.
     */
    public function dispatchNextQueuedRunIfIdle(): void
    {
        if ($this->runModel->where('status', 'RUNNING')->countAllResults() > 0) {
            return;
        }
        $queuedRun = $this->runModel->getNextQueuedRun();
        if ($queuedRun) {
            $this->runModel->update($queuedRun['id'], ['status' => 'RUNNING', 'started_at' => date('Y-m-d H:i:s')]);
            $testPlan = json_decode($queuedRun['test_plan_json'], true) ?: [];
            $baseUrl = $testPlan['base_url'] ?? config('AiAutomationTest')->targetBaseUrl;
            $this->runner->dispatchRun((int)$queuedRun['id'], $testPlan, $baseUrl, $queuedRun['mode'], !empty($queuedRun['headless']));
        }
    }

    /**
     * Run several saved test cases as one batch. All guardrails of dispatchTestRun apply.
     * The Node test-service limits real concurrency (MAX_CONCURRENT_RUNS) and queues the rest.
     *
     * @param int[] $caseIds
     */
    public function dispatchBatch(array $caseIds, bool $headless, ?string $targetUrl = null): array
    {
        $caseIds = array_values(array_unique(array_filter(array_map('intval', $caseIds))));
        if (empty($caseIds)) {
            return ['success' => false, 'error' => 'Pilih minimal satu skenario', 'status_code' => 400];
        }
        $maxStepsOrBatch = config('AiAutomationTest')->maxStepsPerPlan ?: 50;
        if (count($caseIds) > $maxStepsOrBatch) {
            return ['success' => false, 'error' => "Maksimal {$maxStepsOrBatch} skenario per batch", 'status_code' => 400];
        }

        $batchId = 'bat_' . bin2hex(random_bytes(6));
        $items = [];
        $okCount = 0;

        foreach ($caseIds as $caseId) {
            $case = $this->testCaseModel->find($caseId);
            if (!$case) {
                $items[] = ['case_id' => $caseId, 'success' => false, 'error' => 'Skenario tidak ditemukan'];
                continue;
            }

            $plan = json_decode($case['test_plan_json'] ?? '', true);
            if (empty($plan['steps'])) {
                $items[] = ['case_id' => $caseId, 'test_name' => $case['test_name'], 'success' => false, 'error' => 'Test plan kosong/tidak valid'];
                continue;
            }

            $res = $this->dispatchTestRun([
                'test_plan' => $plan,
                'module_id' => (int)$case['module_id'],
                'mode' => $case['mode'] ?? 'read_only',
                'llm_provider' => $case['llm_provider'] ?? null,
                'llm_model' => $case['llm_model'] ?? null,
                'test_case_id' => $caseId,
                'target_url' => $targetUrl,
                'headless' => $headless,
                'prompt' => $case['prompt'] ?? '',
                'batch_id' => $batchId,
            ]);

            if (!empty($res['success'])) {
                $okCount++;
                $items[] = ['case_id' => $caseId, 'test_name' => $case['test_name'], 'success' => true, 'run_id' => $res['run_id']];
            } else {
                $items[] = ['case_id' => $caseId, 'test_name' => $case['test_name'], 'success' => false, 'error' => $res['error'] ?? 'Gagal dispatch'];
            }
        }

        return [
            'success' => $okCount > 0,
            'batch_id' => $batchId,
            'total' => count($caseIds),
            'dispatched' => $okCount,
            'items' => $items,
            'status_code' => $okCount > 0 ? 200 : 400,
        ];
    }

    /**
     * Aggregate live status of all runs in a batch.
     */
    public function getBatchStatus(string $batchId): ?array
    {
        $runs = $this->runModel
            ->select('ai_test_run.id, ai_test_run.status, ai_test_run.mode, ai_test_run.headless, ai_test_run.total_steps, ai_test_run.passed_steps, ai_test_run.failed_steps, ai_test_run.total_duration_ms, ai_test_case.test_name')
            ->join('ai_test_case', 'ai_test_case.id = ai_test_run.test_case_id', 'left')
            ->where('ai_test_run.batch_id', $batchId)
            ->orderBy('ai_test_run.id', 'ASC')
            ->findAll();
        if (empty($runs)) return null;

        // Which runs are still waiting for a slot in the Node queue?
        $queuedIds = [];
        $queueInfo = null;
        try {
            $config = config('AiAutomationTest');
            $client = \Config\Services::curlrequest(['timeout' => 2, 'http_errors' => false]);
            $resp = $client->get($config->runnerUrl('/internal/queue-state'), ['headers' => ['X-Internal-Token' => $config->internalApiToken]]);
            if ($resp->getStatusCode() === 200) {
                $queueInfo = json_decode($resp->getBody(), true);
                $queuedIds = array_map('strval', $queueInfo['queued_run_ids'] ?? []);
            }
        } catch (\Throwable $e) {}

        $items = [];
        $counts = ['queued' => 0, 'running' => 0, 'passed' => 0, 'failed' => 0, 'cancelled' => 0];
        foreach ($runs as $r) {
            $status = $r['status'];
            if (in_array($status, ['RUNNING', 'QUEUED'], true)) {
                // Sync from Node (also persists final status when the callback was missed)
                $live = $this->getRunStatus((int)$r['id']);
                if ($live) {
                    $status = $live['status'];
                    $r['total_steps'] = $live['total_steps'];
                    $r['passed_steps'] = $live['passed'];
                    $r['failed_steps'] = $live['failed'];
                    $r['total_duration_ms'] = $live['duration_ms'];
                }
            }

            if (in_array($status, ['RUNNING', 'QUEUED'], true)) {
                $display = in_array((string)$r['id'], $queuedIds, true) ? 'QUEUED' : 'RUNNING';
            } else {
                $display = $status;
            }

            $key = match ($display) {
                'QUEUED' => 'queued', 'RUNNING' => 'running', 'PASSED' => 'passed', 'CANCELLED' => 'cancelled', default => 'failed',
            };
            $counts[$key]++;

            $items[] = [
                'run_id' => (int)$r['id'],
                'test_name' => $r['test_name'],
                'mode' => $r['mode'],
                'status' => $display,
                'total_steps' => (int)$r['total_steps'],
                'passed_steps' => (int)$r['passed_steps'],
                'failed_steps' => (int)$r['failed_steps'],
                'duration_ms' => (int)$r['total_duration_ms'],
            ];
        }

        $total = count($items);
        $finished = $counts['passed'] + $counts['failed'] + $counts['cancelled'];

        return [
            'success' => true,
            'batch_id' => $batchId,
            'headless' => !empty($runs[0]['headless']),
            'total' => $total,
            'finished' => $finished,
            'counts' => $counts,
            'is_done' => $finished >= $total,
            'progress_percent' => $total > 0 ? (int)round(($finished / $total) * 100) : 0,
            'queue' => $queueInfo,
            'items' => $items,
        ];
    }

    /**
     * Cancel every unfinished run in a batch (running and queued).
     */
    public function cancelBatch(string $batchId): int
    {
        $runs = $this->runModel->where('batch_id', $batchId)->whereIn('status', ['RUNNING', 'QUEUED'])->findAll();
        $config = config('AiAutomationTest');
        $client = \Config\Services::curlrequest(['timeout' => 2, 'http_errors' => false]);
        $n = 0;
        foreach ($runs as $r) {
            $this->runModel->update($r['id'], ['status' => 'CANCELLED', 'finished_at' => date('Y-m-d H:i:s')]);
            try {
                $client->post($config->runnerUrl('/internal/test-runs/' . $r['id'] . '/cancel'), ['headers' => ['X-Internal-Token' => $config->internalApiToken]]);
            } catch (\Throwable $e) {}
            $n++;
        }
        return $n;
    }

    /**
     * Get test run history list.
     */
    public function getHistory(int $limit = 50, ?string $status = null): array
    {
        $builder = $this->runModel;
        if (!empty($status)) {
            $builder = $builder->where('ai_test_run.status', strtoupper($status));
        }
        return $builder->getRunsWithDetails($limit);
    }

    /**
     * Resolve environment variable placeholders in test plan steps.
     * Ensures any pending {username_from_env} or {password_from_env} are resolved before saving and dispatching.
     */
    private function resolveEnvPlaceholders(array &$testPlan, string $defaultUser, string $defaultPass): void
    {
        if (empty($testPlan['steps']) || !is_array($testPlan['steps'])) {
            return;
        }

        foreach ($testPlan['steps'] as &$step) {
            if (!is_array($step) || !isset($step['value'])) {
                continue;
            }

            $val = trim((string)$step['value']);
            if (preg_match('/^\{{1,2}\s*(?:username_from_env|username|env\.username)\s*\}{1,2}$/i', $val)) {
                $step['value'] = $defaultUser;
            } elseif (preg_match('/^\{{1,2}\s*(?:password_from_env|password|env\.password)\s*\}{1,2}$/i', $val)) {
                $step['value'] = $defaultPass;
            }
        }
        unset($step);
    }
}
