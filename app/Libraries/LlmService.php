<?php

declare(strict_types=1);

namespace App\Libraries;

use App\Libraries\Adapters\ClaudeAdapter;
use App\Libraries\Adapters\ClaudeCliAdapter;
use App\Libraries\Adapters\GeminiAdapter;
use App\Libraries\Adapters\GroqAdapter;
use App\Libraries\Adapters\OllamaAdapter;
use App\Libraries\Adapters\OpenAiAdapter;
use App\Models\AiPageElementModel;
use App\Models\AiPageScanModel;

/**
 * Class LlmService
 *
 * Enterprise Orchestrator for LLM Test Plan Generation with Grounded RAG.
 * Handles provider adapters, prompt engineering, stop-words NLP filtering,
 * and contextual element injection.
 *
 * @package App\Libraries
 */
class LlmService
{
    /**
     * Maximum number of UI elements to inject into the LLM prompt context.
     */
    public const DEFAULT_RAG_ELEMENT_LIMIT = 55;

    /**
     * Indonesian NLP Stop Words Map for O(1) keyword filtering.
     */
    protected const INDONESIAN_STOP_WORDS = [
        'dan' => 1, 'atau' => 1, 'yang' => 1, 'dari' => 1, 'untuk' => 1, 'dengan' => 1,
        'pada' => 1, 'ini' => 1, 'itu' => 1, 'lalu' => 1, 'lagi' => 1, 'juga' => 1,
        'saya' => 1, 'mau' => 1, 'ingin' => 1, 'coba' => 1, 'test' => 1, 'buka' => 1,
        'klik' => 1, 'isi' => 1, 'lihat' => 1, 'cek' => 1, 'login' => 1, 'masuk' => 1,
        'akun' => 1, 'halaman' => 1, 'menu' => 1, 'tombol' => 1, 'data' => 1, 'tabel' => 1,
        'semua' => 1, 'user' => 1, 'username' => 1, 'password' => 1, 'sebagai' => 1
    ];

    /**
     * Factory method to obtain an LLM adapter instance by provider name.
     *
     * @param string $provider Name of the provider ('groq', 'openai', 'gemini', etc.)
     * @return LlmAdapterInterface|null
     */
    public function getAdapter(string $provider): ?LlmAdapterInterface
    {
        $normalized = strtolower(trim($provider));

        return match ($normalized) {
            'claude_cli' => new ClaudeCliAdapter(),
            'groq'       => new GroqAdapter(),
            'openai'     => new OpenAiAdapter(),
            'gemini'     => new GeminiAdapter(),
            'claude'     => new ClaudeAdapter(),
            'ollama'     => new OllamaAdapter(),
            default      => null,
        };
    }

    /**
     * Get all active and configured LLM providers.
     *
     * @return array<int, array{name: string, displayName: string, models: array}>
     */
    public function getAvailableProviders(): array
    {
        $providers = [
            new ClaudeCliAdapter(),
            new GroqAdapter(),
            new OpenAiAdapter(),
            new GeminiAdapter(),
            new ClaudeAdapter(),
            new OllamaAdapter(),
        ];

        $configured = [];
        foreach ($providers as $adapter) {
            if ($adapter->isConfigured()) {
                $configured[] = [
                    'name'        => $adapter->getName(),
                    'displayName' => $adapter->getDisplayName(),
                    'models'      => $adapter->getAvailableModels(),
                ];
            }
        }

        return $configured;
    }

    /**
     * Generate structured JSON test plan from natural language test scenario.
     *
     * @param string $provider
     * @param string $model
     * @param mixed  $moduleInfo
     * @param string $baseUrl
     * @param string $mode
     * @param string $testCase
     * @return array{success: bool, plan?: array, raw_response?: string, error?: string}
     */
    public function generatePlan(
        string $provider,
        string $model,
        mixed $moduleInfo,
        string $baseUrl,
        string $mode,
        string $testCase
    ): array {
        $adapter = $this->getAdapter($provider);
        if (!$adapter) {
            return [
                'success' => false,
                'error'   => "Provider '{$provider}' is not supported.",
            ];
        }

        if (!$adapter->isConfigured()) {
            return [
                'success' => false,
                'error'   => "Provider '{$provider}' is not configured with a valid API key.",
            ];
        }

        $systemPrompt = $this->buildSystemPrompt($moduleInfo, $baseUrl, $mode, $testCase);

        $result = $adapter->generateTestPlan($systemPrompt, $testCase, $model);
        if (!empty($result['success']) && !empty($result['plan']) && is_array($result['plan'])) {
            $this->resolveEnvPlaceholdersInPlan($result['plan']);
        }

        return $result;
    }

