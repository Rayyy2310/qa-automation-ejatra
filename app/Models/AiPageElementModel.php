<?php

namespace App\Models;

use CodeIgniter\Model;

class AiPageElementModel extends Model
{
    protected $table = 'ai_page_element';
    protected $primaryKey = 'id';
    protected $useAutoIncrement = true;
    protected $allowedFields = [
        'scan_id', 'menu_path', 'page_url', 'page_title', 'form_block_name',
        'element_category', 'tag_name', 'element_name', 'element_id',
        'element_type', 'label_text', 'placeholder', 'button_text',
        'widget_type', 'css_selector', 'table_headers', 'table_row_count', 'badge_colors',
        'is_visible', 'is_required', 'options_sample',
        // Fase 1 — state-aware (nullable/default, aman untuk scanner lama)
        'state_tag', 'trigger_selector', 'trigger_text', 'aria_label', 'title_attr',
        'icon_hint', 'requires_json', 'is_disabled_initial', 'is_readonly', 'scan_quality',
    ];

    protected $useTimestamps = false;
    protected $createdField = 'created_at';

    /**
     * Retrieve elements for a scan matching given NLP keywords with Consecutive Path Disambiguation.
     * Highly Intelligent & Ranked Keyword-based element retrieval for LLM RAG Grounding.
     * Pages matching MORE keywords (e.g. 'dashboard' AND 'aspal') are ranked at the top.
     *
     * @param int          $scanId
     * @param list<string> $keywords
     * @param int          $limit     Max elements to return
     * @param string       $rawPrompt
     * @return array<int, array>
     */
    public function getByKeywords(int $scanId, array $keywords, int $limit = 60, string $rawPrompt = ''): array
    {
        if (empty($keywords)) {
            return [];
        }

        // Clean & sanitize keywords (min 2 chars)
        $cleanKws = array_filter(array_map('trim', $keywords), fn($k) => mb_strlen($k) >= 2);
        if (empty($cleanKws)) {
            return [];
        }

        $rawPromptLower = preg_replace('/\s+/', ' ', mb_strtolower($rawPrompt));

        $scoredPages  = $this->scorePages($scanId, $cleanKws, $rawPromptLower);
        $topMenuPaths = $this->pickTopMenuPaths($scoredPages);
        $elements     = $this->collectElementsFromPages($scanId, $topMenuPaths, $cleanKws, $rawPromptLower, $limit);

        if (empty($elements)) {
            $elements = $this->fallbackByText($scanId, $cleanKws, $limit);
        }

        return $elements;
    }

