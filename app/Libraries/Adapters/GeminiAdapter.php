<?php

namespace App\Libraries\Adapters;

use App\Libraries\LlmAdapterInterface;

class GeminiAdapter implements LlmAdapterInterface
{
    public function getName(): string
    {
        return 'gemini';
    }

    public function getDisplayName(): string
    {
        return 'Gemini';
    }

    public function getAvailableModels(): array
    {
        return ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'];
    }

    public function isConfigured(): bool
    {
        return !empty(env('GEMINI_API_KEY'));
    }

    public function generateTestPlan(string $systemPrompt, string $userPrompt, string $model = ''): array
    {
        if (empty($model)) {
            $model = $this->getAvailableModels()[0];
        }

        $apiKey = env('GEMINI_API_KEY');
        $url = "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$apiKey}";

        $data = [
            'contents' => [
                [
                    'parts' => [
                        ['text' => $userPrompt]
                    ]
                ]
            ],
            'systemInstruction' => [
                'parts' => [
                    ['text' => $systemPrompt]
                ]
            ],
            'generationConfig' => [
                'temperature' => 0.1,
                'maxOutputTokens' => 4096,
                'responseMimeType' => 'application/json'
            ]
        ];

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
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

        $content = $result['candidates'][0]['content']['parts'][0]['text'] ?? '';
        $usage = $result['usageMetadata'] ?? [];

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
