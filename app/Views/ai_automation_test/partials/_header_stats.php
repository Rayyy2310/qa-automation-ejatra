<!-- Header Banner & Stats Toolbar -->
<div class="row align-items-center mb-4 g-3">
    <div class="col-md-7">
        <h4 class="fw-bold text-dark mb-1">Automation Testing Studio</h4>
        <p class="text-secondary small mb-0">Ubah instruksi bahasa natural menjadi skenario pengujian Playwright terstruktur dengan sinkronisasi otomatis dan guardrail backend.</p>
    </div>
    <div class="col-md-5 d-flex justify-content-md-end gap-2">
        <div class="summary-widget py-2 px-3">
            <div class="me-3">
                <span class="form-label-custom mb-0">Modul Aktif</span>
                <span class="fw-bold fs-6 text-dark"><?= count($modules ?? []) ?> Modul</span>
            </div>
            <div class="text-primary fs-5">
                <i class="bi bi-grid-3x3-gap-fill"></i>
            </div>
        </div>
        <div class="summary-widget py-2 px-3">
            <div class="me-3">
                <span class="form-label-custom mb-0">LLM Provider</span>
                <span class="fw-bold fs-6 text-dark"><?= count($providers ?? []) ?> Ready</span>
            </div>
            <div class="text-success fs-5">
                <i class="bi bi-robot"></i>
            </div>
        </div>
        <button id="btnScanPages" class="summary-widget py-2 px-3 btn border-0" onclick="triggerPageScan()" title="Scan otomatis semua halaman e-Jatra untuk membangun knowledge base elemen UI">
            <div class="me-3">
                <span class="form-label-custom mb-0">Page Scanner</span>
                <span id="scanStatusText" class="fw-bold fs-6 text-dark">Scan UI</span>
            </div>
            <div class="text-info fs-5">
                <i id="scanIcon" class="bi bi-search"></i>
            </div>
        </button>
    </div>
</div>