    /**
     * Score every distinct page of the scan against the prompt (consecutive path / leaf / title / url / keyword+synonym).
     * Returns pages with score > 0, sorted by score DESC.
     *
     * @return list<array{menu_path: string, score: int}>
     */
    private function scorePages(int $scanId, array $cleanKws, string $rawPromptLower): array
    {
        $synonyms = config('AiRag')->synonyms;

        $allPages = $this->db->table($this->table)
            ->select('menu_path, page_url, page_title')
            ->where('scan_id', $scanId)
            ->groupBy('menu_path, page_url, page_title')
            ->get()
            ->getResultArray();

        $scoredPages = [];
        foreach ($allPages as $page) {
            $score = 0;
            $menuPath = $page['menu_path'] ?? '';
            // Split camelCase/PascalCase (misal "SPMNew" -> "SPM New")
            $menuPathSpaced = preg_replace('/(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/', ' ', $menuPath);
            $menuParts = array_map('trim', explode('>', $menuPathSpaced));

            // Check consecutive path match (e.g. "Aspal > Persetujuan SPM New")
            $normalizedPath = preg_replace('/\s+/', ' ', str_replace(['>', '-', '_'], ' ', mb_strtolower($menuPathSpaced)));
            if (!empty($rawPromptLower) && str_contains($rawPromptLower, $normalizedPath)) {
                $score += 100; // Strong consecutive path match
            }

            // Check leaf submenu match (e.g. "persetujuan spm new" in prompt)
            $leafSubmenu = end($menuParts);
            $leafNormalized = preg_replace('/\s+/', ' ', str_replace(['>', '-', '_'], ' ', mb_strtolower($leafSubmenu)));
            if (!empty($leafNormalized) && mb_strlen($leafNormalized) >= 3 && str_contains($rawPromptLower, $leafNormalized)) {
                $score += 80;
            }

            // Check page_title match (e.g. "Realisasi SPB", "Konsol SPB")
            $pageTitle = trim($page['page_title'] ?? '');
            if ($pageTitle !== '') {
                $normTitle = preg_replace('/\s+/', ' ', mb_strtolower($pageTitle));
                if (str_contains($rawPromptLower, $normTitle)) {
                    $score += 90;
                }
            }

            // Check page_url match (e.g. /realisasi-spb, /real-spb-kwt)
            $pageUrl = trim($page['page_url'] ?? '');
            if ($pageUrl !== '') {
                $urlPath = trim(parse_url($pageUrl, PHP_URL_PATH) ?? '', '/');
                if ($urlPath !== '') {
                    $normUrlPath = str_replace(['-', '_'], ' ', mb_strtolower($urlPath));
                    if (str_contains($rawPromptLower, $normUrlPath)) {
                        $score += 85;
                    }
                }
            }

            $score += $this->scoreKeywordsAgainstPath($cleanKws, $menuParts, $synonyms);

            if ($score > 0) {
                $scoredPages[] = [
                    'menu_path' => $menuPath,
                    'score'     => $score,
                ];
            }
        }

        // Sort pages by score DESC (most relevant first)
        usort($scoredPages, fn($a, $b) => $b['score'] <=> $a['score']);

        return $scoredPages;
    }

    /**
     * Score keywords (and their synonyms) against the segments of a menu path.
     */
    private function scoreKeywordsAgainstPath(array $cleanKws, array $menuParts, array $synonyms): int
    {
        $score = 0;
        foreach ($cleanKws as $kw) {
            $kwLower = mb_strtolower($kw);
            $searchTerms = [$kwLower];
            if (isset($synonyms[$kwLower])) {
                $searchTerms = array_merge($searchTerms, $synonyms[$kwLower]);
            }

            foreach ($menuParts as $part) {
                $partLower = mb_strtolower($part);
                foreach ($searchTerms as $st) {
                    if ($partLower === $st) {
                        $score += 15; // Exact menu segment or synonym
                    } elseif (str_contains($partLower, $st)) {
                        $score += 5;
                    }
                }
            }
        }

        return $score;
    }

    /**
     * Dominant Page Filtering: If #1 page has a dominant score (e.g. consecutive path match), ONLY take #1 page!
     * This prevents polluting RAG context with elements from other sibling pages (e.g. Aspal > Plafon vs Dashboard > Aspal)
     *
     * @param list<array{menu_path: string, score: int}> $scoredPages
     * @return list<string>
     */
    private function pickTopMenuPaths(array $scoredPages): array
    {
        if (empty($scoredPages)) {
            return [];
        }

        $cfg         = config('AiRag');
        $topScore    = $scoredPages[0]['score'];
        $secondScore = $scoredPages[1]['score'] ?? 0;

        if ($topScore >= $cfg->dominantScore || ($topScore - $secondScore) >= $cfg->dominantGap) {
            return [$scoredPages[0]['menu_path']];
        }

        return array_column(array_slice($scoredPages, 0, 2), 'menu_path');
    }

