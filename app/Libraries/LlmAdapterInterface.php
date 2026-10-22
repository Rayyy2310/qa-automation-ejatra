<?php

namespace App\Libraries;

interface LlmAdapterInterface
{
    /**
     * Get the short name of the adapter.
     */
    public function getName(): string;

    /**
     * Get the display name of the adapter.
     */
    public function getDisplayName(): string;

    /**
     * Get the list of available models for this adapter.
     *
     * @return string[]
     */
    public function getAvailableModels(): array;

    /**
     * Check if the adapter is configured and ready to be used.
     */
    public function isConfigured(): bool;

    /**
     * Generate test plan using the given prompt.
     *
     * @param string $systemPrompt
     * @param string $userPrompt
     * @param string $model
     * @return array Returns: ['success' => bool, 'test_plan' => array|null, 'raw_response' => string, 'error' => string|null, 'usage' => array]
     */
    public function generateTestPlan(string $systemPrompt, string $userPrompt, string $model = ''): array;
}
