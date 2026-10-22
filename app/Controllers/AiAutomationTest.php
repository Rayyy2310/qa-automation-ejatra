<?php

namespace App\Controllers;

use App\Models\AiPageScanModel;
use App\Models\AiTestCaseModel;
use App\Models\AiTestModuleModel;
use App\Models\AiTestRunDetailModel;
use App\Models\AiTestRunModel;
use App\Services\AiExecutionService;
use App\Services\AiPlanService;
use App\Services\AiScanService;

/**
 * AiAutomationTest Controller — Lean & Clean HTTP Traffic Controller for AI QA Automation.
 * Follows Single Responsibility Principle by delegating business logic to Service Layer.
 */
class AiAutomationTest extends BaseController
{
    protected AiScanService $scanService;
    protected AiPlanService $planService;
    protected AiExecutionService $executionService;
    protected AiTestModuleModel $moduleModel;
    protected AiTestRunModel $runModel;
    protected AiTestCaseModel $testCaseModel;

    public function __construct()
    {
        $this->scanService = new AiScanService();
        $this->planService = new AiPlanService();
        $this->executionService = new AiExecutionService();
        $this->moduleModel = new AiTestModuleModel();
        $this->runModel = new AiTestRunModel();
        $this->testCaseModel = new AiTestCaseModel();
    }

    /**
     * Display the main Web Studio dashboard.
     */
    public function index()
    {
        $llmService = new \App\Libraries\LlmService();
        $providers = $llmService->getAvailableProviders();
        $modules = $this->moduleModel->findAll();
        $recentRuns = $this->runModel->getRecentRuns(10);
        $savedCases = $this->testCaseModel->findAll();
        $stats = $this->runModel->getStatistics();

        $scanModel = new AiPageScanModel();
        $latestScan = $scanModel->getLatestCompleted();
        $config = config('AiAutomationTest');

        return view('ai_automation_test/index', [
            'title' => 'AI Automated Testing Studio',
            'modules' => $modules,
            'recentRuns' => $recentRuns,
            'savedCases' => $savedCases,
            'stats' => $stats,
            'providers' => $providers,
            'latestScan' => $latestScan,
            'environment' => strtolower(ENVIRONMENT),
            'defaultTargetUrl' => $config->targetBaseUrl,
            'maxConcurrentRuns' => $config->maxConcurrentRuns
        ]);
    }

    /**
     * Generate an executable Playwright test plan via AI (AJAX).
     */
    public function generatePlan()
    {
        $raw = $this->request->getBody();
        $json = !empty($raw) ? json_decode($raw) : null;
        if (!$json || empty($json->test_case) || empty($json->module_id)) {
            return $this->response->setJSON(['success' => false, 'error' => 'Data input tidak lengkap'])->setStatusCode(400);
        }

        $result = $this->planService->generatePlan(
            (int)$json->module_id,
            $json->test_case,
            $json->mode ?? 'read_only',
            $json->provider ?? null,
            $json->model ?? null,
            $json->target_url ?? null
        );

        $statusCode = $result['success'] ? 200 : 500;
        return $this->response->setJSON($result)->setStatusCode($statusCode);
    }

    /**
     * Execute or queue a test plan in the background (AJAX).
     */
    public function runTest()
    {
        $raw = $this->request->getBody();
        $json = !empty($raw) ? json_decode($raw) : null;
        if (!$json || empty($json->test_plan_json) || empty($json->module_id) || empty($json->mode)) {
            return $this->response->setJSON(['success' => false, 'error' => 'Missing required fields'])->setStatusCode(400);
        }

        $testPlan = is_string($json->test_plan_json) 
            ? json_decode($json->test_plan_json, true) 
            : json_decode(json_encode($json->test_plan_json), true);

        $result = $this->executionService->dispatchTestRun([
            'test_plan' => $testPlan,
            'module_id' => (int)$json->module_id,
            'mode' => $json->mode,
            'llm_provider' => $json->llm_provider ?? null,
            'llm_model' => $json->llm_model ?? null,
            'test_case_id' => $json->test_case_id ?? null,
            'target_url' => $json->target_url ?? null,
            'headless' => isset($json->headless) ? (bool)$json->headless : false,
            'prompt' => $json->prompt ?? $json->test_case ?? ''
        ]);

        $statusCode = $result['success'] ? 200 : ($result['status_code'] ?? 400);
        return $this->response->setJSON($result)->setStatusCode($statusCode);
    }