    /**
     * Detect prompt intent and resolve state priority + per-state quotas.
     *
     * @return array{targetBlockForm: bool, priority: list<string>, quotas: array<string, int>}
     */
    private function resolveStatePlan(string $rawPromptLower): array
    {
        $cfg = config('AiRag');
        $pat = $cfg->patterns;

        // Abaikan kata "input" jika merupakan bagian dari nama menu/submenu/navigasi (misal: "submenu input SPB", "ke Input SPB", "klik input SPB")
        $promptForCreateIntent = preg_replace($pat['navInputStrip'], '$1', $rawPromptLower);

        $mentionsFormTab  = (bool) preg_match($pat['formTab'], $rawPromptLower);
        $mentionsTableTab = (bool) preg_match($pat['tableTab'], $rawPromptLower);
        $isReportIntent   = (bool) preg_match($pat['report'], $rawPromptLower);
        $isCreateIntent   = (bool) preg_match($pat['create'], $promptForCreateIntent)
            && !preg_match($pat['createExclude'], $rawPromptLower);
        // Deteksi kebutuhan modal / popup dialog secara generik (kata modal, popup, dialog, cari data, browse, lookup, pilih nomor, dll.)
        $mentionsModal    = (bool) preg_match($pat['modal'], $rawPromptLower);

        $targetBlockForm = ($mentionsFormTab || ($isCreateIntent && !$mentionsTableTab));

        if ($targetBlockForm) {
            // Saat mengisi form, dialog lookup (Cari PO, Browse Tiket, dll.) sering dibutuhkan
            $planKey = 'form';
        } elseif ($isReportIntent) {
            $planKey = 'report';
        } elseif (preg_match($pat['rowAction'], $rawPromptLower)) {
            $planKey = 'rowAction';
        } else {
            $planKey = 'default';
        }

        $plan   = $cfg->statePlans[$planKey];
        $quotas = [];
        foreach ($plan['quotas'] as $state => $quota) {
            $quotas[$state] = is_array($quota) ? ($mentionsModal ? $quota[0] : $quota[1]) : $quota;
        }

        return [
            'targetBlockForm' => $targetBlockForm,
            'priority'        => $plan['priority'],
            'quotas'          => $quotas,
        ];
    }

    /**
     * Fetch actionable elements from the top matched pages (prioritizing #1 best matching page first),
     * allocating per-state quotas and backfilling the remainder.
     *
     * @param list<string> $topMenuPaths
     * @return array<int, array>
     */
    private function collectElementsFromPages(int $scanId, array $topMenuPaths, array $cleanKws, string $rawPromptLower, int $limit): array
    {
        if (empty($topMenuPaths)) {
            return [];
        }

        $plan            = $this->resolveStatePlan($rawPromptLower);
        $targetBlockForm = $plan['targetBlockForm'];
        $statePriority   = $plan['priority'];
        $stateQuotas     = $plan['quotas'];

        $elements       = [];
        $remainingLimit = $limit;

        foreach ($topMenuPaths as $menuPath) {
            if ($remainingLimit <= 0) break;

            $formTriggers   = $targetBlockForm ? [] : $this->getFormTriggers($scanId, $menuPath);
            $seenElementIds = [];

            // 1. Fetch elements per state quota
            foreach ($statePriority as $stTag) {
                if ($remainingLimit <= 0) break;
                $quota = $stateQuotas[$stTag] ?? 0;
                if ($quota <= 0) continue;

                $builder = $this->actionableBuilder($scanId, $menuPath, config('AiRag')->actionableCategories)
                    ->where('state_tag', $stTag);

                if (!$targetBlockForm && !empty($formTriggers)) {
                    $builder->whereNotIn('css_selector', $formTriggers);
                }

                $this->applyStateOrdering($builder, $stTag);

                $candidates = $builder->orderBy('id', 'ASC')
                    ->limit(min(100, $quota * 3))
                    ->get()
                    ->getResultArray();

                // Sort candidates by prompt relevance DESC
                $candidates = $this->rankByRelevance($candidates, $cleanKws, $rawPromptLower);

                foreach (array_slice($candidates, 0, min($quota, $remainingLimit)) as $el) {
                    $elements[] = $this->cleanButtonText($el);
                    $seenElementIds[$el['id']] = true;
                    $remainingLimit--;
                }
            }

            // 2. Backfill if quota remains (strictly within prioritized states with non-zero quota)
            if ($remainingLimit > 0) {
                $eligibleStates = array_values(array_filter($statePriority, fn($st) => ($stateQuotas[$st] ?? 0) > 0));
                if (!empty($eligibleStates)) {
                    $backfillBuilder = $this->actionableBuilder($scanId, $menuPath, config('AiRag')->backfillCategories)
                        ->whereIn('state_tag', $eligibleStates);

                    if (!empty($seenElementIds)) {
                        $backfillBuilder->whereNotIn('id', array_keys($seenElementIds));
                    }

                    $backfill = $backfillBuilder->orderBy('id', 'ASC')
                        ->limit(min(100, $remainingLimit * 3))
                        ->get()
                        ->getResultArray();

                    $backfill = $this->rankByRelevance($backfill, $cleanKws, $rawPromptLower);

                    foreach (array_slice($backfill, 0, $remainingLimit) as $el) {
                        $elements[] = $this->cleanButtonText($el);
                        $remainingLimit--;
                    }
                }
            }
        }

        return $elements;
    }

