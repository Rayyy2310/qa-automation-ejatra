<?php

namespace App\Models;

use CodeIgniter\Model;

class AiPageScanModel extends Model
{
    protected $table = 'ai_page_scan';
    protected $primaryKey = 'id';
    protected $useAutoIncrement = true;
    protected $allowedFields = [
        'scan_status', 'base_url', 'total_pages', 'total_elements',
        'duration_ms', 'scanned_by', 'error_log', 'created_at', 'completed_at'
    ];
    protected $useTimestamps = false;
    protected $createdField = 'created_at';

    public function getLatestCompleted()
    {
        $db = \Config\Database::connect();

        // Auto-guard: jika ada scan yang terlanjur tercatat 'completed' padahal gagal login
        // (tertahan di /masuk dan hanya mendapat <= 15 elemen), tandai sebagai 'failed'
        // agar data scan penuh sebelumnya tetap tampil dan tidak tertimpa.
        $invalidScans = $db->query("
            SELECT s.id
            FROM ai_page_scan s
            WHERE s.scan_status = 'completed'
              AND s.total_elements <= 15
              AND EXISTS (
                  SELECT 1 FROM ai_page_element e
                  WHERE e.scan_id = s.id
                    AND (e.page_url LIKE '%/masuk%' OR e.element_id = 'g-recaptcha-response')
              )
        ")->getResultArray();

        if (!empty($invalidScans)) {
            $invalidIds = array_column($invalidScans, 'id');
            $this->whereIn('id', $invalidIds)->set([
                'scan_status' => 'failed',
                'error_log'   => 'Autentikasi login gagal saat scanning (tertahan di halaman /masuk)'
            ])->update();
        }

        return $this->where('scan_status', 'completed')
                    ->where('total_elements >', 0)
                    ->orderBy('id', 'DESC')
                    ->first();
    }

    public function getLatest()
    {
        return $this->orderBy('id', 'DESC')->first();
    }
}
