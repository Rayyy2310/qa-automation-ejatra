<?php

namespace App\Libraries;

class TestPlanValidator
{
    private array $allowedActions = [
        'goto', 'click', 'fill', 'select', 'search', 'wait',
        'assert_visible', 'assert_text', 'assert_color', 'assert_style', 'assert_url', 'screenshot'
    ];
    
    private array $allowedWaitTypes = [
        'visible', 'attached', 'enabled', 'network_idle', 'url_change', 'response', 'none', 'dom_stable', 'toast_visible'
    ];
    
    private array $dataMutationKeywords = [
        'delete', 'hapus', 'destroy', 'drop', 'truncate'
    ];

    public function validate($testPlan, string $moduleBaseUrl, string $mode): array
    {
        if (is_object($testPlan)) {
            $testPlan = json_decode(json_encode($testPlan), true) ?? [];
        } elseif (is_string($testPlan)) {
            $testPlan = json_decode($testPlan, true) ?? [];
        } elseif (!is_array($testPlan)) {
            $testPlan = [];
        }

        $errors = [];

        if (!isset($testPlan['steps']) || !is_array($testPlan['steps']) || empty($testPlan['steps'])) {
            $errors[] = "Daftar langkah pengujian ('steps') kosong atau tidak valid.";
            return ['valid' => false, 'errors' => $errors];
        }

        // Maximum allowed steps
        if (count($testPlan['steps']) > 50) {
            $errors[] = "Jumlah langkah melebihi batas maksimum 50 langkah.";
        }

        foreach ($testPlan['steps'] as $index => $step) {
            $stepNo = $step['step_no'] ?? ($index + 1);
            $action = strtolower(trim($step['action'] ?? ''));

            if (empty($action)) {
                $errors[] = "Langkah #$stepNo tidak memiliki field 'action'.";
                continue;
            }

            // 1. Check action whitelist
            if (!in_array($action, $this->allowedActions)) {
                $errors[] = "Langkah #$stepNo menggunakan aksi tidak dikenal: '$action'.";
            }

            // 2. If mode is 'read_only', reject destructive data deletion
            if ($mode === 'read_only' && in_array($action, ['click', 'fill'])) {
                $targetValue = strtolower(
                    is_array($step['target'] ?? null) 
                        ? ($step['target']['value'] ?? '') 
                        : ($step['target'] ?? '')
                );
                
                foreach ($this->dataMutationKeywords as $keyword) {
                    if (strpos($targetValue, $keyword) !== false) {
                        $errors[] = "Langkah #$stepNo mengandung aksi berbahaya/destruktif ('$targetValue') pada mode read_only.";
                        break;
                    }
                }
            }
        }

        return [
            'valid' => count($errors) === 0,
            'errors' => $errors
        ];
    }
}
