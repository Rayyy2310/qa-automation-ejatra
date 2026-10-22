<?php

namespace App\Libraries\Adapters;

use App\Libraries\LlmAdapterInterface;

class GroqAdapter implements LlmAdapterInterface
{
    public function getName(): string
    {
        return 'groq';
    }

    public function getDisplayName(): string
    {
        return 'Groq (Ultra Fast)';
    }

    public function getAvailableModels(): array
    {
        return [
            'openai/gpt-oss-120b',
            'qwen/qwen3.8-27b',
            'openai/gpt-oss-20b',
            'qwen/qwen3.6-27b',
        ];
    }

    public function isConfigured(): bool
    {
        return !empty(env('GROQ_API_KEY'));
    }

    public function generateTestPlan(string $systemPrompt, string $userPrompt, string $model = ''): array
    {
        if (empty($model)) {
            $model = $this->getAvailableModels()[0];
        }

        $apiKey = function_exists('env') ? env('GROQ_API_KEY') : (getenv('GROQ_API_KEY') ?: ($_ENV['GROQ_API_KEY'] ?? ''));
        if (empty($apiKey)) {
            return [
                'success' => false,
                'test_plan' => null,
                'raw_response' => '',
                'error' => 'API Key Groq tidak ditemukan di file .env.',
                'usage' => []
            ];
        }

        return $this->executeWithFallback($apiKey, $model, $systemPrompt, $userPrompt);
    }

    /**
     * Executes the Groq completion request with adaptive JSON handling and multi-model fallback.
     */
    private function executeWithFallback(string $apiKey, string $model, string $systemPrompt, string $userPrompt): array
    {
        // Attempt 1: Standard request with json_object enforcement
        $call = $this->sendChatCompletion($apiKey, $model, $systemPrompt, $userPrompt, true, 4096);

        // If Groq rejects json_object mode (e.g. models emitting <think> tags or pre-text)
        if ($call['http_code'] === 400 && $this->isJsonFormatError($call['response'])) {
            // Attempt 2: Retry without strict json_object enforcement (parseJsonSafely handles <think> stripping)
            $call = $this->sendChatCompletion($apiKey, $model, $systemPrompt, $userPrompt, false, 4096);
        }

        // If current model failed and it's not the primary model (gpt-oss-120b), fallback to primary model
        if ($call['http_code'] >= 400 && $model !== 'openai/gpt-oss-120b') {
            $fallbackModel = 'openai/gpt-oss-120b';
            $call = $this->sendChatCompletion($apiKey, $fallbackModel, $systemPrompt, $userPrompt, true, 4096);
            if ($call['http_code'] === 400 && $this->isJsonFormatError($call['response'])) {
                $call = $this->sendChatCompletion($apiKey, $fallbackModel, $systemPrompt, $userPrompt, false, 4096);
            }
        }

        if (!empty($call['curl_error'])) {
            return [
                'success' => false,
                'test_plan' => null,
                'raw_response' => '',
                'error' => "cURL Error: " . $call['curl_error'],
                'usage' => []
            ];
        }

        $result = json_decode($call['response'], true);

        if ($call['http_code'] >= 400) {
            $errorMsg = $result['error']['message'] ?? 'Unknown API error';
            if ($call['http_code'] === 429) {
                $errorMsg = 'Rate limit exceeded: ' . $errorMsg;
            } elseif ($call['http_code'] === 401) {
                $errorMsg = 'Authentication error: ' . $errorMsg;
            } else {
                $errorMsg = "Server error ({$call['http_code']}): " . $errorMsg;
            }
            return [
                'success' => false,
                'test_plan' => null,
                'raw_response' => $call['response'],
                'error' => $errorMsg,
                'usage' => []
            ];
        }

        $content = $result['choices'][0]['message']['content'] ?? '';
        $usage = $result['usage'] ?? [];

        $testPlan = $this->parseJsonSafely($content);

        if (!$testPlan || !is_array($testPlan)) {
            return [
                'success' => false,
                'test_plan' => null,
                'raw_response' => $content,
                'error' => 'Gagal membaca format JSON dari output AI. Silakan coba kembali atau gunakan prompt yang lebih spesifik.',
                'usage' => $usage
            ];
        }

        return [
            'success' => true,
            'test_plan' => $testPlan,
            'raw_response' => $content,
            'error' => null,
            'usage' => $usage
        ];
    }