    /**
     * Alias for generatePlan for backward compatibility.
     */
    public function generate(
        string $provider,
        string $model,
        mixed $moduleInfo,
        string $baseUrl,
        string $mode,
        string $testCase
    ): array {
        return $this->generatePlan($provider, $model, $moduleInfo, $baseUrl, $mode, $testCase);
    }

    /**
     * Alias generateTestPlan supporting alternate parameter order.
     */
    public function generateTestPlan(
        string $testCase,
        mixed $moduleInfo,
        string $baseUrl,
        string $mode = 'read_only',
        ?string $provider = null,
        ?string $model = null
    ): array {
        $config = config('AiAutomationTest');
        $effectiveProvider = !empty($provider) ? $provider : ($config->defaultLlmProvider ?? 'groq');
        $effectiveModel = !empty($model) ? $model : '';
        return $this->generatePlan($effectiveProvider, $effectiveModel, $moduleInfo, $baseUrl, $mode, $testCase);
    }

    /**
     * Construct the enterprise System Prompt with Grounded RAG context.
     *
     * @param mixed  $moduleInfo
     * @param string $baseUrl
     * @param string $mode
     * @param string $userPrompt
     * @return string
     */
    private function buildSystemPrompt(mixed $moduleInfo, string $baseUrl, string $mode, string $userPrompt = ''): string
    {
        $moduleName  = is_array($moduleInfo) ? ($moduleInfo['name'] ?? 'e-Jatra') : ($moduleInfo->name ?? 'e-Jatra');
        $modeDesc    = $mode === 'write_test' ? 'Eksekusi transaksi nyata (Create/Update/Submit)' : 'Hanya inspeksi UI dan navigasi aman';

        $contextSection = '';
        // Inject Auto-Scanned Semantic Form Blocks Context from Database (RAG)
        $scannedContext = $this->getPageContext($userPrompt);
        if (!empty($scannedContext)) {
            $contextSection .= "\n{$scannedContext}\n";
        }

        [$mainMenu, $subMenu] = $this->resolveNavigationTargets($scannedContext, $moduleInfo);

        $config = config('AiAutomationTest');
        $defaultUser = !empty($config->testUsername) ? $config->testUsername : (env('EJATRA_TEST_USERNAME', env('EJATRA_USERNAME', '')));
        $defaultPass = !empty($config->testPassword) ? $config->testPassword : (env('EJATRA_TEST_PASSWORD', env('EJATRA_PASSWORD', '')));
        $defaultUser = trim((string)$defaultUser, "'\"");
        $defaultPass = trim((string)$defaultPass, "'\"");

        $templatePath = APPPATH . 'Config/prompts/qa_system_prompt.txt';
        if (file_exists($templatePath)) {
            $template = file_get_contents($templatePath);
            return str_replace(
                [
                    '{{MODULE_NAME}}',
                    '{{BASE_URL}}',
                    '{{MODE}}',
                    '{{MODE_DESC}}',
                    '{{CONTEXT_SECTION}}',
                    '{{MAIN_MENU}}',
                    '{{SUB_MENU}}',
                    '{{USERNAME_FROM_ENV}}',
                    '{{PASSWORD_FROM_ENV}}',
                ],
                [
                    $moduleName,
                    $baseUrl,
                    $mode,
                    $modeDesc,
                    $contextSection,
                    $mainMenu,
                    $subMenu,
                    $defaultUser ?: '{username_from_env}',
                    $defaultPass ?: '{password_from_env}',
                ],
                $template
            );
        }

        // Fallback minimal prompt if template file is missing
        return "Anda adalah QA Automation Architect untuk {$moduleName}. Base URL: {$baseUrl}. Mode: {$mode} ({$modeDesc}).{$contextSection} Buat test plan JSON dengan steps array berisi action, target, value, expected_result.";
    }

