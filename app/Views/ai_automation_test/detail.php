<?= $this->extend('layouts/main') ?>

<?= $this->section('title') ?>Detail Run #<?= htmlspecialchars($run['id'] ?? '') ?> — AI Automation Testing<?= $this->endSection() ?>

<?= $this->section('content') ?>
<div class="container-fluid px-3 px-lg-4">
    
    <!-- Run Overview Banner Card -->
    <?php
        $status = strtoupper($run['status'] ?? 'QUEUED');
        $badgePill = 'pill-neutral';
        $statusIcon = 'bi-hourglass';

        if ($status === 'PASSED') {
            $badgePill = 'pill-passed';
            $statusIcon = 'bi-check-circle-fill';
        } elseif ($status === 'FAILED') {
            $badgePill = 'pill-failed';
            $statusIcon = 'bi-x-circle-fill';
        } elseif ($status === 'RUNNING') {
            $badgePill = 'pill-running';
            $statusIcon = 'bi-arrow-repeat';
        } elseif ($status === 'QUEUED') {
            $badgePill = 'pill-queued';
            $statusIcon = 'bi-clock';
        }
    ?>

    <div class="studio-card mb-4">
        <div class="studio-card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
            <div class="d-flex align-items-center gap-2">
                <h5 class="fw-bold text-dark mb-0">
                    Eksekusi Pengujian #<?= htmlspecialchars($run['id'] ?? '') ?>
                </h5>
                <span class="pill-status <?= $badgePill ?>">
                    <i class="bi <?= $statusIcon ?>"></i> <?= htmlspecialchars($status) ?>
                </span>
            </div>
            <div class="d-flex align-items-center gap-3">
                <div class="text-secondary small">
                    <i class="bi bi-calendar3 me-1"></i> Dijalankan: <?= htmlspecialchars($run['created_at'] ?? $run['started_at'] ?? '-') ?>
                </div>
                <a href="<?= base_url('ai-automation-test/history') ?>" class="btn btn-sm btn-outline-secondary py-1 px-2.5">
                    <i class="bi bi-arrow-left me-1"></i> Riwayat
                </a>
            </div>
        </div>

        <div class="p-4">
            <div class="row g-4">
                <div class="col-md-4">
                    <span class="form-label-custom">Skenario Pengujian</span>
                    <div class="fw-bold text-dark fs-6 mb-1"><?= htmlspecialchars($run['test_name'] ?? 'Adhoc Run') ?></div>
                    <div class="text-secondary small">
                        Modul: <span class="badge bg-light text-dark border"><?= htmlspecialchars($run['module_name'] ?? 'General') ?></span>
                    </div>
                </div>

                <div class="col-md-4">
                    <span class="form-label-custom">Engine & Konfigurasi</span>
                    <div class="text-dark mb-1">
                        <i class="bi bi-cpu text-primary me-1"></i>
                        <span class="fw-medium"><?= htmlspecialchars($run['llm_provider'] ?? 'Auto') ?></span>
                        <span class="text-muted small">(<?= htmlspecialchars($run['llm_model'] ?? '-') ?>)</span>
                    </div>
                    <div class="text-secondary small">
                        Mode: 
                        <span class="badge <?= ($run['mode'] ?? '') === 'write_test' ? 'bg-warning-subtle text-warning-emphasis border border-warning' : 'bg-light text-secondary border' ?>">
                            <?= htmlspecialchars($run['mode'] ?? 'read_only') ?>
                        </span>
                        &bull; Target: <code class="text-dark bg-light px-1 rounded"><?= htmlspecialchars($run['module_base_url'] ?? 'localhost') ?></code>
                    </div>
                </div>

                <div class="col-md-4">
                    <span class="form-label-custom">Metrik Eksekusi</span>
                    <div class="text-dark fw-bold fs-6 mb-1">
                        <i class="bi bi-stopwatch text-primary me-1"></i>
                        <?= number_format((int)($run['total_duration_ms'] ?? 0)) ?> ms
                    </div>
                    <div class="text-secondary small">
                        Hasil: <span class="text-success fw-medium"><?= $run['passed_steps'] ?? 0 ?> Lolos</span> &bull; 
                        <span class="text-danger fw-medium"><?= $run['failed_steps'] ?? 0 ?> Gagal</span> &bull; 
                        <span class="text-muted"><?= $run['skipped_steps'] ?? 0 ?> Dilewati</span>
                    </div>
                </div>
            </div>

            <?php if (!empty($run['test_prompt'])): ?>
                <div class="mt-3 pt-3 border-top">
                    <span class="form-label-custom mb-1">Prompt Instruksi Pengujian:</span>
                    <div class="bg-light p-2 rounded border small text-secondary font-monospace">
                        <?= htmlspecialchars($run['test_prompt']) ?>
                    </div>
                </div>
            <?php endif; ?>
        </div>
    </div>

    <!-- Steps Execution Details Table -->
    <div class="studio-card mb-5">
        <div class="studio-card-header d-flex justify-content-between align-items-center">
            <h6 class="mb-0 fw-bold text-dark d-flex align-items-center gap-2">
                <i class="bi bi-diagram-3 text-primary"></i> Rincian Langkah Pengujian (Step Execution)
            </h6>
            <span class="pill-status pill-neutral"><?= count($steps ?? []) ?> Langkah</span>
        </div>

        <div class="p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0" style="font-size: 0.8125rem;">
                    <thead class="table-light text-secondary small text-uppercase">
                        <tr>
                            <th style="width: 50px;" class="text-center">No</th>
                            <th>Aksi</th>
                            <th>Target Selector</th>
                            <th>Input Value</th>
                            <th>Ekspektasi</th>
                            <th>Status</th>
                            <th>Durasi</th>
                            <th class="text-center">Retry</th>
                            <th>Error & Kategori</th>
                            <th style="width: 140px;" class="text-end">Artefak</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (!empty($steps)): ?>
                            <?php foreach ($steps as $step): ?>
                                <?php
                                    $stepResult = strtoupper($step['result'] ?? 'PENDING');
                                    $badgeClass = 'pill-neutral';
                                    $rowClass = '';

                                    if ($stepResult === 'PASS') {
                                        $badgeClass = 'pill-passed';
                                        $rowClass = 'table-success bg-opacity-10';
                                    } elseif ($stepResult === 'FAIL') {
                                        $badgeClass = 'pill-failed';
                                        $rowClass = 'table-danger bg-opacity-10';
                                    } elseif ($stepResult === 'SKIPPED') {
                                        $badgeClass = 'pill-neutral';
                                    }
                                ?>
                                <tr class="<?= $rowClass ?>">
                                    <td class="text-center fw-bold text-secondary"><?= htmlspecialchars($step['step_no'] ?? '') ?></td>
                                    <td>
                                        <span class="action-tag"><?= htmlspecialchars($step['action'] ?? '') ?></span>
                                    </td>
                                    <td>
                                        <?php 
                                            $targetData = json_decode($step['target_json'] ?? '{}', true);
                                            if (is_array($targetData) && isset($targetData['value'])) {
                                                echo '<span class="action-tag me-1">' . htmlspecialchars($targetData['strategy'] ?? 'css') . '</span>';
                                                echo '<code class="text-dark small">' . htmlspecialchars($targetData['value']) . '</code>';
                                                if (!empty($targetData['fallback'])) {
                                                    echo '<div class="text-muted small" style="font-size: 0.72rem;">fallback: ' . htmlspecialchars($targetData['fallback']) . '</div>';
                                                }
                                            } else {
                                                echo '<code class="text-dark small">' . htmlspecialchars($step['target_json'] ?? '-') . '</code>';
                                            }
                                        ?>
                                    </td>
                                    <td>
                                        <small class="text-dark"><?= htmlspecialchars($step['value'] ?? '-') ?></small>
                                    </td>
                                    <td>
                                        <small class="text-secondary"><?= htmlspecialchars($step['expected_result'] ?? '-') ?></small>
                                    </td>
                                    <td>
                                        <span class="pill-status <?= $badgeClass ?>"><?= htmlspecialchars($stepResult) ?></span>
                                    </td>
                                    <td class="text-secondary small font-monospace">
                                        <?= number_format((int)($step['duration_ms'] ?? 0)) ?> ms
                                    </td>
                                    <td class="text-center text-secondary small">
                                        <?= htmlspecialchars($step['retry_count'] ?? 0) ?>
                                    </td>
                                    <td>
                                        <?php if (!empty($step['error'])): ?>
                                            <div>
                                                <span class="badge bg-danger-subtle text-danger border border-danger mb-1"><?= htmlspecialchars($step['error_category'] ?? 'ERROR') ?></span>
                                                <div class="small text-danger" style="max-width: 220px;" title="<?= htmlspecialchars($step['error']) ?>">
                                                    <?= htmlspecialchars($step['error']) ?>
                                                </div>
                                            </div>
                                        <?php else: ?>
                                            <span class="text-muted">-</span>
                                        <?php endif; ?>
                                    </td>
                                    <td class="text-end">
                                        <?php if (!empty($step['screenshot'])): ?>
                                            <button type="button" class="btn btn-sm btn-outline-primary py-0 px-2 me-1 view-screenshot" data-src="<?= base_url('ai-automation-test/screenshot/' . rawurlencode(basename($step['screenshot']))) ?>">
                                                <i class="bi bi-camera"></i> Screen
                                            </button>
                                        <?php endif; ?>
                                        <?php if (!empty($step['dom_snapshot'])): ?>
                                            <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 view-dom" data-dom="<?= htmlspecialchars($step['dom_snapshot']) ?>">
                                                <i class="bi bi-code-slash"></i> DOM
                                            </button>
                                        <?php endif; ?>
                                        <?php if (empty($step['screenshot']) && empty($step['dom_snapshot'])): ?>
                                            <span class="text-muted">-</span>
                                        <?php endif; ?>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        <?php else: ?>
                            <tr>
                                <td colspan="10" class="text-center py-4 text-muted">
                                    Tidak ada langkah yang tercatat untuk run ini.
                                </td>
                            </tr>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