    /**
     * Run multiple saved test cases as one batch (AJAX). Real concurrency is capped by the Node service.
     */
    public function runBatch()
    {
        $raw = $this->request->getBody();
        $json = !empty($raw) ? json_decode($raw, true) : null;
        $caseIds = is_array($json['case_ids'] ?? null) ? $json['case_ids'] : [];
        $targetUrl = !empty($json['target_url']) ? trim((string)$json['target_url']) : null;

        $result = $this->executionService->dispatchBatch($caseIds, !empty($json['headless']), $targetUrl);
        $statusCode = $result['status_code'] ?? ($result['success'] ? 200 : 400);
        unset($result['status_code']);
        return $this->response->setJSON($result)->setStatusCode($statusCode);
    }

    /**
     * Aggregated live status of a batch (AJAX polling).
     */
    public function batchStatus($batchId)
    {
        $data = $this->executionService->getBatchStatus((string)$batchId);
        if (!$data) {
            return $this->response->setJSON(['success' => false, 'error' => 'Batch tidak ditemukan'])->setStatusCode(404);
        }
        return $this->response->setJSON($data);
    }

    /**
     * Cancel all unfinished runs (running + queued) of a batch (AJAX).
     */
    public function cancelBatch($batchId)
    {
        $n = $this->executionService->cancelBatch((string)$batchId);
        return $this->response->setJSON(['success' => true, 'cancelled' => $n]);
    }

    /**
     * Get real-time status of a test run (AJAX polling).
     */
    public function getStatus($runId)
    {
        $data = $this->executionService->getRunStatus((int)$runId);
        if (!$data) {
            return $this->response->setJSON(['success' => false, 'error' => 'Run not found'])->setStatusCode(404);
        }
        return $this->response->setJSON($data);
    }

    /**
     * Cancel an active test run (AJAX).
     */
    public function cancelRun($runId)
    {
        $run = $this->runModel->find((int)$runId);
        if (!$run) {
            return $this->response->setJSON(['success' => false, 'error' => 'Run not found'])->setStatusCode(404);
        }

        $this->runModel->update($runId, ['status' => 'CANCELLED', 'finished_at' => date('Y-m-d H:i:s')]);

        $config = config('AiAutomationTest');
        $serviceUrl = $config->runnerUrl('/internal/test-runs/' . $runId . '/cancel');
        try {
            $client = \Config\Services::curlrequest(['timeout' => 2, 'http_errors' => false]);
            $client->post($serviceUrl, ['headers' => ['X-Internal-Token' => $config->internalApiToken]]);
        } catch (\Throwable $e) {}

        $this->executionService->dispatchNextQueuedRunIfIdle();

        return $this->response->setJSON(['success' => true, 'message' => 'Pengujian dibatalkan']);
    }

    /**
     * Force reset all browser sessions and kill orphan Playwright processes (AJAX).
     */
    public function resetBrowser()
    {
        $db = \Config\Database::connect();
        $db->query("UPDATE ai_test_run SET status = 'CANCELLED' WHERE status IN ('RUNNING', 'QUEUED')");

        $config = config('AiAutomationTest');
        $serviceUrl = $config->runnerUrl('/internal/reset-browsers');
        try {
            $client = \Config\Services::curlrequest(['timeout' => 5, 'http_errors' => false]);
            $resp = $client->post($serviceUrl, ['headers' => ['X-Internal-Token' => $config->internalApiToken]]);
            $data = json_decode($resp->getBody(), true);
            return $this->response->setJSON(['success' => true, 'message' => $data['message'] ?? 'Browser berhasil direset']);
        } catch (\Throwable $e) {
            return $this->response->setJSON(['success' => false, 'error' => $e->getMessage()])->setStatusCode(500);
        }
    }

    /**
     * Cancel all active test runs and reset browsers (Route: cancel-all).
     */
    public function cancelAll()
    {
        return $this->resetBrowser();
    }


    /**
     * Save a reusable test case scenario (AJAX).
     */
    public function savePlan()
    {
        $raw = $this->request->getBody();
        $json = !empty($raw) ? json_decode($raw, true) : null;
        if (!$json || empty($json['module_id']) || empty($json['test_name']) || empty($json['test_plan_json'])) {
            return $this->response->setJSON(['success' => false, 'error' => 'Data input tidak lengkap'])->setStatusCode(400);
        }

        $result = $this->planService->saveCase($json);
        $statusCode = !empty($result['conflict']) ? 409 : (!empty($result['success']) ? 200 : 400);
        return $this->response->setJSON($result)->setStatusCode($statusCode);
    }

