<div class="studio-card d-flex flex-column h-100 mb-0" id="studioRightCard" style="min-height: 0; overflow: hidden;">
    <!-- Card Header with Tabs & Contextual Action Controls -->
    <div class="studio-card-header p-2 px-3 border-bottom d-flex align-items-center justify-content-between flex-nowrap gap-2">
        
        <!-- Left: Tab Navigation (Pills) -->
        <ul class="nav nav-pills custom-tab-pills gap-1 mb-0 flex-shrink-0" id="studioTabNav" role="tablist">
            <li class="nav-item" role="presentation">
                <button class="nav-link active d-flex align-items-center gap-1.5" id="tabBtnPlan" data-bs-toggle="pill" data-bs-target="#panePlan" type="button" role="tab" aria-selected="true" style="padding: 0.28rem 0.65rem; font-size: 0.78rem;">
                    <i class="bi bi-list-check text-primary"></i>
                    <span class="fw-semibold">2. Test Plan</span>
                    <span class="pill-status pill-neutral ms-1 py-0 px-2" id="stepCountBadge" style="font-size: 0.70rem;">0 Langkah</span>
                </button>
            </li>
            <li class="nav-item" role="presentation">
                <button class="nav-link d-flex align-items-center gap-1.5" id="tabBtnMonitor" data-bs-toggle="pill" data-bs-target="#paneMonitor" type="button" role="tab" aria-selected="false" style="padding: 0.28rem 0.65rem; font-size: 0.78rem;">
                    <i class="bi bi-activity text-success"></i>
                    <span class="fw-semibold">3. Live Monitor</span>
                    <span id="overallStatus" class="pill-status pill-neutral ms-1 py-0 px-2" style="font-size: 0.70rem;">IDLE</span>
                </button>
            </li>
        </ul>

        <!-- Right: Contextual Actions & Badges -->
        <div class="d-flex align-items-center justify-content-end gap-2 flex-shrink-1 overflow-hidden" style="min-width: 0;">
            <!-- Test Plan Controls (Active on Tab 1) -->
            <div id="planHeaderControls" class="d-flex align-items-center gap-2 flex-nowrap" style="min-width: 0;">
                <span class="badge bg-light text-dark border d-none d-inline-flex align-items-center gap-1.5 py-1 px-2 text-nowrap" id="llmTokenBadge" style="font-size: 0.74rem; font-weight: 500; min-width: 0;">
                    <i class="bi bi-cpu text-primary"></i>
                    <span id="llmModelName" class="fw-semibold text-secondary text-truncate d-inline-block align-middle" style="max-width: 120px;" title=""></span>
                    <span class="text-muted">|</span>
                    <span title="Input / Prompt Tokens" class="text-success text-nowrap"><i class="bi bi-box-arrow-in-right"></i> <strong id="promptTokensCount">0</strong> in</span>
                    <span class="text-muted">/</span>
                    <span title="Output / Completion Tokens" class="text-primary text-nowrap"><i class="bi bi-box-arrow-right"></i> <strong id="completionTokensCount">0</strong> out</span>
                </span>
                <button id="btnRunTest" class="btn-play-run py-1 px-2 px-xl-3 text-nowrap flex-shrink-0" style="font-size: 0.80rem;" disabled>
                    <i class="bi bi-play-fill fs-5"></i> <span>Run Playwright Test</span>
                </button>
            </div>

            <!-- Monitor Controls (Active on Tab 2) -->
            <div id="monitorHeaderControls" class="d-none align-items-center gap-2 flex-nowrap">
                <div class="text-secondary small fw-medium text-nowrap" id="resultDuration">
                    <i class="bi bi-stopwatch"></i> 0 ms
                </div>
                <button id="btnCancelRun" class="btn btn-sm btn-outline-danger px-2 py-1 d-none text-nowrap" style="font-size: 0.76rem;" title="Hentikan pengujian yang sedang berjalan">
                    <i class="bi bi-stop-circle me-1"></i> Hentikan
                </button>
            </div>
        </div>

    </div>

    <!-- Card Body: Tab Content -->
    <div class="studio-card-body p-0 d-flex flex-column flex-grow-1 position-relative tab-content" id="studioTabContent" style="min-height: 0;">
        
        <!-- ================= TAB PANE 1: TEST PLAN ================= -->
        <div class="tab-pane active" id="panePlan" role="tabpanel">
            
            <!-- Loading Indicator Inside Pane 1 -->
            <div id="loadingArea" class="h-100 d-none text-center py-5 d-flex flex-column justify-content-center align-items-center">
                <div class="spinner-border text-primary mb-3" role="status" style="width: 2.75rem; height: 2.75rem;"></div>
                <h6 class="fw-bold text-dark mb-1" id="loadingTitle">Menghubungi AI Engine...</h6>
                <p class="text-secondary small mb-0" id="loadingText">Menerjemahkan instruksi natural language menjadi skema langkah pengujian...</p>
            </div>

            <!-- Validation Alerts (Hidden by default) -->
            <div id="validationAlerts" class="d-none p-3 pb-0"></div>

            <!-- Test Plan Table Container -->
            <div id="testPlanArea" class="d-flex flex-column flex-grow-1 d-none" style="min-height: 0;">
                <div class="table-responsive flex-grow-1 table-scroll-studio" style="min-height: 0;">
                    <table class="table table-hover align-middle mb-0 table-sticky-head" style="font-size: 0.8125rem;">
                        <thead class="table-light text-secondary small text-uppercase">
                            <tr>
                                <th style="width: 45px;" class="text-center">No</th>
                                <th>Aksi</th>
                                <th>Target Selector</th>
                                <th>Value</th>
                                <th>Wait Strategy</th>
                                <th class="text-center">Retry</th>
                                <th>Ekspektasi</th>
                            </tr>
                        </thead>
                        <tbody id="testPlanBody"></tbody>
                    </table>
                </div>
            </div>

            <!-- Initial Empty State Placeholder -->
            <div id="emptyStatePlaceholder" class="d-flex flex-column justify-content-center align-items-center flex-grow-1 text-center py-5">
                <div class="text-muted opacity-50 mb-3" style="font-size: 3.5rem;">
                    <i class="bi bi-clipboard2-check"></i>
                </div>
                <h6 class="text-dark fw-bold mb-2">Belum Ada Skenario Pengujian</h6>
                <p class="text-secondary small mx-auto mb-0" style="max-width: 420px;">
                    Pilih modul bisnis di sebelah kiri, tentukan model AI yang ingin digunakan, lalu masukkan instruksi pengujian dengan bahasa natural untuk menghasilkan Test Plan.
                </p>
            </div>

        </div>

        <!-- ================= TAB PANE 2: LIVE MONITOR ================= -->
        <div class="tab-pane" id="paneMonitor" role="tabpanel">
            <?= $this->include('ai_automation_test/partials/_live_runner') ?>
        </div>

    </div>
</div>
