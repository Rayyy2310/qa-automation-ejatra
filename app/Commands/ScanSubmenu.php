<?php

namespace App\Commands;

use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;
use App\Services\AiScanService;
use App\Models\AiPageScanModel;
use App\Models\AiPageElementModel;

class ScanSubmenu extends BaseCommand
{
    protected $group = 'QA';
    protected $name = 'qa:scan';
    protected $description = 'Trigger state-aware active scan for a specific submenu or view latest scan statistics';
    protected $usage = 'qa:scan [target_url_or_path]';
    protected $arguments = [
        'target_url' => 'Optional submenu URL or path to scan (e.g. transaksi-spm-aspal-new, timbangan-spb)',
    ];

    public function run(array $params)
    {
        $targetUrl = $params[0] ?? null;
        $scanService = new AiScanService();
        $scanModel = new AiPageScanModel();
        $elementModel = new AiPageElementModel();

        if (($params[0] ?? '') === 'rag') {
            $prompt = $params[1] ?? 'buat transaksi timbangan spb baru';
            CLI::write("=== TESTING RAG CONTEXT FOR PROMPT: '{$prompt}' ===", 'yellow');
            $llmService = new \App\Libraries\LlmService();
            $reflection = new \ReflectionClass($llmService);
            $method = $reflection->getMethod('getPageContext');
            $method->setAccessible(true);
            $ctx = $method->invoke($llmService, $prompt);
            CLI::write($ctx);
            return;
        }

        if (($params[0] ?? '') === 'plan') {
            $prompt = $params[1] ?? 'buat transaksi timbangan spb baru';
            CLI::write("=== TESTING TEST PLAN GENERATION FOR PROMPT: '{$prompt}' ===", 'yellow');
            $planService = new \App\Services\AiPlanService();
            $res = $planService->generatePlan(1, $prompt, 'read_only');
            if (!empty($res['success'])) {
                CLI::write("✓ SUCCESS! Test Plan Generated:", 'green');
                foreach ($res['test_plan']['steps'] as $s) {
                    $target = is_array($s['target']) ? json_encode($s['target']) : $s['target'];
                    CLI::write(sprintf("  Step %2d: [%-7s] -> %-30s | val: %s", $s['step_no'], $s['action'], $target, $s['value'] ?? ''));
                }
            } else {
                CLI::error("FAILED: " . ($res['error'] ?? 'Unknown error'));
            }
            return;
        }

        if (empty($targetUrl)) {
            // Display latest scan info
            $latest = $scanModel->getLatestCompleted();
            if (!$latest) {
                CLI::error('Belum ada scan yang selesai (completed).');
                return;
            }

            CLI::write('=== LATEST SCAN SUMMARY ===', 'green');
            CLI::write('Scan ID        : ' . $latest['id']);
            CLI::write('Status         : ' . $latest['scan_status']);
            CLI::write('Base URL       : ' . $latest['base_url']);
            CLI::write('Total Halaman  : ' . $latest['total_pages']);
            CLI::write('Total Elemen   : ' . $latest['total_elements']);
            CLI::write('Durasi         : ' . number_format(($latest['duration_ms'] ?? 0) / 1000, 2) . ' s');
            CLI::write('Selesai        : ' . $latest['completed_at']);

            // State breakdown
            $db = \Config\Database::connect();
            $stateCounts = $db->query("
                SELECT state_tag, COUNT(*) as cnt 
                FROM ai_page_element 
                WHERE scan_id = ? 
                GROUP BY state_tag
            ", [$latest['id']])->getResultArray();

            CLI::newLine();
            CLI::write('=== BREAKDOWN STATE TAG (GROUND TRUTH) ===', 'yellow');
            foreach ($stateCounts as $sc) {
                CLI::write(sprintf('  %-15s : %d elemen', $sc['state_tag'] ?? 'tabel', $sc['cnt']));
            }

            return;
        }

        $isFull = in_array(strtolower($targetUrl), ['full', 'all']);
        if ($isFull) {
            CLI::write("Memulai Full Website Active Scan (Seluruh 51 Halaman e-Jatra)...", 'yellow');
            $res = $scanService->triggerScan(null);
        } else {
            CLI::write("Memulai Single-Submenu Active Scan untuk: {$targetUrl}", 'yellow');
            $res = $scanService->triggerScan($targetUrl);
        }

        if (empty($res['success'])) {
            CLI::error('Gagal memulai scan: ' . ($res['error'] ?? 'Unknown error'));
            return;
        }

        $scanId = $res['scan_id'];
        CLI::write("Scan Job #{$scanId} berhasil di-dispatch ke runner (port 3001).", 'green');
        $maxWaitSec = $isFull ? 300 : 90;
        CLI::write("Menunggu hasil scan (maksimal {$maxWaitSec} detik)...");

        $startTime = time();
        while (time() - $startTime < $maxWaitSec) {
            sleep(2);
            $scan = $scanModel->find($scanId);
            $status = $scan['scan_status'] ?? 'unknown';

            if ($status === 'completed') {
                CLI::newLine();
                CLI::write("✓ Scan #{$scanId} SELESAI!", 'green');
                CLI::write("Total Halaman : " . ($scan['total_pages'] ?? 1));
                CLI::write("Total Elemen  : " . ($scan['total_elements'] ?? 0));
                CLI::write("Durasi        : " . number_format(($scan['duration_ms'] ?? 0) / 1000, 2) . ' s');

                // Show elements sample
                $elements = $elementModel->where('scan_id', $scanId)
                    ->orderBy('id', 'DESC')
                    ->limit(20)
                    ->findAll();

                CLI::newLine();
                CLI::write("=== 20 ELEMEN TERBARU YANG DITEMUKAN ===", 'yellow');
                foreach ($elements as $el) {
                    CLI::write(sprintf(
                        "[%-10s] %-12s | ID: %-25s | Text: %-25s | Sel: %s",
                        $el['state_tag'] ?? 'tabel',
                        $el['element_category'] ?? 'element',
                        $el['element_id'] ?? '-',
                        substr($el['button_text'] ?? $el['label_text'] ?? '-', 0, 25),
                        substr($el['css_selector'] ?? '-', 0, 35)
                    ));
                }
                return;
            } elseif ($status === 'failed') {
                CLI::newLine();
                CLI::error("Scan #{$scanId} GAGAL: " . ($scan['error_log'] ?? 'Unknown failure'));
                return;
            }

            CLI::print('.');
        }

        CLI::newLine();
        CLI::error("Timeout menunggu scan #{$scanId} selesai setelah 60 detik.");
    }
}