    /**
     * Get saved test cases for a module (AJAX).
     */
    public function getSavedCases()
    {
        $moduleId = $this->request->getGet('module_id');
        if (!$moduleId) {
            return $this->response->setJSON(['success' => false, 'error' => 'Module ID is required'])->setStatusCode(400);
        }

        $cases = $this->planService->getSavedCases((int)$moduleId);
        return $this->response->setJSON(['success' => true, 'test_cases' => $cases]);
    }

    /**
     * Delete a saved test case (AJAX).
     */
    public function deleteSavedCase($id)
    {
        $success = $this->planService->deleteSavedCase((int)$id);
        return $this->response->setJSON(['success' => $success]);
    }

    /**
     * Update saved test case name (AJAX).
     */
    public function updateCaseName($id)
    {
        $raw = $this->request->getBody();
        $json = !empty($raw) ? json_decode($raw, true) : null;
        $testName = trim($json['test_name'] ?? '');

        if (empty($testName)) {
            return $this->response->setJSON(['success' => false, 'error' => 'Nama skenario tidak boleh kosong'])->setStatusCode(400);
        }

        $result = $this->planService->updateCaseName((int)$id, $testName);
        if (empty($result['success'])) {
            return $this->response->setJSON(['success' => false, 'error' => $result['error'] ?? 'Gagal mengubah nama skenario'])->setStatusCode(400);
        }

        return $this->response->setJSON(['success' => true, 'message' => 'Nama skenario berhasil diubah', 'test_name' => $testName]);
    }

    /**
     * Get all business modules (AJAX).
     */
    public function getModules()
    {
        $modules = $this->planService->getModules();
        return $this->response->setJSON(['success' => true, 'modules' => $modules]);
    }

    /**
     * Create a new business module (AJAX).
     */
    public function saveModule()
    {
        $raw = $this->request->getBody();
        $json = !empty($raw) ? json_decode($raw, true) : $this->request->getPost();
        if (empty($json) || empty(trim($json['name'] ?? ''))) {
            return $this->response->setJSON(['success' => false, 'error' => 'Nama modul bisnis tidak boleh kosong'])->setStatusCode(400);
        }

        $result = $this->planService->saveModule((array)$json);
        $statusCode = !empty($result['success']) ? 200 : 400;
        return $this->response->setJSON($result)->setStatusCode($statusCode);
    }

    /**
     * Update an existing business module (AJAX).
     */
    public function updateModule($id)
    {
        $raw = $this->request->getBody();
        $json = !empty($raw) ? json_decode($raw, true) : $this->request->getPost();
        if (empty($json) || empty(trim($json['name'] ?? ''))) {
            return $this->response->setJSON(['success' => false, 'error' => 'Nama modul bisnis tidak boleh kosong'])->setStatusCode(400);
        }

        $result = $this->planService->updateModule((int)$id, (array)$json);
        $statusCode = !empty($result['success']) ? 200 : 400;
        return $this->response->setJSON($result)->setStatusCode($statusCode);
    }

    /**
     * Delete a business module (AJAX).
     */
    public function deleteModule($id)
    {
        $result = $this->planService->deleteModule((int)$id);
        $statusCode = !empty($result['success']) ? 200 : 404;
        return $this->response->setJSON($result)->setStatusCode($statusCode);
    }

    /**
     * Trigger background Playwright page scan (AJAX).
     */
    public function triggerScan()
    {
        $raw = $this->request->getBody();
        $json = !empty($raw) ? json_decode($raw) : null;
        $targetUrl = $json->target_url ?? $this->request->getPost('target_url');
        $result = $this->scanService->triggerScan($targetUrl);
        return $this->response->setJSON($result);
    }

    /**
     * Handle scan completion callback from Node.js (POST internal).
     */
    public function scanCallback()
    {
        $config = config('AiAutomationTest');
        $token = $this->request->getHeaderLine('X-Internal-Token');
        if ($token !== $config->internalApiToken) {
            return $this->response->setJSON(['error' => 'Unauthorized'])->setStatusCode(401);
        }

        $data = $this->request->getJSON(true);
        $result = $this->scanService->processScanCallback($data ?: []);
        return $this->response->setJSON($result);
    }

    /**
     * Get scan status for UI polling (AJAX).
     */
    public function scanStatus()
    {
        $status = $this->scanService->getScanStatus();
        return $this->response->setJSON($status);
    }

