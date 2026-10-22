<?php

namespace App\Libraries\Adapters;

use App\Libraries\LlmAdapterInterface;

class ClaudeAdapter implements LlmAdapterInterface
{
    public function getName(): string
    {
        return 'claude';
    }

    public function getDisplayName(): string
    {
        return 'Claude';
    }

    public function getAvailableModels(): array
    {
        return ['claude-sonnet-4-20250514', 'claude-haiku-4-20250514'];
    }

    public function isConfigured(): bool
    {
        return !empty(env('CLAUDE_API_KEY'));
    }

    public function generateTestPlan(string $systemPrompt, string $userPrompt, string $model = ''): array
    {
        if (empty($model)) {
            $model = $this->getAvailableModels()[0];
        }

        $apiKey = env('CLAUDE_API_KEY');
        $url = 'https://api.anthropic.com/v1/messages';

        $data = [
            'model' => $model,
            'max_tokens' => 4096,
            'system' => $systemPrompt,
            'messages' => [
                ['role' => 'user', 'content' => $userPrompt]
            ],
            'temperature' => 0.1
        ];

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'x-api-key: ' . $apiKey,
            'anthropic-version: 2023-06-01',
            'Content-Type: application/json'
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        
        if (curl_errno($ch)) {
            $error = curl_error($ch);
            curl_close($ch);
            return [
                'success' => false,
                'test_plan' => null,
                'raw_response' => '',
                'error' => "cURL Error: $error",
                'usage' => []
            ];
        }
        
        curl_close($ch);

        $result = json_decode($response, true);

        if ($httpCode >= 400) {
            $errorMsg = $result['error']['message'] ?? 'Unknown API error';
            return [
                'success' => false,
                'test_plan' => null,
                'raw_response' => $response,
                'error' => "API Error ($httpCode): " . $errorMsg,
                'usage' => []
            ];
        }

        $content = $result['content'][0]['text'] ?? '';
        $usage = $result['usage'] ?? [];

        // Parse JSON content
        $testPlan = null;
        $cleanContent = trim($content);
        
        // Remove markdown code fences if any
        if (preg_match('/^```(?:json)?\s*(.*?)\s*```$/s', $cleanContent, $matches)) {
            $cleanContent = $matches[1];
        }
        
        $testPlan = json_decode($cleanContent, true);
        
        if (json_last_error() !== JSON_ERROR_NONE) {
            return [
                'success' => false,
                'test_plan' => null,
                'raw_response' => $content,
                'error' => 'Failed to parse JSON response: ' . json_last_error_msg(),
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
}