    /**
     * Resolve Main Menu and Submenu names dynamically from scanned context or module metadata.
     * Eliminates hardcoded menu names in prompt templates.
     *
     * @param string $scannedContext
     * @param mixed  $moduleInfo
     * @return array{0: string, 1: string}
     */
    private function resolveNavigationTargets(string $scannedContext, mixed $moduleInfo): array
    {
        // 1. Try to extract from Ground Truth navigation line:
        // Format: Halaman: Menu Utama > Submenu (Navigasi: click "Menu Utama" -> click "Submenu")
        if (!empty($scannedContext)) {
            if (preg_match('/Navigasi:\s*click\s*"([^"]+)"\s*->\s*click\s*"([^"]+)"/', $scannedContext, $matches)) {
                return [trim($matches[1]), trim($matches[2])];
            }
            if (preg_match('/Navigasi:\s*click\s*"([^"]+)"/', $scannedContext, $matches)) {
                return [trim($matches[1]), trim($matches[1])];
            }
            // Fallback for menu map format: "  - Menu Utama > Submenu → /url"
            if (preg_match('/-\s*([^>]+)>\s*([^\s→]+)\s*→/', $scannedContext, $matches)) {
                return [trim($matches[1]), trim($matches[2])];
            }
        }

        // 2. Fallback to moduleInfo metadata if available
        $modulePath = is_array($moduleInfo) ? ($moduleInfo['menu_path'] ?? null) : ($moduleInfo->menu_path ?? null);
        if (!empty($modulePath)) {
            $parts = array_map('trim', explode('>', $modulePath));
            if (count($parts) >= 2) {
                return [$parts[0], $parts[1]];
            }
            if (count($parts) === 1 && !empty($parts[0])) {
                return [$parts[0], $parts[0]];
            }
        }

        $moduleName = is_array($moduleInfo) ? ($moduleInfo['name'] ?? null) : ($moduleInfo->name ?? null);
        if (!empty($moduleName) && $moduleName !== 'e-Jatra') {
            return [$moduleName, $moduleName];
        }

        // 3. Clean generic fallback
        return ['Menu Utama', 'Submenu'];
    }

    /**
     * Retrieve auto-scanned UI context from database based on user prompt keywords.
     *
     * @param string $userPrompt
     * @return string
     */
    private function getPageContext(string $userPrompt): string
    {
        if (empty(trim($userPrompt))) {
            return '';
        }

        try {
            $scanModel = new AiPageScanModel();
            $lastScan  = $scanModel->getLatestCompleted();
            if (!$lastScan) {
                return '';
            }

            $scanId       = (int)$lastScan['id'];
            $elementModel = new AiPageElementModel();

            // Extract NLP keywords using regex tokenizer
            $words    = preg_split('/[\s,.\->:;"]+/', mb_strtolower($userPrompt), -1, PREG_SPLIT_NO_EMPTY);
            $keywords = [];
            foreach ($words as $w) {
                if (mb_strlen($w) >= 2 && !isset(self::INDONESIAN_STOP_WORDS[$w])) {
                    $keywords[$w] = $w;
                }
            }

            if (empty($keywords)) {
                return '';
            }

            // Retrieve relevant elements capped to token budget limit with consecutive path matching
            $elements = $elementModel->getByKeywords($scanId, array_values($keywords), self::DEFAULT_RAG_ELEMENT_LIMIT, $userPrompt);

            if (empty($elements)) {
                $menuMap = $elementModel->getMenuMap($scanId);
                if (empty($menuMap)) return '';

                $navList = implode("\n", array_map(fn($m) => "  - {$m['menu_path']} → {$m['page_url']}", $menuMap));
                return "[PETA NAVIGASI MENU (HASIL SCAN)]\n{$navList}\nNavigasi WAJIB gunakan aksi 'click' menu.";
            }

            return $this->formatElementsAsContext($elements);
        } catch (\Throwable $e) {
            if (function_exists('log_message')) {
                log_message('warning', 'getPageContext error: ' . $e->getMessage());
            }
            return '';
        }
    }

