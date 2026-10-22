<?php

namespace App\Libraries\Adapters;

use App\Libraries\LlmAdapterInterface;

/**
 * Adapter to invoke Claude Pro via Claude Code CLI (Monthly Subscription)
 * Allows using your $20/mo Claude Pro account without separate API token costs!
 */
class ClaudeCliAdapter implements LlmAdapterInterface
{
    public function getName(): string
    {
        return 'claude_cli';
    }

    public function getDisplayName(): string
    {
        return 'Claude Pro (Langganan Web / CLI)';
    }

    public function getAvailableModels(): array
    {
        return [
            'claude-3-7-sonnet',
            'claude-3-5-sonnet',
            'claude-3-5-haiku'
        ];
    }

    public function isConfigured(): bool
    {
        $enabled = env('CLAUDE_CLI_ENABLED');
        return ($enabled === true || $enabled === 'true' || $enabled === '1' || $enabled === 1);
    }

    public function generateTestPlan(string $systemPrompt, string $userPrompt, string $model = ''): array
    {
        $fullPrompt = $systemPrompt . "\n\n[USER SCENARIO INSTRUCTION]:\n" . $userPrompt . "\n\nIngat: HANYA berikan 1 objek JSON valid tanpa teks pembuka atau penutup markdown apapun.";

        // Execute local Claude CLI
        $descriptorSpec = [
            0 => ["pipe", "r"], // stdin
            1 => ["pipe", "w"], // stdout
            2 => ["pipe", "w"]  // stderr
        ];

        $cmd = 'claude -p ' . escapeshellarg($fullPrompt) . ' --output-format json';
        
        $process = proc_open($cmd, $descriptorSpec, $pipes);

        if (!is_resource($process)) {
            return [
                'success' => false,
                'error' => 'Gagal menjalankan Claude Code CLI di sistem lokal Anda.'
            ];
        }

        fclose($pipes[0]);
        $stdout = stream_get_contents($pipes[1]);
        fclose($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[2]);

        $returnCode = proc_close($process);

        if ($returnCode !== 0 && empty($stdout)) {
            return [
                'success' => false,
                'error' => 'Claude CLI error: ' . (!empty($stderr) ? $stderr : 'Pastikan Anda sudah menjalankan "claude" di terminal dan login dengan akun Claude Pro.')
            ];
        }

        return $this->parseJsonSafely($stdout);
    }

    private function parseJsonSafely(string $content): array
    {
        $clean = preg_replace('/<think>.*?<\/think>/s', '', $content);
        $clean = preg_replace('/<think>.*$/s', '', $clean);

        if (preg_match('/```(?:json)?\s*([\s\S]*?)\s*```/', $clean, $matches)) {
            $clean = $matches[1];
        }

        $clean = trim($clean);
        $firstBrace = strpos($clean, '{');
        $lastBrace = strrpos($clean, '}');

        if ($firstBrace !== false && $lastBrace !== false && $lastBrace > $firstBrace) {
            $clean = substr($clean, $firstBrace, $lastBrace - $firstBrace + 1);
        }

        $clean = preg_replace('/,\s*([\}\]])/', '$1', $clean);

        $parsed = json_decode($clean, true);

        if (json_last_error() === JSON_ERROR_NONE && is_array($parsed)) {
            return [
                'success' => true,
                'test_plan' => $parsed,
                'raw_content' => $content
            ];
        }

        return [
            'success' => false,
            'error' => 'JSON parse failed dari Claude CLI: ' . json_last_error_msg(),
            'raw_content' => $content
        ];
    }
}
