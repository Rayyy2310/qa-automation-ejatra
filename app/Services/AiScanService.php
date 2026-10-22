<?php

namespace App\Services;

use App\Models\AiPageScanModel;
use App\Models\AiPageElementModel;
use App\Models\AiTestModuleModel;

/**
 * AiScanService — Service layer for UI element discovery and Ground Truth scanning.
 */
class AiScanService
{
    protected AiPageScanModel $scanModel;
    protected AiPageElementModel $elementModel;
    protected AiTestModuleModel $moduleModel;

    public function __construct()
    {
        $this->scanModel = new AiPageScanModel();
        $this->elementModel = new AiPageElementModel();
        $this->moduleModel = new AiTestModuleModel();
    }

    /**
     * Trigger background Playwright page scan.
     */
    public function triggerScan(?string $targetUrl = null): array
    {
        $activeScan = $this->scanModel->where('scan_status', 'running')->first();
        if ($activeScan) {
            $started = !empty($activeScan['created_at']) ? strtotime($activeScan['created_at']) : time();
            if (time() - $started < 600) {
                return [
                    'success' => false,
                    'error' => 'Scan sedang berjalan sejak ' . ($activeScan['created_at'] ?? 'tadi') . '. Harap tunggu hingga selesai.',
                    'scan_id' => (int)$activeScan['id']
                ];
            }
            $this->scanModel->update($activeScan['id'], [
                'scan_status' => 'failed',
                'error_log' => 'Scan timed out after 10 minutes (auto-cancelled)'
            ]);
        }

        $config = config('AiAutomationTest');
        $module = $this->moduleModel->first();
        $envBaseUrl = trim((string)($config->targetBaseUrl ?: env('EJATRA_TESTING_BASE_URL', '')), " \t\n\r\0\x0B'\"");
        $rootBaseUrl = !empty($envBaseUrl) ? $envBaseUrl : ($module['base_url'] ?? '');

        $envUsername = trim((string)($config->testUsername ?: env('EJATRA_TEST_USERNAME', env('EJATRA_USERNAME', ''))), " \t\n\r\0\x0B'\"");
        $envPassword = trim((string)($config->testPassword ?: env('EJATRA_TEST_PASSWORD', env('EJATRA_PASSWORD', ''))), " \t\n\r\0\x0B'\"");

        $isFull = empty($targetUrl) 
            || $targetUrl === 'full' 
            || $targetUrl === 'all' 
            || rtrim($targetUrl, '/') === rtrim($rootBaseUrl, '/');

        $effectiveTargetUrl = $isFull ? $rootBaseUrl : $targetUrl;

        $scanId = $this->scanModel->insert([
            'base_url' => $effectiveTargetUrl,
            'scan_status' => 'running',
            'scanned_by' => 'system',
            'created_at' => date('Y-m-d H:i:s')
        ]);

        $serviceUrl = $config->runnerUrl('/internal/scan');
        $payloadData = [
            'scan_id' => $scanId,
            'base_url' => $rootBaseUrl,
            'username' => $envUsername,
            'password' => $envPassword,
            'callback_url' => base_url('ai-automation-test/scan-callback')
        ];
        if (!$isFull && !empty($targetUrl)) {
            $payloadData['target_url'] = $targetUrl;
        }

        $payload = json_encode($payloadData);

        try {
            $client = \Config\Services::curlrequest(['timeout' => 5, 'http_errors' => false]);
            $resp = $client->post($serviceUrl, [
                'headers' => [
                    'Content-Type' => 'application/json',
                    'X-Internal-Token' => $config->internalApiToken
                ],
                'body' => $payload
            ]);
            $statusCode = $resp->getStatusCode();
            if ($statusCode !== 200 && $statusCode !== 202) {
                $errBody = json_decode($resp->getBody(), true);
                $errMsg = $errBody['error'] ?? ('Runner service merespon status ' . $statusCode);
                $this->scanModel->update($scanId, [
                    'scan_status' => 'failed',
                    'error_log' => $errMsg,
                    'completed_at' => date('Y-m-d H:i:s')
                ]);
                return [
                    'success' => false,
                    'error' => 'Gagal memulai scan: ' . $errMsg
                ];
            }
        } catch (\Throwable $e) {
            $errMsg = 'Runner service (port 3001) tidak aktif: ' . $e->getMessage();
            $this->scanModel->update($scanId, [
                'scan_status' => 'failed',
                'error_log' => $errMsg,
                'completed_at' => date('Y-m-d H:i:s')
            ]);
            return [
                'success' => false,
                'error' => $errMsg . '. Pastikan service runner Node.js menyala.'
            ];
        }

        return [
            'success' => true,
            'scan_id' => $scanId,
            'message' => 'Scan dimulai. Playwright sedang menjelajahi halaman e-Jatra...'
        ];
    }