    /**
     * Format scanned elements into a compact structured Semantic Form Block context string for LLM.
     *
     * @param array<int, array> $elements
     * @return string
     */
    private function formatElementsAsContext(array $elements): string
    {
        $grouped = [];
        foreach ($elements as $el) {
            $path  = $el['menu_path'] ?? 'Unknown';
            $block = !empty($el['form_block_name']) ? $el['form_block_name'] : 'Form & Elemen Halaman';
            $sel   = $el['css_selector'] ?? '';
            $elId  = $el['element_id'] ?? '';

            // Filter out template noise sidebars and security token noise
            if (stripos($block, 'TO DO LIST') !== false || stripos($block, 'CHATS') !== false) {
                continue;
            }
            if (stripos($sel, 'recaptcha') !== false || stripos($elId, 'recaptcha') !== false || stripos($elId, 'csrf') !== false) {
                continue;
            }

            $grouped[$path]['title']                        = $el['page_title'] ?? '';
            $grouped[$path]['blocks'][$block]['elements'][] = $el;
        }

        $output  = "[GROUND TRUTH ELEMEN UI AKTUAL (SUMBER KEBENARAN)]\n";
        $output .= "- Utamakan selector hasil scan ini. Select2 -> aksi 'search', Native -> 'select'.\n\n";

        foreach ($grouped as $menuPath => $pageData) {
            $parts = array_values(array_filter(array_map('trim', explode('>', $menuPath)), fn($p) => $p !== ''));
            if (strtolower($menuPath) === 'halaman utama') {
                $output .= "Halaman: Halaman Utama (Landing Page otomatis setelah Login; tidak perlu klik menu navigasi jika baru selesai login)\n";
            } elseif (count($parts) >= 2) {
                $navChain = implode(' -> ', array_map(fn($p) => "click \"{$p}\"", $parts));
                $output .= "Halaman: {$menuPath} (Navigasi: {$navChain})\n";
            } else {
                $output .= "Halaman: {$menuPath} (Navigasi: click \"{$menuPath}\")\n";
            }

            // Map tab button text -> css_selector dynamically from scanned buttons on this page
            $tabButtonMap = [];
            foreach ($pageData['blocks'] as $bData) {
                foreach ($bData['elements'] as $bel) {
                    if (($bel['element_category'] ?? '') === 'button' && !empty($bel['button_text']) && !empty($bel['css_selector'])) {
                        $tabButtonMap[mb_strtolower(trim($bel['button_text']))] = $bel['css_selector'];
                    }
                }
            }

            foreach ($pageData['blocks'] as $blockName => $blockData) {
                // Check if any element has a scanned trigger selector
                $blockTrigger = null;
                foreach ($blockData['elements'] as $bel) {
                    if (!empty($bel['trigger_selector'])) {
                        $blockTrigger = $bel['trigger_selector'];
                        break;
                    }
                }

                // If trigger_selector is absent, match against scanned tab buttons or derive slug generically
                if (empty($blockTrigger) && stripos($blockName, 'Tab:') === 0) {
                    $tabLabel = trim(substr($blockName, 4));
                    $tabKey   = mb_strtolower($tabLabel);
                    if (isset($tabButtonMap[$tabKey])) {
                        $blockTrigger = $tabButtonMap[$tabKey];
                    } elseif ($tabLabel !== '') {
                        $slug = strtolower(trim(preg_replace('/[^a-zA-Z0-9]+/', '-', $tabLabel), '-'));
                        if ($slug !== '') {
                            $blockTrigger = "#{$slug}-tab";
                        }
                    }
                }

                $switchHint = '';
                if (!empty($blockTrigger)) {
                    $switchHint = " [aktifkan: click \"{$blockTrigger}\"]";
                } elseif (stripos($blockName, 'Modal:') !== false) {
                    $switchHint = ' [modal dialog]';
                }
                $output .= " [{$blockName}]{$switchHint}\n";

                $rowActions = [];
                foreach ($blockData['elements'] as $el) {
                    $cat       = $el['element_category'] ?? '';
                    $sel       = $el['css_selector'] ?? '';
                    $rawLabel  = !empty($el['label_text']) ? trim($el['label_text']) : '';
                    $titleAttr = !empty($el['title_attr']) ? trim($el['title_attr']) : '';
                    $ariaLabel = !empty($el['aria_label']) ? trim($el['aria_label']) : '';
                    $placeH    = !empty($el['placeholder']) ? trim($el['placeholder']) : '';
                    $name      = !empty($el['element_name']) ? trim($el['element_name']) : '';

                    $label = $rawLabel !== '' ? $rawLabel : (
                        $titleAttr !== '' ? $titleAttr : (
                            $ariaLabel !== '' ? $ariaLabel : (
                                $placeH !== '' ? $placeH : (
                                    $name !== '' ? $name : 'Input'
                                )
                            )
                        )
                    );
                    $cleanLabel = trim(preg_replace('/[^\p{L}\p{N}\s\-\(\)\/\._*]/u', '', $label));
                    if (!empty($cleanLabel)) $label = $cleanLabel;

                    if ($cat === 'dropdown' && (str_ends_with($name, '_length') || str_contains($sel, '_length'))) {
                        $label = (!empty($rawLabel) && $rawLabel !== $name) ? "{$cleanLabel} (Tampilkan Entri / Baris)" : "Tampilkan Entri / Baris Per Halaman ({$name})";
                    } elseif ($cat === 'input' && ($sel === 'input[type="search"]' || ($el['element_type'] ?? '') === 'search')) {
                        $label = !empty($rawLabel) ? $cleanLabel : 'Cari Data Tabel (Search)';
                    }

                    if ($cat === 'input') {
                        $req    = !empty($el['is_required']) ? '*' : '';
                        $type   = $el['element_type'] ?? 'text';
                        $output .= "   - in: \"{$label}{$req}\" [{$type}] -> fill \"{$sel}\"\n";
                    } elseif ($cat === 'dropdown') {
                        $widgetType = $el['widget_type'] ?? 'native';
                        $action     = ($widgetType === 'select2' || $widgetType === 'tomselect') ? 'search' : 'select';
                        $sample     = '';
                        if (!empty($el['options_sample'])) {
                            $opts = json_decode($el['options_sample'], true);
                            if (is_array($opts) && !empty($opts) && !empty($opts[0])) {
                                $sample = ' (contoh: ' . $opts[0] . ')';
                            }
                        }
                        $output .= "   - {$action}: \"{$label}\" -> {$action} \"{$sel}\"{$sample}\n";
                    } elseif ($cat === 'button' && (!empty($el['button_text']) || !empty($el['icon_hint']))) {
                        $btnText = !empty($el['button_text']) ? trim($el['button_text']) : (!empty($el['icon_hint']) ? trim($el['icon_hint']) : '');
                        $cleanBtn = trim(preg_replace('/[^\p{L}\p{N}\s\-\(\)\/\._]/u', '', $btnText));
                        if (!empty($cleanBtn)) $btnText = $cleanBtn;
                        $targetHint = !empty($sel) ? "\"{$sel}\"" : "text \"{$btnText}\"";
                        $output .= "   - btn: \"{$btnText}\" -> click {$targetHint}\n";
                    } elseif ($cat === 'row_action') {
                        $btnText = trim(preg_replace('/[^\p{L}\p{N}\s\-\(\)\/\._]/u', '', $el['button_text'] ?? ''));
                        if ($btnText !== '') {
                            $targetHint = !empty($sel) ? "\"{$sel}\"" : "text \"{$btnText}\"";
                            $output .= "   - row_action: \"{$btnText}\" -> click {$targetHint}\n";
                        }
                    } elseif ($cat === 'table') {
                        $output .= "   - table: \"{$sel}\"\n";
                    } elseif ($cat === 'heading') {
                        $label = !empty($el['label_text']) ? trim($el['label_text']) : (!empty($el['button_text']) ? trim($el['button_text']) : 'Display/Indikator');
                        $targetHint = !empty($sel) ? "\"{$sel}\"" : "text \"{$label}\"";
                        $output .= "   - indicator: \"{$label}\" -> assert_text {$targetHint} (display nilai)\n";
                    }
                }
            }
            $output .= "\n";
        }

        return rtrim($output);
    }

    /**
     * Resolve environment variable placeholders in test plan steps.
     * Prevents literal '{username_from_env}' from reaching test runner if LLM echoes the placeholder.
     *
     * @param array  $plan
     * @param string $defaultUser
     * @param string $defaultPass
     * @return void
     */
    public function resolveEnvPlaceholdersInPlan(array &$plan, string $defaultUser = '', string $defaultPass = ''): void
    {
        if (empty($defaultUser) || empty($defaultPass)) {
            $config = config('AiAutomationTest');
            $defaultUser = $defaultUser ?: trim((string)($config->testUsername ?? env('EJATRA_TEST_USERNAME', '')), "'\"");
            $defaultPass = $defaultPass ?: trim((string)($config->testPassword ?? env('EJATRA_TEST_PASSWORD', '')), "'\"");
        }

        if (empty($plan['steps']) || !is_array($plan['steps'])) {
            return;
        }

        foreach ($plan['steps'] as &$step) {
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
