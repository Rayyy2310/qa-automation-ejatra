<?php

namespace App\Services;

use App\Libraries\LlmService;
use App\Libraries\TestPlanValidator;
use App\Models\AiTestCaseModel;
use App\Models\AiTestModuleModel;

/**
 * AiPlanService — Service layer for LLM Test Plan Generation, Validation, and Test Case Management.
 */
class AiPlanService
{
    protected AiTestCaseModel $testCaseModel;
    protected AiTestModuleModel $moduleModel;
    protected LlmService $llmService;
    protected TestPlanValidator $validator;

    public function __construct()
    {
        $this->testCaseModel = new AiTestCaseModel();
        $this->moduleModel = new AiTestModuleModel();
        $this->llmService = new LlmService();
        $this->validator = new TestPlanValidator();
    }

    /**
     * Generate an executable Playwright Test Plan from natural language via LLM with Ground Truth awareness.
     */
    public function generatePlan(
        int $moduleId,
        string $testCase,
        string $mode = 'read_only',
        ?string $provider = null,
        ?string $model = null,
        ?string $targetUrl = null
    ): array {
        $module = $this->moduleModel->find($moduleId);
        if (!$module) {
            return ['success' => false, 'error' => 'Modul tidak ditemukan'];
        }

        $effectiveBaseUrl = !empty($targetUrl) ? $targetUrl : ($module['base_url'] ?? config('AiAutomationTest')->targetBaseUrl);

        $config = config('AiAutomationTest');
        $effectiveProvider = !empty($provider) ? $provider : ($config->defaultLlmProvider ?? 'groq');
        $effectiveModel = !empty($model) ? $model : '';

        $llmResult = $this->llmService->generatePlan(
            $effectiveProvider,
            $effectiveModel,
            $module,
            $effectiveBaseUrl,
            $mode,
            $testCase
        );

        if (!$llmResult['success']) {
            return [
                'success' => false,
                'error' => $llmResult['error'] ?? 'Gagal membuat test plan dari AI.',
                'raw_response' => $llmResult['raw_response'] ?? null
            ];
        }

        $testPlan = $llmResult['plan'] ?? ($llmResult['test_plan'] ?? []);
        $validation = $this->validator->validate($testPlan, $effectiveBaseUrl, $mode);

        $usage = $llmResult['usage'] ?? [];
        $promptTokens = $usage['prompt_tokens'] 
            ?? $usage['promptTokenCount'] 
            ?? $usage['input_tokens'] 
            ?? $usage['prompt_eval_count'] 
            ?? ($llmResult['prompt_tokens'] ?? 0);

        $completionTokens = $usage['completion_tokens'] 
            ?? $usage['candidatesTokenCount'] 
            ?? $usage['output_tokens'] 
            ?? $usage['eval_count'] 
            ?? ($llmResult['completion_tokens'] ?? 0);

        // Fallback heuristic if adapter (e.g. CLI or local) didn't provide usage metadata
        if ((int) $promptTokens === 0 && !empty($testCase)) {
            $promptTokens = (int) ceil((strlen($testCase) + 1800) / 4);
        }
        if ((int) $completionTokens === 0 && !empty($testPlan)) {
            $completionTokens = (int) ceil(strlen(json_encode($testPlan)) / 4);
        }

        return [
            'success' => true,
            'test_plan' => $testPlan,
            'validation' => $validation,
            'metadata' => [
                'provider' => $effectiveProvider,
                'model' => $effectiveModel,
                'prompt_tokens' => (int) $promptTokens,
                'completion_tokens' => (int) $completionTokens,
                'total_tokens' => (int) ($promptTokens + $completionTokens)
            ]
        ];
    }

    /**
     * Save a reusable Test Case (with duplicate name conflict check & replace support).
     */
    public function saveCase(array $data): array
    {
        $moduleId = (int)($data['module_id'] ?? 0);
        $testName = trim($data['test_name'] ?? '');
        $replace  = !empty($data['replace']);

        if ($moduleId <= 0 || $testName === '') {
            return ['success' => false, 'error' => 'Modul dan nama skenario wajib diisi'];
        }

        // Check if scenario with same name already exists in this module
        $existingRows = $this->testCaseModel
            ->where('module_id', $moduleId)
            ->where('test_name', $testName)
            ->where('is_saved', 1)
            ->orderBy('id', 'DESC')
            ->findAll();
        $existing = $existingRows[0] ?? null;

        if ($existing && !$replace) {
            return [
                'success'     => false,
                'conflict'    => true,
                'existing_id' => (int)$existing['id'],
                'test_name'   => $existing['test_name'],
                'error'       => "Skenario dengan nama \"{$existing['test_name']}\" sudah ada pada modul ini."
            ];
        }

        $planData = is_string($data['test_plan_json']) ? json_decode($data['test_plan_json'], true) : $data['test_plan_json'];
        if (is_array($planData)) {
            $planData['test_name'] = $testName;
            $this->llmService->resolveEnvPlaceholdersInPlan($planData);
        }
        $planJsonString = is_array($planData) ? json_encode($planData) : (string)$data['test_plan_json'];

        $payload = [
            'module_id'      => $moduleId,
            'test_name'      => $testName,
            'prompt'         => $data['prompt'] ?? '',
            'mode'           => $data['mode'] ?? 'read_only',
            'test_plan_json' => $planJsonString,
            'llm_provider'   => $data['llm_provider'] ?? null,
            'llm_model'      => $data['llm_model'] ?? null,
            'status'         => 'active',
            'is_saved'       => 1
        ];

        if ($existing && $replace) {
            $this->testCaseModel->update($existing['id'], $payload);
            if (count($existingRows) > 1) {
                for ($i = 1; $i < count($existingRows); $i++) {
                    $this->testCaseModel->update($existingRows[$i]['id'], ['is_saved' => 0]);
                }
            }
            return [
                'success'   => true,
                'id'        => (int)$existing['id'],
                'test_name' => $testName,
                'replaced'  => true
            ];
        }

        $testCaseId = $this->testCaseModel->insert($payload);

        return [
            'success'   => true,
            'id'        => (int)$testCaseId,
            'test_name' => $testName,
            'replaced'  => false
        ];
    }