    /**
     * Process scan callback from Node.js scanner and persist indexed elements.
     */
    public function processScanCallback(array $data): array
    {
        $scanId = $data['scan_id'] ?? null;
        $status = strtolower($data['status'] ?? 'completed');
        $errorMessage = $data['error_message'] ?? (!empty($data['errors']) && is_array($data['errors']) ? implode('; ', $data['errors']) : null);
        $durationMs = (int)($data['duration_ms'] ?? $data['scan_duration_ms'] ?? 0);

        if (!$scanId) {
            return ['success' => false, 'error' => 'Missing scan_id'];
        }

        $pages = $data['pages'] ?? [];
        $elements = [];
        if (!empty($pages) && is_array($pages)) {
            foreach ($pages as $p) {
                $menuPath = $p['menu_path'] ?? null;
                $pageUrl = $p['page_url'] ?? '';
                $pageTitle = $p['page_title'] ?? null;

                // Jangan simpan halaman yang ter-redirect ke /masuk atau /login akibat belum login
                if (preg_match('#/(masuk|login)(?:[/?\#]|$)#i', $pageUrl)) {
                    continue;
                }

                if (!empty($p['elements']) && is_array($p['elements'])) {
                    foreach ($p['elements'] as $el) {
                        $el['menu_path'] = $menuPath;
                        $el['page_url'] = $pageUrl;
                        $el['page_title'] = $pageTitle;
                        $elements[] = $el;
                    }
                }
            }
        } elseif (!empty($data['elements']) && is_array($data['elements'])) {
            $elements = $data['elements'];
        }

        $toolbarCategories = array_values(array_filter(
            array_map(fn($c) => mb_strtolower(trim((string)$c)), (array)($data['toolbar_categories'] ?? [])),
            fn($c) => $c !== ''
        ));

        $totalElements = count($elements) ?: (int)($data['total_elements'] ?? 0);
        $totalPages = (int)($data['total_pages'] ?? count($pages));

        $db = \Config\Database::connect();
        $db->transStart();

        $isSinglePage = ($totalPages === 1) && !empty($elements);
        $latestCompleted = $this->scanModel
            ->where('scan_status', 'completed')
            ->where('total_pages >', 1)
            ->where('id !=', $scanId)
            ->orderBy('id', 'DESC')
            ->first();
        $previousScanId = !empty($latestCompleted) ? (int)$latestCompleted['id'] : null;

        if ($isSinglePage && $previousScanId) {
            $updatedPageUrl = substr($elements[0]['page_url'] ?? '', 0, 490);
            $updatedMenuPath = substr($elements[0]['menu_path'] ?? '', 0, 490);

            // Recover hierarchical menu_path (e.g. "Aspal > Timbangan SPB") if current is flat (e.g. "timbangan-spb")
            if (!str_contains($updatedMenuPath, ' > ')) {
                $prevMenuRow = $db->query(
                    "SELECT menu_path FROM ai_page_element WHERE scan_id = ? AND TRIM(TRAILING '/' FROM page_url) = TRIM(TRAILING '/' FROM ?) AND menu_path LIKE '% > %' LIMIT 1",
                    [$previousScanId, $updatedPageUrl]
                )->getRowArray();
                if (!empty($prevMenuRow['menu_path'])) {
                    $updatedMenuPath = $prevMenuRow['menu_path'];
                    foreach ($elements as &$el) {
                        $el['menu_path'] = $updatedMenuPath;
                    }
                    unset($el);
                }
            }

            $this->elementModel->where('scan_id', $scanId)->delete();

            // Merge: Copy all elements from previous scan except the updated page
            $db->query("
                INSERT INTO ai_page_element (
                    scan_id, menu_path, page_url, page_title, form_block_name,
                    element_category, tag_name, element_name, element_id,
                    element_type, label_text, placeholder, button_text,
                    widget_type, css_selector, table_headers, table_row_count, badge_colors,
                    is_visible, is_required, options_sample, state_tag, trigger_selector,
                    trigger_text, aria_label, title_attr, icon_hint, requires_json,
                    is_disabled_initial, is_readonly, scan_quality
                )
                SELECT 
                    ?, menu_path, page_url, page_title, form_block_name,
                    element_category, tag_name, element_name, element_id,
                    element_type, label_text, placeholder, button_text,
                    widget_type, css_selector, table_headers, table_row_count, badge_colors,
                    is_visible, is_required, options_sample, state_tag, trigger_selector,
                    trigger_text, aria_label, title_attr, icon_hint, requires_json,
                    is_disabled_initial, is_readonly, scan_quality
                FROM ai_page_element
                WHERE scan_id = ? 
                  AND TRIM(TRAILING '/' FROM page_url) != TRIM(TRAILING '/' FROM ?)
                  AND menu_path != ?
            ", [$scanId, $previousScanId, $updatedPageUrl, $updatedMenuPath]);
        } else {
            $this->elementModel->where('scan_id', $scanId)->delete();
        }

        if (!empty($elements)) {
            $batch = [];
            foreach ($elements as $el) {
                $menuPath = substr($el['menu_path'] ?? 'General', 0, 490);
                $pageUrl = substr($el['page_url'] ?? '', 0, 490);

                if (str_starts_with($menuPath, 'http://') || str_starts_with($menuPath, 'https://') || str_contains($pageUrl, 'halaman-utama')) {
                    $menuPath = 'Halaman Utama';
                } else {
                    // Buang segmen tengah yang merupakan kategori toolbar dashboard (daftar dikirim scanner, bukan hardcode)
                    $menuPath = $this->stripToolbarCategories($menuPath, $toolbarCategories);
                }

                $pageTitle = !empty($el['page_title']) ? substr($el['page_title'], 0, 250) : null;

                $batch[] = [
                    'scan_id' => $scanId,
                    'menu_path' => $menuPath,
                    'page_url' => $pageUrl,
                    'page_title' => $pageTitle,
                    'element_category' => substr($el['element_category'] ?? 'other', 0, 90),
                    'tag_name' => substr($el['tag_name'] ?? 'div', 0, 45),
                    'element_name' => !empty($el['element_name']) ? substr($el['element_name'], 0, 250) : null,
                    'element_id' => !empty($el['element_id']) ? substr($el['element_id'], 0, 250) : null,
                    'element_type' => !empty($el['element_type']) ? substr($el['element_type'], 0, 45) : null,
                    'label_text' => !empty($el['label_text']) ? substr($el['label_text'], 0, 490) : null,
                    'placeholder' => !empty($el['placeholder']) ? substr($el['placeholder'], 0, 490) : null,
                    'button_text' => !empty($el['button_text']) ? substr($el['button_text'], 0, 250) : null,
                    'widget_type' => substr($el['widget_type'] ?? 'native', 0, 90),
                    'css_selector' => !empty($el['css_selector']) ? substr($el['css_selector'], 0, 490) : null,
                    'table_headers' => $el['table_headers'] ?? null,
                    'table_row_count' => $el['table_row_count'] ?? null,
                    'badge_colors' => $el['badge_colors'] ?? null,
                    'form_block_name' => !empty($el['form_block_name']) ? substr($el['form_block_name'], 0, 250) : null,
                    'is_visible' => !empty($el['is_visible']) ? 1 : 0,
                    'is_required' => !empty($el['is_required']) ? 1 : 0,
                    'options_sample' => $el['options_sample'] ?? null,
                    // Fase 1 — field opsional dari scanner baru; default aman untuk scanner lama
                    'state_tag' => in_array($el['state_tag'] ?? '', ['tabel', 'form', 'modal', 'row_action', 'dynamic_dialog'], true)
                        ? $el['state_tag'] : 'tabel',
                    'trigger_selector' => !empty($el['trigger_selector']) ? substr($el['trigger_selector'], 0, 250) : null,
                    'trigger_text' => !empty($el['trigger_text']) ? substr($el['trigger_text'], 0, 150) : null,
                    'aria_label' => !empty($el['aria_label']) ? substr($el['aria_label'], 0, 200) : null,
                    'title_attr' => !empty($el['title_attr']) ? substr($el['title_attr'], 0, 200) : null,
                    'icon_hint' => !empty($el['icon_hint']) ? substr($el['icon_hint'], 0, 80) : null,
                    'requires_json' => !empty($el['requires_json'])
                        ? (is_string($el['requires_json']) ? $el['requires_json'] : json_encode($el['requires_json']))
                        : null,
                    'is_disabled_initial' => !empty($el['is_disabled_initial']) ? 1 : 0,
                    'is_readonly' => !empty($el['is_readonly']) ? 1 : 0,
                    'scan_quality' => !empty($el['scan_quality']) ? substr($el['scan_quality'], 0, 30) : null,
                ];

                if (count($batch) >= 200) {
                    $this->elementModel->insertBatch($batch);
                    $batch = [];
                }
            }
            if (!empty($batch)) {
                $this->elementModel->insertBatch($batch);
            }
        }

        $trueElementCount = $this->elementModel->where('scan_id', $scanId)->countAllResults();
        $cntRow = $db->query("SELECT COUNT(DISTINCT page_url) AS cnt FROM ai_page_element WHERE scan_id = ?", [$scanId])->getRow();
        $truePageCount = !empty($cntRow) ? (int)$cntRow->cnt : $totalPages;
        if ($truePageCount < 1) $truePageCount = $totalPages;

        $finalStatus = in_array($status, ['completed', 'failed', 'running']) ? $status : 'completed';
        if ($trueElementCount === 0 || (!$isSinglePage && $truePageCount <= 1 && $trueElementCount <= 10)) {
            $finalStatus = 'failed';
            if (empty($errorMessage)) {
                $errorMessage = 'Autentikasi login gagal atau halaman terproteksi tidak dapat diakses saat scanning.';
            }
        }

        $this->scanModel->update($scanId, [
            'scan_status' => $finalStatus,
            'total_pages' => $truePageCount,
            'total_elements' => $trueElementCount ?: $totalElements,
            'duration_ms' => $durationMs,
            'error_log' => $errorMessage,
            'completed_at' => date('Y-m-d H:i:s')
        ]);

        $db->transComplete();
        return ['success' => true, 'scan_id' => $scanId, 'elements_saved' => $trueElementCount];
    }

    /**
     * Hapus segmen tengah menu_path yang cocok dengan kategori toolbar dashboard hasil scan.
     * Segmen pertama (menu induk) dan terakhir (submenu) tidak pernah dihapus.
     *
     * @param string   $menuPath
     * @param string[] $categories Nama kategori (lowercase) yang dilaporkan scanner
     */
    private function stripToolbarCategories(string $menuPath, array $categories): string
    {
        if (empty($categories) || !str_contains($menuPath, '>')) {
            return $menuPath;
        }

        $parts = array_map('trim', explode('>', $menuPath));
        $last  = count($parts) - 1;
        $kept  = [];
        foreach ($parts as $i => $part) {
            $isMiddle = $i > 0 && $i < $last;
            if ($isMiddle && in_array(mb_strtolower($part), $categories, true)) {
                continue;
            }
            $kept[] = $part;
        }

        return implode(' > ', $kept);
    }

    /**
     * Get real-time status of latest scan for UI polling.
     */
    public function getScanStatus(): array
    {
        $lastScan = $this->scanModel->getLatest();
        if (!$lastScan) {
            return ['has_scan' => false];
        }

        // Auto-sync: if DB says running, verify with Node.js runner to prevent hanging orphaned scans
        if ($lastScan['scan_status'] === 'running') {
            $config = config('AiAutomationTest');
            $serviceUrl = $config->runnerUrl('/internal/scan/' . $lastScan['id'] . '/status');
            try {
                $client = \Config\Services::curlrequest(['timeout' => 2, 'http_errors' => false]);
                $response = $client->get($serviceUrl, [
                    'headers' => [
                        'X-Internal-Token' => $config->internalApiToken
                    ]
                ]);
                $statusCode = $response->getStatusCode();
                if ($statusCode === 404) {
                    $this->scanModel->update($lastScan['id'], [
                        'scan_status' => 'failed',
                        'error_log' => 'Scan terhenti karena service runner di-restart',
                        'completed_at' => date('Y-m-d H:i:s')
                    ]);
                    $lastScan['scan_status'] = 'failed';
                } elseif ($statusCode === 200) {
                    $runnerData = json_decode($response->getBody(), true);
                    if (!empty($runnerData['status']) && $runnerData['status'] !== 'running') {
                        $this->scanModel->update($lastScan['id'], [
                            'scan_status' => $runnerData['status'],
                            'completed_at' => date('Y-m-d H:i:s')
                        ]);
                        $lastScan['scan_status'] = $runnerData['status'];
                    }
                }
            } catch (\Throwable $e) {
                // If runner is unreachable, the background scan process is dead
                $this->scanModel->update($lastScan['id'], [
                    'scan_status' => 'failed',
                    'error_log' => 'Service runner (port 3001) tidak aktif atau tidak dapat dihubungi',
                    'completed_at' => date('Y-m-d H:i:s')
                ]);
                $lastScan['scan_status'] = 'failed';
            }
        }

        // Auto-heal: If total_elements in scanModel is 0, verify against actual persisted elements
        $db = \Config\Database::connect();
        if ((int)$lastScan['total_elements'] === 0) {
            $actualCount = $db->table('ai_page_element')->where('scan_id', $lastScan['id'])->countAllResults();
            if ($actualCount > 0) {
                $this->scanModel->update($lastScan['id'], ['total_elements' => $actualCount]);
                $lastScan['total_elements'] = $actualCount;
            }
        }

        $latestCompleted = $this->scanModel->getLatestCompleted();
        if ($latestCompleted && (int)$latestCompleted['total_elements'] === 0) {
            $actualCompCount = $db->table('ai_page_element')->where('scan_id', $latestCompleted['id'])->countAllResults();
            if ($actualCompCount > 0) {
                $this->scanModel->update($latestCompleted['id'], ['total_elements' => $actualCompCount]);
                $latestCompleted['total_elements'] = $actualCompCount;
            }
        }

        return [
            'has_scan' => true,
            'scan' => [
                'id' => (int)$lastScan['id'],
                'scan_status' => $lastScan['scan_status'],
                'base_url' => $lastScan['base_url'],
                'total_pages' => (int)$lastScan['total_pages'],
                'total_elements' => (int)$lastScan['total_elements'],
                'duration_ms' => (int)$lastScan['duration_ms'],
                'created_at' => $lastScan['created_at'],
                'completed_at' => $lastScan['completed_at']
            ],
            'latest_completed' => $latestCompleted ? [
                'id' => (int)$latestCompleted['id'],
                'total_pages' => (int)$latestCompleted['total_pages'],
                'total_elements' => (int)$latestCompleted['total_elements'],
                'base_url' => $latestCompleted['base_url']
            ] : null
        ];
    }

    /**
     * Get distinct scanned pages with element counts for Explorer modal.
     */
    public function getScanPages(): array
    {
        $lastScan = $this->scanModel->getLatestCompleted();
        if (!$lastScan) {
            return ['success' => false, 'error' => 'Belum ada data scan yang selesai'];
        }

        $scanId = (int)$lastScan['id'];
        $db = \Config\Database::connect();
        $pages = $db->table('ai_page_element')
            ->select('menu_path, page_url, COUNT(*) as element_count')
            ->where('scan_id', $scanId)
            ->where('menu_path IS NOT NULL', null, false)
            ->groupBy('menu_path, page_url')
            ->orderBy('menu_path', 'ASC')
            ->get()
            ->getResultArray();

        return [
            'success' => true,
            'scan_info' => $lastScan,
            'pages' => $pages
        ];
    }

    /**
     * Get element details for a specific page.
     */
    public function getScanPageElements(string $menuPath): array
    {
        $lastScan = $this->scanModel->getLatestCompleted();
        if (!$lastScan) {
            return ['success' => false, 'error' => 'Belum ada data scan'];
        }

        $scanId = (int)$lastScan['id'];
        $elements = $this->elementModel
            ->where('scan_id', $scanId)
            ->where('menu_path', $menuPath)
            ->orderBy('id', 'ASC')
            ->findAll();

        return [
            'success' => true,
            'elements' => $elements
        ];
    }
}
