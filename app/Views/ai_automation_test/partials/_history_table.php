<!-- Riwayat Pengujian & Execution History Section -->
<div id="historySection" class="card border-0 shadow-sm rounded-3 mt-4">
    <div class="card-header bg-white py-3 border-bottom d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div class="d-flex align-items-center gap-2">
            <div class="icon-shape bg-primary-subtle text-primary rounded-2 p-2 d-flex align-items-center justify-content-center" style="width: 36px; height: 36px;">
                <i class="bi bi-clock-history fs-5"></i>
            </div>
            <div>
                <h6 class="fw-bold mb-0 text-dark">Riwayat Pengujian Terakhir</h6>
                <small class="text-muted">Daftar eksekusi skenario pengujian Playwright dengan status dan artefak</small>
            </div>
        </div>

        <!-- Filter Status Buttons -->
        <div class="d-flex align-items-center gap-1">
            <button type="button" class="btn btn-sm btn-outline-secondary filter-history-btn active" data-status="ALL" onclick="filterHistoryTable('ALL')">
                Semua <span class="badge bg-secondary ms-1" id="badgeAllCount"><?= count($recentRuns ?? []) ?></span>
            </button>
            <button type="button" class="btn btn-sm btn-outline-success filter-history-btn" data-status="PASSED" onclick="filterHistoryTable('PASSED')">
                <i class="bi bi-check-circle me-1"></i> Passed
            </button>
            <button type="button" class="btn btn-sm btn-outline-danger filter-history-btn" data-status="FAILED" onclick="filterHistoryTable('FAILED')">
                <i class="bi bi-x-circle me-1"></i> Failed
            </button>
            <button type="button" class="btn btn-sm btn-outline-warning filter-history-btn" data-status="RUNNING" onclick="filterHistoryTable('RUNNING')">
                <i class="bi bi-hourglass-split me-1"></i> Running
            </button>
            <button type="button" id="btnRefreshHistory" class="btn btn-sm btn-light border ms-2" onclick="refreshHistoryTable()" title="Refresh Riwayat">
                <i class="bi bi-arrow-clockwise"></i>
            </button>
        </div>
    </div>

    <div class="card-body p-0">
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0" id="historyTable">
                <thead class="table-light">
                    <tr>
                        <th class="ps-3" style="width: 70px;">ID</th>
                        <th>Modul / Skenario</th>
                        <th>Waktu Eksekusi</th>
                        <th>Mode DB</th>
                        <th>LLM Engine</th>
                        <th class="text-center">Langkah</th>
                        <th class="text-end">Durasi</th>
                        <th class="text-center">Status</th>
                        <th class="text-end pe-3">Aksi</th>
                    </tr>
                </thead>
                <tbody id="historyTableBody">
                    <?php if (empty($recentRuns)): ?>
                        <tr>
                            <td colspan="9" class="text-center text-muted py-4">
                                <i class="bi bi-inbox fs-3 d-block mb-1 text-secondary opacity-50"></i>
                                Belum ada riwayat pengujian. Jalankan skenario baru untuk melihat hasil di sini.
                            </td>
                        </tr>
                    <?php else: ?>
                        <?php foreach ($recentRuns as $run): ?>
                            <?php
                                $statusUpper = strtoupper($run['status'] ?? 'PENDING');
                                $statusClass = 'bg-secondary-subtle text-secondary border-secondary';
                                $icon = 'bi-clock';
                                if ($statusUpper === 'PASSED') {
                                    $statusClass = 'bg-success-subtle text-success border-success';
                                    $icon = 'bi-check-circle-fill';
                                } elseif ($statusUpper === 'FAILED') {
                                    $statusClass = 'bg-danger-subtle text-danger border-danger';
                                    $icon = 'bi-x-circle-fill';
                                } elseif ($statusUpper === 'RUNNING') {
                                    $statusClass = 'bg-warning-subtle text-warning border-warning';
                                    $icon = 'bi-arrow-repeat spin';
                                }
                            ?>
                            <tr data-status="<?= $statusUpper ?>" id="historyRow-<?= $run['id'] ?>">
                                <td class="ps-3 fw-bold text-secondary">#<?= $run['id'] ?></td>
                                <td>
                                    <div class="fw-bold text-dark mb-0"><?= esc($run['test_case_name'] ?? $run['module_name'] ?? 'Pengujian Studio') ?></div>
                                    <small class="text-muted"><i class="bi bi-grid me-1"></i><?= esc($run['module_name'] ?? 'General') ?></small>
                                </td>
                                <td>
                                    <small class="text-dark d-block"><?= !empty($run['created_at']) ? date('d M Y H:i:s', strtotime($run['created_at'])) : '-' ?></small>
                                </td>
                                <td>
                                    <span class="badge bg-light text-dark border font-monospace small">
                                        <?= esc($run['mode'] ?? 'read_only') ?>
                                    </span>
                                </td>
                                <td>
                                    <small class="text-secondary font-monospace"><?= esc($run['llm_provider'] ?? 'groq') ?></small>
                                </td>
                                <td class="text-center">
                                    <span class="badge bg-light text-dark border fw-normal">
                                        <span class="text-success fw-bold"><?= (int)($run['passed_steps'] ?? 0) ?></span> / <?= (int)($run['total_steps'] ?? 0) ?>
                                    </span>
                                </td>
                                <td class="text-end">
                                    <small class="font-monospace text-muted"><?= number_format((int)($run['total_duration_ms'] ?? 0)) ?> ms</small>
                                </td>
                                <td class="text-center">
                                    <span class="badge border <?= $statusClass ?> py-1 px-2">
                                        <i class="bi <?= $icon ?> me-1"></i> <?= $statusUpper ?>
                                    </span>
                                </td>
                                <td class="text-end pe-3">
                                    <button type="button" class="btn btn-sm btn-outline-primary py-0 px-2 me-1 js-open-run-detail" data-run-id="<?= $run['id'] ?>" onclick="openRunDetailModal(<?= $run['id'] ?>)" title="Lihat Detail & Artefak">
                                        <i class="bi bi-eye"></i> Detail
                                    </button>
                                    <button type="button" class="btn btn-sm btn-outline-danger py-0 px-2 js-delete-run" data-run-id="<?= $run['id'] ?>" onclick="deleteHistoryRun(<?= $run['id'] ?>)" title="Hapus Riwayat">
                                        <i class="bi bi-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>

<?= $this->include('ai_automation_test/partials/_run_detail_modal') ?>