    /**
     * Get saved test cases for a specific module.
     */
    public function getSavedCases(int $moduleId): array
    {
        return $this->testCaseModel->getByModule($moduleId, true);
    }

    /**
     * Delete a saved test case.
     */
    public function deleteSavedCase(int $id): bool
    {
        return (bool)$this->testCaseModel->delete($id);
    }

    /**
     * Update saved test case name (with duplicate check).
     */
    public function updateCaseName(int $id, string $testName): array
    {
        $case = $this->testCaseModel->find($id);
        if (!$case) {
            return ['success' => false, 'error' => 'Skenario tidak ditemukan'];
        }

        $testName = trim($testName);
        if ($testName === '') {
            return ['success' => false, 'error' => 'Nama skenario tidak boleh kosong'];
        }

        $duplicate = $this->testCaseModel
            ->where('module_id', $case['module_id'])
            ->where('test_name', $testName)
            ->where('id !=', $id)
            ->where('is_saved', 1)
            ->first();

        if ($duplicate) {
            return ['success' => false, 'error' => "Nama skenario '{$testName}' sudah digunakan pada modul ini"];
        }

        $ok = (bool)$this->testCaseModel->update($id, ['test_name' => $testName]);
        return ['success' => $ok, 'error' => $ok ? null : 'Gagal memperbarui nama skenario'];
    }

    /**
     * Get all active business modules.
     */
    public function getModules(): array
    {
        return $this->moduleModel->orderBy('id', 'ASC')->findAll();
    }

    /**
     * Create a new business module.
     */
    public function saveModule(array $data): array
    {
        $name = trim($data['name'] ?? '');
        if ($name === '') {
            return ['success' => false, 'error' => 'Nama modul bisnis tidak boleh kosong'];
        }

        $rawCode = trim($data['code'] ?? '');
        $isAutoCode = ($rawCode === '');
        $code = $isAutoCode
            ? strtolower(trim(preg_replace('/[^a-zA-Z0-9_-]+/', '_', $name), '_'))
            : $rawCode;

        if ($code === '') {
            $code = 'modul_' . time();
        }
        $code = mb_substr($code, 0, 50);

        $existing = $this->moduleModel->where('code', $code)->first();
        if ($existing) {
            if ($isAutoCode) {
                $code = mb_substr($code, 0, 40) . '_' . substr((string)time(), -4);
            } else {
                return ['success' => false, 'error' => "Kode modul '{$code}' sudah digunakan"];
            }
        }

        $config = config('AiAutomationTest');
        $baseUrl = trim($data['base_url'] ?? '');
        if ($baseUrl === '') {
            $baseUrl = $config->targetBaseUrl;
        }

        $moduleId = $this->moduleModel->insert([
            'name'          => mb_substr($name, 0, 100),
            'code'          => $code,
            'base_url'      => $baseUrl,
            'business_flow' => !empty($data['business_flow']) ? trim($data['business_flow']) : null,
            'key_elements'  => !empty($data['key_elements']) ? trim($data['key_elements']) : null,
            'status'        => 'active',
        ]);

        if (!$moduleId) {
            return ['success' => false, 'error' => 'Gagal menyimpan modul bisnis'];
        }

        return [
            'success' => true,
            'id'      => (int)$moduleId,
            'module'  => $this->moduleModel->find($moduleId),
        ];
    }

    /**
     * Update an existing business module.
     */
    public function updateModule(int $id, array $data): array
    {
        $module = $this->moduleModel->find($id);
        if (!$module) {
            return ['success' => false, 'error' => 'Modul bisnis tidak ditemukan'];
        }

        $name = trim($data['name'] ?? '');
        if ($name === '') {
            return ['success' => false, 'error' => 'Nama modul bisnis tidak boleh kosong'];
        }

        $rawCode = trim($data['code'] ?? '');
        $code = $rawCode !== ''
            ? mb_substr($rawCode, 0, 50)
            : ($module['code'] ?: strtolower(trim(preg_replace('/[^a-zA-Z0-9_-]+/', '_', $name), '_')));

        $duplicate = $this->moduleModel->where('code', $code)->where('id !=', $id)->first();
        if ($duplicate) {
            return ['success' => false, 'error' => "Kode modul '{$code}' sudah digunakan oleh modul lain"];
        }

        $updateData = [
            'name' => mb_substr($name, 0, 100),
            'code' => $code,
        ];
        if (!empty($data['base_url'])) {
            $updateData['base_url'] = trim($data['base_url']);
        }
        if (array_key_exists('business_flow', $data)) {
            $updateData['business_flow'] = !empty($data['business_flow']) ? trim($data['business_flow']) : null;
        }

        $ok = $this->moduleModel->update($id, $updateData);
        if (!$ok) {
            return ['success' => false, 'error' => 'Gagal memperbarui modul bisnis'];
        }

        return [
            'success' => true,
            'module'  => $this->moduleModel->find($id),
        ];
    }

    /**
     * Delete a business module.
     */
    public function deleteModule(int $id): array
    {
        $module = $this->moduleModel->find($id);
        if (!$module) {
            return ['success' => false, 'error' => 'Modul bisnis tidak ditemukan'];
        }

        $ok = (bool)$this->moduleModel->delete($id);
        return ['success' => $ok];
    }
}
