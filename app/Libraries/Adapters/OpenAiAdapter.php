<?php

namespace App\Libraries\Adapters;

use App\Libraries\LlmAdapterInterface;

class OpenAiAdapter implements LlmAdapterInterface
{
    public function getName(): string
    {
        return 'openai';
    }

    public function getDisplayName(): string
    {
        return 'OpenAI';
    }

    public function getAvailableModels(): array
    {
        return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'];
    }

    public function isConfigured(): bool
    {
        return !empty(env('OPENAI_API_KEY'));
    }

    public function generateTestPlan(string $systemPrompt, string $userPrompt, string $model = ''): array
    {
        if (empty($model)) {
            $model = $this->getAvailableModels()[0];
        }

        $apiKey = env('OPENAI_API_KEY');
        $url = 'https://api.openai.com/v1/chat/completions';

        $data = [
            'model' => $model,
            'messages' => [
                ['role' => 'system', 'content' => $systemPrompt],
                ['role' => 'user', 'content' => $userPrompt]
            ],
            'temperature' => 0.1,
            'max_tokens' => 4096,
            'response_format' => ['type' => 'json_object']
        ];

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $apiKey,
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

        $content = $result['choices'][0]['message']['content'] ?? '';
        $usage = $result['usage'] ?? [];

        // Parse JSON content
        $testPlan = null;
        $cleanContent = trim($content);
        
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
