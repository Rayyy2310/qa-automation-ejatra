<?php
$maxParallel = (int)($maxConcurrentRuns ?? 4);
?>
<!-- 4. Batch & Parallel Regression Runner (FR-12) -->
<div class="studio-card mb-4" id="batchRunnerCard" data-max-parallel="<?= $maxParallel ?>">
    <div class="studio-card-header batch-runner-header border-bottom d-flex align-items-center justify-content-between gap-2">
        <!-- Title & Badges Area -->
        <div class="batch-runner-title-area d-flex align-items-center gap-2 flex-shrink-0">
            <h6 class="mb-0 fw-bold text-dark d-flex align-items-center text-nowrap" style="font-size: 0.86rem; letter-spacing: -0.01em;">
                <i class="bi bi-layers-half text-primary me-2"></i>
                <span>4. Eksekusi Paralel <span class="d-none d-xl-inline">Skenario Tersimpan </span><span class="text-secondary fw-normal d-none d-xxl-inline" style="font-size: 0.8rem;">(Batch Runner)</span></span>
            </h6>
            <span class="badge bg-primary-subtle text-primary border border-primary-subtle text-nowrap py-1 px-2" style="font-size: 0.72rem;" title="Maksimal <?= $maxParallel ?> browser dieksekusi secara paralel bersamaan">
                <i class="bi bi-cpu me-1"></i>Maks <?= $maxParallel ?><span class="d-none d-md-inline"> Paralel</span>
            </span>
            <span class="badge bg-light text-secondary border text-nowrap py-1 px-2" id="batchSelectedCountBadge" style="font-size: 0.72rem;" title="Jumlah skenario tersimpan yang dipilih">
                Terpilih: <strong id="batchSelectedCount" class="text-primary">0</strong>
            </span>
        </div>

        <!-- Batch Controls Toolbar -->
        <div class="batch-runner-controls d-flex align-items-center gap-2 flex-shrink-0 ms-lg-auto">
            <!-- Controls Sub-Row: Mode Run + Selection Quick Buttons -->
            <div class="batch-runner-subcontrols d-flex align-items-center gap-2">
                <!-- Mode Browser Toggle (Headless vs Visual) -->
                <div class="input-group input-group-sm flex-nowrap batch-mode-input-group" style="width: auto;">
                    <span class="input-group-text bg-light text-secondary border-end-0 py-1 px-2 text-nowrap" style="font-size: 0.75rem;" title="Mode Eksekusi Browser">
                        <i class="bi bi-display me-1"></i><span class="d-none d-sm-inline">Mode&nbsp;</span>Run
                    </span>
                    <select id="batchBrowserModeSelect" class="form-select form-select-sm fw-medium py-1 pe-4" style="font-size: 0.76rem; width: auto; min-width: 105px;">
                        <option value="true" selected title="Hemat CPU/GPU (Background tanpa jendela Chromium)">Headless</option>
                        <option value="false" title="Tampilkan jendela browser Chromium Playwright">Visual (Chromium)</option>
                    </select>
                </div>

                <!-- Select Max Parallel / Select All / Clear -->
                <div class="btn-group btn-group-sm flex-nowrap" role="group" aria-label="Pilihan Skenario">
                    <button type="button" class="btn btn-outline-secondary py-1 px-2 text-nowrap" id="btnBatchSelectMax" style="font-size: 0.76rem;" title="Pilih <?= $maxParallel ?> skenario pertama untuk dijalankan paralel sekaligus">
                        <i class="bi bi-lightning-charge me-1"></i>Pilih <?= $maxParallel ?>
                    </button>
                    <button type="button" class="btn btn-outline-secondary py-1 px-2 text-nowrap" id="btnBatchSelectAll" style="font-size: 0.76rem;" title="Pilih seluruh skenario pada modul ini">
                        <i class="bi bi-check2-all me-1"></i><span class="d-none d-sm-inline">Pilih&nbsp;</span>Semua
                    </button>
                    <button type="button" class="btn btn-outline-secondary py-1 px-2 text-nowrap" id="btnBatchClearSelection" style="font-size: 0.76rem;" title="Kosongkan pilihan">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>
            </div>

            <!-- Run Batch & Cancel Batch Buttons -->
            <div class="batch-runner-action-wrap">
                <button type="button" id="btnRunBatch" class="btn-play-run py-1 px-3 text-nowrap" style="font-size: 0.78rem;" disabled>
                    <i class="bi bi-collection-play-fill me-1"></i>
                    <span id="btnRunBatchLabel">Jalankan Paralel</span>
                </button>
                <button type="button" id="btnCancelBatch" class="btn btn-sm btn-outline-danger py-1 px-3 d-none text-nowrap" style="font-size: 0.78rem;">
                    <i class="bi bi-stop-circle me-1"></i>Hentikan Batch
                </button>
            </div>
        </div>
    </div>

    <div class="studio-card-body p-3">
        <!-- Warning Banner when Write Test scenarios are selected in parallel -->
        <div id="batchWriteWarning" class="alert alert-warning py-2 px-3 mb-3 small d-none d-flex align-items-center gap-2">
            <i class="bi bi-exclamation-triangle-fill fs-5 text-warning flex-shrink-0"></i>
            <div>
                <strong>Perhatian Mode Write Test Paralel:</strong> Anda memilih skenario dengan mode <code class="text-dark">write_test</code> untuk dieksekusi bersamaan. Pastikan data transaksi tiap skenario tidak saling bertabrakan pada sesi user yang sama.
            </div>
        </div>

        <div class="row g-3">
            <!-- Left Column: Saved Scenarios Selection Grid -->
            <div class="col-lg-6 d-flex flex-column">
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <span class="small fw-semibold text-secondary text-uppercase" style="font-size: 0.74rem; letter-spacing: 0.03em;">
                        <i class="bi bi-bookmark-check me-1 text-primary"></i>Daftar Skenario Tersimpan (<span id="batchModuleTitle">Pilih Modul di Panel 1</span>)
                    </span>
                    <small class="text-muted" style="font-size: 0.72rem;">
                        Maks <?= $maxParallel ?> browser jalan paralel, ke-<?= $maxParallel + 1 ?> dst otomatis mengantre
                    </small>
                </div>

                <div id="batchCasesContainer" class="border rounded-3 bg-light p-2 overflow-auto flex-grow-1" style="max-height: 290px; min-height: 180px;">
                    <div class="text-center text-muted py-5 small" id="batchCasesEmpty">
                        <i class="bi bi-journal-bookmark fs-3 d-block mb-2 opacity-50"></i>
                        Pilih <strong>Target Modul Bisnis</strong> pada Panel 1 di atas untuk memuat daftar skenario tersimpan.
                    </div>
                </div>
            </div>

            <!-- Right Column: Live Parallel Execution Monitor -->
            <div class="col-lg-6 d-flex flex-column">
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <span class="small fw-semibold text-secondary text-uppercase" style="font-size: 0.74rem; letter-spacing: 0.03em;">
                        <i class="bi bi-speedometer2 me-1 text-success"></i>Monitor Eksekusi Batch Paralel
                    </span>
                    <div class="d-flex align-items-center gap-1 flex-wrap" id="batchStatsPills">
                        <span class="badge bg-warning-subtle text-warning border border-warning-subtle small">
                            Berjalan: <strong id="batchCountRunning">0</strong>/<?= $maxParallel ?>
                        </span>
                        <span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle small">
                            Antre: <strong id="batchCountQueued">0</strong>
                        </span>
                        <span class="badge bg-success-subtle text-success border border-success-subtle small">
                            Lolos: <strong id="batchCountPassed">0</strong>
                        </span>
                        <span class="badge bg-danger-subtle text-danger border border-danger-subtle small">
                            Gagal: <strong id="batchCountFailed">0</strong>
                        </span>
                    </div>
                </div>

                <!-- Batch Progress Bar -->
                <div class="mb-2">
                    <div class="d-flex justify-content-between small text-secondary mb-1" style="font-size: 0.75rem;">
                        <span id="batchProgressText" class="fw-semibold text-dark">Status Batch: Siap</span>
                        <span id="batchProgressSummary">0 / 0 Skenario Selesai</span>
                    </div>
                    <div class="progress" style="height: 7px;">
                        <div id="batchProgressBar" class="progress-bar bg-primary" style="width: 0%;"></div>
                    </div>
                </div>

                <!-- Batch Live Items Table -->
                <div class="border rounded-3 overflow-hidden flex-grow-1 bg-white d-flex flex-column" style="max-height: 245px; min-height: 145px;">
                    <div class="table-responsive flex-grow-1 overflow-auto">
                        <table class="table table-sm table-hover align-middle mb-0" style="font-size: 0.79rem;">
                            <thead class="table-light text-secondary small text-uppercase sticky-top">
                                <tr>
                                    <th class="ps-2" style="width: 55px;">Run</th>
                                    <th>Skenario</th>
                                    <th class="text-center">Mode</th>
                                    <th class="text-center">Langkah</th>
                                    <th class="text-end">Durasi</th>
                                    <th class="text-center">Status</th>
                                    <th class="text-end pe-2">Aksi</th>
                                </tr>
                            </thead>
                            <tbody id="batchMonitorBody">
                                <tr>
                                    <td colspan="7" class="text-center text-muted py-4 small">
                                        <i class="bi bi-layers fs-4 d-block mb-1 opacity-50"></i>
                                        Centang beberapa skenario di sebelah kiri lalu klik <strong>"Jalankan Paralel"</strong>.
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
