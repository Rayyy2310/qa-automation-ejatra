<?php

namespace App\Libraries;

use Config\AiAutomationTest as AiAutomationTestConfig;

/**
 * Service to manage communication with the background Node.js Playwright test execution service.
 */
class TestServiceRunner
{
    protected AiAutomationTestConfig $config;

    public function __construct(?AiAutomationTestConfig $config = null)
    {
        $this->config = $config ?? config('AiAutomationTest');
    }

    /**
     * Dispatch a test plan execution asynchronously to the Node.js test service.
     *
     * @param int $runId
     * @param array $testPlan
     * @param string $baseUrl
     * @param string $mode
     * @param bool $headless
     * @return array
     */
    public function dispatchRun(int $runId, array $testPlan, string $baseUrl, string $mode, bool $headless = false): array
    {
        $endpoint = rtrim($this->config->testServiceUrl, '/') . '/internal/test-runs';
        $internalToken = $this->config->internalApiToken;

        $payload = json_encode([
            'run_id' => $runId,
            'test_plan' => $testPlan,
            'base_url' => $baseUrl,
            'mode' => $mode,
            'headless' => $headless
        ]);

        $ch = curl_init($endpoint);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'X-Internal-Token: ' . $internalToken,
                'Content-Length: ' . strlen($payload)
            ],
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT => 6
        ]);

        $response = curl_exec($ch);
        $curlError = curl_error($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($response === false || ($httpCode >= 400 && $httpCode !== 202)) {
            $errorMessage = !empty($curlError)
                ? "Gagal menghubungi Node.js Test Service di port 3001. Pastikan service sudah aktif (`cd test-service && node src/server.js`). Error: {$curlError}"
                : "Node.js Test Service merespons error (HTTP {$httpCode}): {$response}";

            return [
                'success' => false,
                'http_code' => $httpCode,
                'error' => $errorMessage
            ];
        }

        $decodedResponse = json_decode($response, true) ?: [];

        return [
            'success' => true,
            'http_code' => $httpCode,
            'response' => $decodedResponse
        ];
    }

    /**
     * Check if Node.js Playwright Runner service is alive and healthy.
     *
     * @return array
     */
    public function checkHealth(): array
    {
        $endpoint = rtrim($this->config->testServiceUrl, '/') . '/health';

        $ch = curl_init($endpoint);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_TIMEOUT => 3
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $isOnline = ($response !== false && $httpCode === 200);

        return [
            'online' => $isOnline,
            'http_code' => $httpCode,
            'data' => $isOnline ? json_decode($response, true) : null
        ];
    }

    /**
     * Reset all browser sessions on the Node.js test service.
     */
    public function resetAllBrowsers(): bool
    {
        $endpoint = rtrim($this->config->testServiceUrl, '/') . '/internal/reset-browsers';
        $internalToken = $this->config->internalApiToken;

        $ch = curl_init($endpoint);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => '{}',
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'X-Internal-Token: ' . $internalToken
            ],
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_TIMEOUT => 4
        ]);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        return ($response !== false && $httpCode === 200);
    }
}