    /**
     * Get list of scanned pages for Explorer modal (AJAX).
     */
    public function getScanPages()
    {
        $pages = $this->scanService->getScanPages();
        return $this->response->setJSON($pages);
    }

    /**
     * Get scanned elements for a specific page (AJAX).
     */
    public function getScanPageElements()
    {
        $menuPath = $this->request->getGet('menu_path') ?? '';
        $data = $this->scanService->getScanPageElements($menuPath);
        return $this->response->setJSON($data);
    }

    /**
     * Handle test run completion callback from Node.js Playwright runner (POST internal).
     */
    public function callback()
    {
        $config = config('AiAutomationTest');
        $token = $this->request->getHeaderLine('X-Internal-Token');
        if ($token !== $config->internalApiToken) {
            return $this->response->setJSON(['error' => 'Unauthorized'])->setStatusCode(401);
        }

        $data = $this->request->getJSON(true);
        $result = $this->executionService->processCallback($data ?: []);
        return $this->response->setJSON($result);
    }

    /**
     * Serve artifact screenshots securely.
     */
    public function screenshot($filename = '')
    {
        $safeName = urldecode(basename($filename));
        $possiblePaths = [
            ROOTPATH . 'test-service/screenshots/' . $safeName,
            FCPATH . 'uploads/screenshots/' . $safeName,
            WRITEPATH . 'uploads/' . $safeName,
            ROOTPATH . 'test-service/' . $safeName
        ];

        $filePath = null;
        foreach ($possiblePaths as $path) {
            if (file_exists($path) && is_file($path)) {
                $filePath = $path;
                break;
            }
        }

        if (!$filePath) {
            return $this->response->setStatusCode(404)->setBody('Screenshot not found: ' . $safeName);
        }

        $mime = mime_content_type($filePath) ?: 'image/png';
        return $this->response
            ->setHeader('Content-Type', $mime)
            ->setHeader('Cache-Control', 'public, max-age=86400')
            ->setBody(file_get_contents($filePath));
    }

    /**
     * Delete a test run history record (AJAX).
     */
    public function deleteRun($runId)
    {
        $detailModel = new AiTestRunDetailModel();
        $detailModel->where('test_run_id', $runId)->delete();
        $this->runModel->delete($runId);
        return $this->response->setJSON(['success' => true]);
    }

    /**
     * View test run execution history list (AJAX or View).
     */
    public function history()
    {
        $limit = (int)($this->request->getGet('limit') ?? 50);
        $status = $this->request->getGet('status') ?? null;
        $runs = $this->executionService->getHistory($limit, $status);

        if ($this->request->isAJAX() || $this->request->getHeaderLine('X-Requested-With') === 'XMLHttpRequest') {
            return $this->response->setJSON(['success' => true, 'history' => $runs]);
        }

        return view('ai_automation_test/history', [
            'title' => 'Riwayat Pengujian — AI Automation Studio',
            'modules' => $this->moduleModel->findAll(),
            'recentRuns' => $runs,
            'savedCases' => $this->testCaseModel->findAll(),
            'stats' => $this->runModel->getStatistics(),
            'providers' => (new \App\Libraries\LlmService())->getAvailableProviders(),
            'latestScan' => (new \App\Models\AiPageScanModel())->getLatestCompleted(),
            'environment' => strtolower(ENVIRONMENT)
        ]);
    }

    /**
     * Get detailed steps and artifacts of a specific test run.
     */
    public function detail($runId)
    {
        $data = $this->executionService->getRunStatus((int)$runId);
        if (!$data) {
            if ($this->request->isAJAX() || $this->request->getHeaderLine('X-Requested-With') === 'XMLHttpRequest') {
                return $this->response->setJSON(['success' => false, 'error' => 'Detail pengujian tidak ditemukan'])->setStatusCode(404);
            }
            return redirect()->to('/ai-automation-test')->with('error', 'Detail pengujian tidak ditemukan');
        }

        return $this->response->setJSON(['success' => true, 'data' => $data]);
    }

    /**
     * Export test run result as downloadable JSON.
     */
    public function exportJson($runId)
    {
        $data = $this->executionService->getRunStatus((int)$runId);
        if (!$data) {
            return $this->response->setStatusCode(404)->setBody('Run not found');
        }

        return $this->response
            ->setHeader('Content-Type', 'application/json')
            ->setHeader('Content-Disposition', 'attachment; filename="test_run_' . $runId . '.json"')
            ->setJSON($data);
    }
}