    /**
     * Checks if Groq error is related to JSON validation or generation in json_object mode.
     */
    private function isJsonFormatError(string $response): bool
    {
        return str_contains($response, 'Failed to generate JSON') ||
               str_contains($response, 'Failed to validate JSON');
    }

    /**
     * Send HTTP cURL request to Groq OpenAI-compatible Chat Completions API.
     */
    private function sendChatCompletion(string $apiKey, string $model, string $systemPrompt, string $userPrompt, bool $forceJsonMode, int $maxTokens): array
    {
        $data = [
            'model' => $model,
            'messages' => [
                ['role' => 'system', 'content' => $systemPrompt],
                ['role' => 'user', 'content' => $userPrompt]
            ],
            'temperature' => 0.1,
            'max_tokens' => $maxTokens
        ];

        if ($forceJsonMode) {
            $data['response_format'] = ['type' => 'json_object'];
        }

        $ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $apiKey,
            'Content-Type: application/json'
        ]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 60);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_errno($ch) ? curl_error($ch) : '';
        curl_close($ch);

        return [
            'http_code' => $httpCode,
            'response' => $response ?: '',
            'curl_error' => $curlError
        ];
    }

    private function parseJsonSafely(string $rawContent): ?array
    {
        // 1. Strip think tags
        $clean = preg_replace('/<think>[\s\S]*?<\/think>/i', '', $rawContent);
        if (str_contains($clean, '<think>')) {
            $clean = preg_replace('/<think>[\s\S]*?(\{[\s\S]*)/i', '$1', $clean);
        }
        $clean = trim($clean);

        // 2. Extract code fence if any
        if (preg_match('/```(?:json)?\s*([\s\S]*?)\s*```/i', $clean, $matches)) {
            $clean = $matches[1];
        }

        // 3. Find outermost JSON object boundaries
        $startPos = strpos($clean, '{');
        $endPos = strrpos($clean, '}');
        if ($startPos !== false && $endPos !== false && $endPos > $startPos) {
            $clean = substr($clean, $startPos, $endPos - $startPos + 1);
        }

        // 4. Try standard JSON decode
        $decoded = json_decode($clean, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
            return $decoded;
        }

        // 5. Clean common LLM formatting inconsistencies (trailing commas, comments)
        $fixed = preg_replace('/,\s*([\}\]])/', '$1', $clean);
        $fixed = preg_replace('/\/\/[^\n]*/', '', $fixed);
        $fixed = preg_replace('/\/\*[\s\S]*?\*\//', '', $fixed);

        $decoded = json_decode($fixed, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
            return $decoded;
        }

        // 6. If JSON was truncated, attempt auto-closing unclosed strings & brackets
        $unclosed = $fixed;
        $quoteCount = substr_count($unclosed, '"') - substr_count($unclosed, '\"');
        if ($quoteCount % 2 !== 0) {
            $unclosed .= '"';
        }
        $openBrackets = substr_count($unclosed, '[') - substr_count($unclosed, ']');
        $openBraces = substr_count($unclosed, '{') - substr_count($unclosed, '}');
        for ($i = 0; $i < $openBrackets; $i++) {
            $unclosed .= ']';
        }
        for ($i = 0; $i < $openBraces; $i++) {
            $unclosed .= '}';
        }

        $decoded = json_decode($unclosed, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
            return $decoded;
        }

        return null;
    }
}