</div>
<?= $this->endSection() ?>

<?= $this->section('scripts') ?>
<script>
    document.addEventListener('DOMContentLoaded', function() {
        const screenshotModalEl = document.getElementById('screenshotModal');
        const domModalEl = document.getElementById('domModal');
        const screenshotModal = screenshotModalEl ? new bootstrap.Modal(screenshotModalEl) : null;
        const domModal = domModalEl ? new bootstrap.Modal(domModalEl) : null;
        const domContent = document.getElementById('domContent');
        const btnCopyDom = document.getElementById('btnCopyDom');

        document.querySelectorAll('.view-screenshot').forEach(btn => {
            btn.addEventListener('click', function() {
                const src = this.getAttribute('data-src');
                const img = document.getElementById('screenshotImg');
                const downloadBtn = document.getElementById('screenshotDownloadBtn');
                if (img) img.src = src;
                if (downloadBtn) downloadBtn.href = src;
                if (screenshotModal) screenshotModal.show();
            });
        });

        document.querySelectorAll('.view-dom').forEach(btn => {
            btn.addEventListener('click', function() {
                const domText = this.getAttribute('data-dom') || 'DOM snapshot tidak tersedia.';
                if (domContent) domContent.textContent = domText;
                if (domModal) domModal.show();
            });
        });

        if (btnCopyDom && domContent) {
            btnCopyDom.addEventListener('click', function() {
                navigator.clipboard.writeText(domContent.textContent).then(() => {
                    const orig = this.innerHTML;
                    this.innerHTML = '<i class="bi bi-check2 text-success"></i> Tersalin!';
                    setTimeout(() => { this.innerHTML = orig; }, 1500);
                });
            });
        }
    });
</script>
<?= $this->endSection() ?>