    /**
     * Base query for actionable elements of one page (excludes recaptcha / csrf noise).
     */
    private function actionableBuilder(int $scanId, string $menuPath, array $categories): \CodeIgniter\Database\BaseBuilder
    {
        return $this->db->table($this->table)
            ->where('scan_id', $scanId)
            ->where('menu_path', $menuPath)
            ->whereIn('element_category', $categories)
            ->notLike('css_selector', 'recaptcha')
            ->where("(element_id IS NULL OR (element_id NOT LIKE '%recaptcha%' AND element_id NOT LIKE '%csrf%'))");
    }

    /**
     * Resolve form trigger selectors dynamically from scanned state_tag = 'form' elements on this page.
     *
     * @return list<string>
     */
    private function getFormTriggers(int $scanId, string $menuPath): array
    {
        $triggerRows = $this->db->table($this->table)
            ->select('DISTINCT trigger_selector', false)
            ->where('scan_id', $scanId)
            ->where('menu_path', $menuPath)
            ->where('state_tag', 'form')
            ->where('trigger_selector IS NOT NULL')
            ->get()
            ->getResultArray();

        return array_values(array_filter(array_column($triggerRows, 'trigger_selector')));
    }

    /**
     * Apply per-state ORDER BY so the most useful elements fall inside the candidate window.
     */
    private function applyStateOrdering(\CodeIgniter\Database\BaseBuilder $builder, string $stTag): void
    {
        if (in_array($stTag, ['form', 'modal'], true)) {
            // Within form/modal, prioritize inputs, dropdowns & tables before buttons
            $builder->orderBy("CASE 
                WHEN element_category IN ('dropdown', 'input', 'table') THEN 0 
                WHEN element_category = 'button' THEN 1 
                ELSE 2 END", 'ASC', false);
            return;
        }

        // In table, prioritize table, filters, length/pagination, and tab switches
        $builder->orderBy("CASE 
            WHEN element_category = 'table' THEN 0 
            WHEN element_id LIKE '%_filter' OR element_id LIKE 'f_%' OR element_name LIKE '%_length' OR css_selector LIKE '%_length%' THEN 1
            WHEN element_id LIKE '%-tab' OR css_selector LIKE '%-tab' THEN 2
            ELSE 3 END", 'ASC', false);
    }

    /**
     * Sort candidate elements by prompt relevance DESC.
     *
     * @param array<int, array> $candidates
     * @return array<int, array>
     */
    private function rankByRelevance(array $candidates, array $cleanKws, string $rawPromptLower): array
    {
        usort($candidates, fn($a, $b) => $this->scoreElement($b, $cleanKws, $rawPromptLower) <=> $this->scoreElement($a, $cleanKws, $rawPromptLower));

        return $candidates;
    }

    /**
     * Multi-token Element Relevance Scorer: prioritizes elements whose label/name/phrase matches prompt.
     */
    private function scoreElement(array $el, array $cleanKws, string $rawPromptLower): int
    {
        $s = 0;
        $label = mb_strtolower(trim(($el['label_text'] ?? '') . ' ' . ($el['element_name'] ?? '') . ' ' . ($el['placeholder'] ?? '')));
        $btn = mb_strtolower(trim($el['button_text'] ?? ''));
        $combined = trim($label . ' ' . $btn);

        if ($combined !== '') {
            // Multi-word phrase / bigram match (e.g. "kotor bongkar", "tera bongkar")
            $wordsInCombined = array_values(array_filter(preg_split('/\s+/', $combined), fn($w) => mb_strlen($w) >= 3));
            $wCount = count($wordsInCombined);
            for ($i = 0; $i < $wCount - 1; $i++) {
                $bigram = $wordsInCombined[$i] . ' ' . $wordsInCombined[$i + 1];
                if (str_contains($rawPromptLower, $bigram)) {
                    $s += 45;
                }
            }

            // Individual keyword token match
            foreach ($cleanKws as $kw) {
                if (str_contains($combined, mb_strtolower($kw))) {
                    $s += 12;
                }
            }
        }

        // Inputs and dropdowns preferred for workflow data entry
        if (in_array($el['element_category'] ?? '', ['input', 'dropdown', 'table'], true)) {
            $s += 5;
        }

        // Editable inputs preferred over readonly
        if (empty($el['is_readonly'])) {
            $s += 3;
        }

        return $s;
    }

    /**
     * Strip icon glyphs from button_text (e.g. "? Simpan" -> "Simpan"), keeping the raw value if nothing remains.
     */
    private function cleanButtonText(array $el): array
    {
        if (!empty($el['button_text'])) {
            $cleaned = trim(preg_replace('/[^\p{L}\p{N}\s\-\(\)\/\._]/u', '', $el['button_text']));
            $el['button_text'] = !empty($cleaned) ? $cleaned : $el['button_text'];
        }

        return $el;
    }

    /**
     * Fallback: match elements by label / button text / element id when no page matched.
     *
     * @return array<int, array>
     */
    private function fallbackByText(int $scanId, array $cleanKws, int $limit): array
    {
        $elemWhere = [];
        foreach ($cleanKws as $kw) {
            $escaped = $this->db->escapeLikeString($kw);
            $elemWhere[] = "label_text LIKE '%{$escaped}%'";
            $elemWhere[] = "button_text LIKE '%{$escaped}%'";
            $elemWhere[] = "element_id LIKE '%{$escaped}%'";
        }

        $elements = $this->db->table($this->table)
            ->where('scan_id', $scanId)
            ->whereIn('element_category', config('AiRag')->actionableCategories)
            ->where('(' . implode(' OR ', $elemWhere) . ')')
            ->limit($limit)
            ->get()
            ->getResultArray();

        return array_map(fn($el) => $this->cleanButtonText($el), $elements);
    }

    /**
     * Get all distinct menu paths (for building navigation map).
     */
    public function getMenuMap(int $scanId): array
    {
        return $this->select('menu_path, page_url, page_title')
                    ->where('scan_id', $scanId)
                    ->where('element_category', 'heading')
                    ->groupBy('menu_path')
                    ->findAll();
    }

    /**
     * Get all elements for a specific page.
     */
    public function getByMenuPath(int $scanId, string $menuPath): array
    {
        return $this->where('scan_id', $scanId)
                    ->where('menu_path', $menuPath)
                    ->findAll();
    }

    /**
     * Get scan summary statistics.
     */
    public function getScanSummary(int $scanId): array
    {
        $total = $this->where('scan_id', $scanId)->countAllResults(false);
        $pages = $this->select('menu_path')
                      ->where('scan_id', $scanId)
                      ->groupBy('menu_path')
                      ->countAllResults(false);

        $categories = $this->select('element_category, COUNT(*) as cnt')
                           ->where('scan_id', $scanId)
                           ->groupBy('element_category')
                           ->findAll();

        $widgets = $this->select('widget_type, COUNT(*) as cnt')
                        ->where('scan_id', $scanId)
                        ->where('widget_type !=', 'native')
                        ->groupBy('widget_type')
                        ->findAll();

        return [
            'total_elements'  => $total,
            'total_pages'     => $pages,
            'by_category'     => $categories,
            'special_widgets' => $widgets,
        ];
    }
}
