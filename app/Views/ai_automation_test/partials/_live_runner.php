<!-- Queue Alert Box -->
<div id="queueArea" class="alert alert-warning m-3 mb-0 d-none d-flex align-items-center gap-2 py-2 px-3 small">
    <i class="bi bi-hourglass-split fs-5"></i>
    <span id="queueText">Pengujian masuk antrian runner...</span>
</div>

<!-- Live Test Execution Dashboard -->
<div id="resultArea" class="d-flex flex-column flex-grow-1 p-3 pt-2" style="min-height: 0;">
    
    <!-- Progress Bar & Summary -->
    <div class="mb-2">
        <div class="d-flex justify-content-between small text-secondary mb-1">
            <span id="progressPercentText" class="fw-semibold text-dark">Progres: 0%</span>
            <span id="resultSummary" class="text-secondary">0 / 0 Steps Selesai</span>
        </div>
        <div class="progress" style="height: 8px;">
            <div id="testProgressBar" class="progress-bar bg-primary progress-bar-striped progress-bar-animated" style="width: 0%;"></div>
        </div>
        <!-- Dynamic Execution Notice / Conclusion -->
        <div id="executionNotice" class="alert py-2 px-3 mt-2 mb-0 small d-none d-flex align-items-center gap-2">
            <i id="executionNoticeIcon" class="bi bi-info-circle-fill fs-6"></i>
            <span id="executionNoticeText"></span>
        </div>
    </div>

    <!-- Live Steps Table -->
    <div class="border rounded-3 overflow-hidden flex-grow-1 d-flex flex-column" style="min-height: 0;">
        <div class="table-responsive flex-grow-1 table-scroll-studio" style="min-height: 0;">
            <table class="table table-hover align-middle mb-0 table-sticky-head" style="font-size: 0.8125rem;">
                <thead class="table-light text-secondary small text-uppercase">
                    <tr>
                        <th style="width: 45px;" class="text-center">No</th>
                        <th>Aksi</th>
                        <th>Target</th>
                        <th>Status</th>
                        <th>Durasi</th>
                        <th class="text-center">Retry</th>
                        <th>Error & Keterangan</th>
                        <th style="width: 120px;" class="text-end">Artefak</th>
                    </tr>
                </thead>
                <tbody id="resultBody">
                    <tr>
                        <td colspan="8" class="text-center text-muted py-5">
                            <i class="bi bi-play-circle fs-2 d-block mb-2 text-secondary opacity-50"></i>
                            <div class="fw-medium text-dark">Belum ada pengujian yang dieksekusi</div>
                            <div class="small text-muted mt-1">Generate test plan pada tab sebelumnya, lalu klik tombol <strong>"Run Playwright Test"</strong>.</div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>

</div>
