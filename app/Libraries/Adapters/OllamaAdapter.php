<?php

namespace App\Libraries\Adapters;

use App\Libraries\LlmAdapterInterface;

class OllamaAdapter implements LlmAdapterInterface
{
    private string $baseUrl;

    public function __construct()
    {
        $this->baseUrl = rtrim(env('OLLAMA_BASE_URL', 'http://localhost:11434'), '/');
    }

    public function getName(): string
    {
        return 'ollama';
    }

    public function getDisplayName(): string
    {
        return 'Ollama (Local)';
    }

    public function getAvailableModels(): array
    {
        $url = $this->baseUrl . '/api/tags';
        
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 2); // Short timeout for checking models
        $response = curl_exec($ch);
        
        if (curl_errno($ch)) {
            curl_close($ch);
            return ['llama3', 'mistral', 'codellama', 'qwen2']; // fallback
        }
        
        curl_close($ch);
        
        $result = json_decode($response, true);
        if (isset($result['models']) && is_array($result['models'])) {
            $models = array_map(function($model) {
                return $model['name'];
            }, $result['models']);
            
            if (!empty($models)) {
                return $models;
            }
        }
        
        return ['llama3', 'mistral', 'codellama', 'qwen2']; // fallback
    }

    public function isConfigured(): bool
    {
        $url = $this->baseUrl . '/api/tags';
        
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 2);
        curl_setopt($ch, CURLOPT_NOBODY, true);
        curl_exec($ch);
        
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_errno($ch);
        curl_close($ch);
        
        return !$error && $httpCode === 200;
    }

    public function generateTestPlan(string $systemPrompt, string $userPrompt, string $model = ''): array
    {
        if (empty($model)) {
            $model = $this->getAvailableModels()[0];
        }

        $url = $this->baseUrl . '/api/chat';

        $data = [
            'model' => $model,
            'messages' => [
                ['role' => 'system', 'content' => $systemPrompt],
                ['role' => 'user', 'content' => $userPrompt]
            ],
            'format' => 'json',
            'stream' => false,
            'options' => [
                'temperature' => 0.1,
                'num_predict' => 512
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
            $errorMsg = $result['error'] ?? 'Unknown API error';
            return [
                'success' => false,
                'test_plan' => null,
                'raw_response' => $response,
                'error' => "API Error ($httpCode): " . $errorMsg,
                'usage' => []
            ];
        }

        $content = $result['message']['content'] ?? '';
        $usage = [
            'prompt_eval_count' => $result['prompt_eval_count'] ?? 0,
            'eval_count' => $result['eval_count'] ?? 0,
            'eval_duration' => $result['eval_duration'] ?? 0
        ];

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
