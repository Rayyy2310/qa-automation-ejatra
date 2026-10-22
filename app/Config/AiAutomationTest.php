<?php

namespace Config;

use CodeIgniter\Config\BaseConfig;

class AiAutomationTest extends BaseConfig
{
    public array $allowedActions = ['goto', 'click', 'fill', 'select', 'search', 'wait', 'assert_visible', 'assert_text', 'assert_color', 'assert_style', 'assert_url', 'screenshot'];
    public array $readOnlyForbiddenActions = ['fill', 'select', 'click', 'submit'];
    public int $maxStepsPerPlan = 50;
    public int $defaultTimeoutMs = 15000;
    public int $defaultRetryAttempts = 3;
    public array $defaultBackoffMs = [1000, 2000, 4000];
    public string $testServiceUrl = 'http://localhost:3001';
    public string $testServiceBaseUrl = 'http://localhost:3001';
    public string $internalApiToken = '';
    public string $screenshotPath = WRITEPATH . 'screenshots/';
    public string $testUsername = '';
    public string $testPassword = '';
    public string $targetBaseUrl = '';
    public int $maxConcurrentRuns = 4;
    public array $validWaitBeforeTypes = ['visible', 'attached', 'enabled', 'network_idle', 'url_change', 'response', 'none'];
    public array $validPostActionWaitTypes = ['network_idle', 'dom_stable', 'toast_visible', 'none'];
    public array $validTargetStrategies = ['test_id', 'role', 'text', 'css', 'xpath'];

    public function __construct()
    {
        parent::__construct();
        $this->testServiceUrl = env('TEST_SERVICE_URL', 'http://localhost:3001');
        $this->testServiceBaseUrl = $this->testServiceUrl;
        $this->internalApiToken = env('INTERNAL_API_TOKEN', '');
        $this->testUsername = env('EJATRA_TEST_USERNAME', env('EJATRA_USERNAME', ''));
        $this->testPassword = env('EJATRA_TEST_PASSWORD', env('EJATRA_PASSWORD', ''));
        $this->targetBaseUrl = env('EJATRA_TESTING_BASE_URL', '');
        $this->maxConcurrentRuns = max(1, (int)env('MAX_CONCURRENT_RUNS', 4));
    }

    /**
     * Build a full URL to an endpoint of the Node.js runner service (e.g. '/internal/scan').
     */
    public function runnerUrl(string $path = ''): string
    {
        return rtrim($this->testServiceUrl, '/') . $path;
    }
}
