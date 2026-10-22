<?php

namespace App\Models;

use CodeIgniter\Model;

class AiActionCacheModel extends Model
{
    protected $table = 'ai_action_cache';
    protected $primaryKey = 'id';
    protected $useAutoIncrement = true;
    protected $allowedFields = [
        'page_url', 'action_type', 'intent_keyword',
        'resolved_selector', 'widget_type', 'hit_count',
        'last_used_at', 'created_at'
    ];
    protected $useTimestamps = false;
    protected $createdField = 'created_at';

    /**
     * Cari selector yang sudah terbukti sukses berdasarkan URL, tipe aksi, dan kata kunci intensi.
     */
    public function getCachedSelector(string $pageUrl, string $actionType, string $intentKeyword): ?array
    {
        $cleanIntent = trim(strtolower($intentKeyword));
        if (empty($cleanIntent)) {
            return null;
        }

        $query = $this->db->table($this->table)
            ->where('action_type', $actionType)
            ->groupStart()
                ->where('page_url', $pageUrl)
                ->orLike('page_url', rtrim($pageUrl, '/'))
            ->groupEnd()
            ->where('intent_keyword', $cleanIntent)
            ->orderBy('hit_count', 'DESC')
            ->limit(1)
            ->get();

        $result = $query->getRowArray();
        if ($result) {
            // Update hit count & last used
            $this->db->table($this->table)
                ->where('id', $result['id'])
                ->set('hit_count', 'hit_count + 1', false)
                ->set('last_used_at', date('Y-m-d H:i:s'))
                ->update();
            return $result;
        }

        return null;
    }

    /**
     * Simpan atau perbarui selector yang berhasil dieksekusi ke cache.
     */
    public function rememberAction(string $pageUrl, string $actionType, string $intentKeyword, string $resolvedSelector, string $widgetType = 'native'): void
    {
        $cleanIntent = trim(strtolower($intentKeyword));
        if (empty($cleanIntent) || empty($resolvedSelector)) {
            return;
        }

        $existing = $this->db->table($this->table)
            ->where('page_url', $pageUrl)
            ->where('action_type', $actionType)
            ->where('intent_keyword', $cleanIntent)
            ->get()
            ->getRowArray();

        if ($existing) {
            $this->db->table($this->table)
                ->where('id', $existing['id'])
                ->update([
                    'resolved_selector' => $resolvedSelector,
                    'widget_type'       => $widgetType,
                    'hit_count'         => (int)$existing['hit_count'] + 1,
                    'last_used_at'      => date('Y-m-d H:i:s'),
                ]);
        } else {
            $this->db->table($this->table)->insert([
                'page_url'          => $pageUrl,
                'action_type'       => $actionType,
                'intent_keyword'    => $cleanIntent,
                'resolved_selector' => $resolvedSelector,
                'widget_type'       => $widgetType,
                'hit_count'         => 1,
                'last_used_at'      => date('Y-m-d H:i:s'),
                'created_at'        => date('Y-m-d H:i:s'),
            ]);
        }
    }
}
