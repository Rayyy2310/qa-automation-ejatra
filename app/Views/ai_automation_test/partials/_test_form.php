<!-- 1. Parameter & Skenario Pengujian Input Form -->
<div class="studio-card mb-0" id="studioLeftCard">
    <div class="studio-card-header">
        <h6 class="mb-0 fw-bold text-dark d-flex align-items-center gap-2">
            <i class="bi bi-sliders text-primary"></i> 1. Parameter & Skenario Pengujian
        </h6>
    </div>
    <div class="studio-card-body">
        
        <!-- Module Dropdown -->
        <div class="mb-2">
            <label class="form-label-custom" for="moduleSelect">
                Target Modul Bisnis
            </label>
            <div class="input-group">
                <select id="moduleSelect" class="form-select">
                    <option value="">-- Pilih Modul e-Jatra --</option>
                    <?php if (!empty($modules)): ?>
                        <?php foreach ($modules as $m): ?>
                            <option value="<?= htmlspecialchars($m['id']) ?>" data-name="<?= htmlspecialchars($m['name']) ?>" data-base-url="<?= htmlspecialchars($m['base_url'] ?? '') ?>" data-code="<?= htmlspecialchars($m['code'] ?? '') ?>">
                                <?= htmlspecialchars($m['name']) ?> (<?= htmlspecialchars($m['code'] ?? '') ?>)
                            </option>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </select>
                <button type="button" class="btn btn-outline-primary" id="btnAddModule" title="Tambah modul bisnis baru">
                    <i class="bi bi-plus-lg"></i>
                </button>
                <button type="button" class="btn btn-outline-secondary d-none" id="btnEditModule" title="Ubah modul bisnis ini">
                    <i class="bi bi-pencil"></i>
                </button>
                <button type="button" class="btn btn-outline-danger d-none" id="btnDeleteModule" title="Hapus modul bisnis ini">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        </div>

        <!-- Target URL Input (LAN / Local / Tunneling) -->
        <div class="mb-2">
            <label class="form-label-custom" for="targetUrlInput">
                Target URL / Alamat LAN Web
                <span class="text-muted fw-normal float-end font-monospace" style="font-size: 0.72rem;">Bisa diubah ke IP LAN / Domain</span>
            </label>
            <div class="input-group">
                <span class="input-group-text bg-light text-muted border-end-0" style="font-size: 0.85rem;"><i class="bi bi-link-45deg"></i></span>
                <input type="text" class="form-control border-start-0" id="targetUrlInput" placeholder="<?= esc($defaultTargetUrl ?: 'http://localhost/e-jatra') ?>" value="<?= esc($defaultTargetUrl ?? '') ?>">
            </div>
            <div class="small text-muted mt-1" style="font-size: 0.72rem;">
                <i class="bi bi-info-circle text-primary"></i> Masukkan alamat web target e-Jatra Anda (bukan port 8080 studio QA).
            </div>
        </div>

        <!-- Mode, Browser Option, & Env -->
        <div class="row g-2 mb-2 align-items-stretch">
            <div class="col-4 d-flex flex-column">
                <div class="d-flex justify-content-between align-items-center" style="min-height: 20px; margin-bottom: 0.35rem;">
                    <label class="form-label-custom mb-0 text-truncate" for="modeSelect" title="Mode Pengujian">Mode Pengujian</label>
                </div>
                <select id="modeSelect" class="form-select" style="height: 38px; font-size: 0.82rem;">
                    <option value="read_only" selected>Read Only</option>
                    <option value="write_test">Write Test</option>
                </select>
                <div class="small text-muted mt-1 text-truncate" id="modeHelpText" style="font-size: 0.72rem; height: 18px; line-height: 18px;" title="Aman (baca saja)">
                    <i class="bi bi-shield-check text-success"></i> Aman (baca saja)
                </div>
            </div>
            <div class="col-4 d-flex flex-column">
                <div class="d-flex justify-content-between align-items-center" style="min-height: 20px; margin-bottom: 0.35rem;">
                    <label class="form-label-custom mb-0 text-truncate" for="browserDisplaySelect" title="Tampilan Browser">Browser</label>
                    <button type="button" id="btnResetBrowser" class="btn btn-link text-decoration-none p-0 text-muted" title="Bersihkan browser sisa yang menggantung" style="font-size: 0.72rem; line-height: 1;">
                        <i class="bi bi-arrow-clockwise"></i> Reset
                    </button>
                </div>
                <select id="browserDisplaySelect" class="form-select" style="height: 38px; font-size: 0.82rem;">
                    <option value="false" selected>Visual</option>
                    <option value="true">Headless</option>
                </select>
                <div class="small text-muted mt-1 text-truncate" style="font-size: 0.72rem; height: 18px; line-height: 18px;" title="Pantau langsung browser">
                    <i class="bi bi-browser-chrome text-primary"></i> Pantau Browser
                </div>
            </div>
            <div class="col-4 d-flex flex-column">
                <div class="d-flex justify-content-between align-items-center" style="min-height: 20px; margin-bottom: 0.35rem;">
                    <label class="form-label-custom mb-0 text-truncate" for="envSelect" title="Target Environment">Environment</label>
                </div>
                <select id="envSelect" class="form-select" style="height: 38px; font-size: 0.82rem;" disabled>
                    <option value="testing" selected>Local Testing</option>
                </select>
                <div class="small text-muted mt-1 text-truncate" style="font-size: 0.72rem; height: 18px; line-height: 18px;" title="Database Testing">
                    <i class="bi bi-database text-muted"></i> DB Testing
                </div>
            </div>
        </div>

        <!-- Multi-LLM Provider & Model -->
        <div class="row g-2 mb-2">
            <div class="col-sm-6">
                <label class="form-label-custom" for="providerSelect">LLM Engine</label>
                <select id="providerSelect" class="form-select">
                    <option value="">-- Pilih Provider --</option>
                    <?php if (!empty($providers)): ?>
                        <?php foreach ($providers as $p): ?>
                            <option value="<?= htmlspecialchars($p['name'], ENT_QUOTES, 'UTF-8') ?>" data-models="<?= htmlspecialchars(json_encode($p['models']), ENT_QUOTES, 'UTF-8') ?>">
                                <?= htmlspecialchars($p['displayName'], ENT_QUOTES, 'UTF-8') ?>
                            </option>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </select>
            </div>
            <div class="col-sm-6">
                <label class="form-label-custom" for="modelSelect">Model Target</label>
                <select id="modelSelect" class="form-select">
                    <option value="">-- Pilih Model --</option>
                </select>
            </div>
        </div>

        <!-- Saved Scenario Dropdown -->
        <div class="mb-2">
            <div class="d-flex align-items-center justify-content-between mb-1">
                <label class="form-label-custom mb-0" for="savedCaseSelect">Skenario Tersimpan (Regression Suite)</label>
                <span class="badge bg-primary-subtle text-primary border border-primary-subtle small d-none" id="savedCaseBadge"><i class="bi bi-bookmark-check-fill me-1"></i>Tersimpan</span>
            </div>
            <div class="input-group">
                <select id="savedCaseSelect" class="form-select">
                    <option value="">-- Tulis Skenario Baru --</option>
                </select>
                <button type="button" class="btn btn-outline-secondary d-none" id="btnEditSavedCase" title="Ubah nama skenario ini">
                    <i class="bi bi-pencil"></i>
                </button>
                <button type="button" class="btn btn-outline-danger d-none" id="btnDeleteSavedCase" title="Hapus skenario regresi ini">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        </div>

        <!-- Natural Language Prompt Editor -->
        <div class="mb-2">
            <label class="form-label-custom" for="testCaseInput">
                Instruksi Skenario (Bahasa Natural)
                <span class="text-muted fw-normal float-end font-monospace" id="charCounter">0 kata</span>
            </label>
            <div class="prompt-container">
                <textarea id="testCaseInput" class="prompt-textarea-custom" placeholder="Contoh: Login sebagai user test. Buka menu SPM Aspal. Cari customer PT. Jaya Konstruksi Manggala Pratama jobsite Lampung. Buat pesanan 18000 kg. Simpan transaksi. Pastikan transaksi berhasil tersimpan."></textarea>
                <div class="prompt-footer-bar">
                    <div class="d-flex align-items-center gap-1 flex-wrap">
                        <span class="me-1">Contoh:</span>
                        <button type="button" class="quick-chip qa-quick-insert-btn" data-template="login_aspal">SPM Aspal</button>
                        <button type="button" class="quick-chip qa-quick-insert-btn" data-template="search_filter">Cari & Filter</button>
                        <button type="button" class="quick-chip qa-quick-insert-btn" data-template="crud_create">Input Form Baru</button>
                    </div>
                    <span class="d-none d-md-inline text-muted">Ctrl + Enter</span>
                </div>
            </div>
        </div>

        <!-- Action Button Bar -->
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 pt-2">
            <button id="btnGenerate" class="btn-brand-dark">
                <i class="bi bi-stars text-warning"></i> Generate Test Plan
            </button>
            <button id="btnSaveCase" class="btn btn-outline-secondary btn-sm px-3 py-2 fw-medium" disabled>
                <i class="bi bi-bookmark-plus me-1"></i> Simpan Skenario
            </button>
        </div>

    </div>

    <!-- Guardrail Summary Footer -->
    <div class="studio-card-footer bg-light px-3 py-2 border-top">
        <div class="d-flex align-items-center gap-2 text-muted" style="font-size: 0.76rem;">
            <i class="bi bi-shield-check text-primary fs-6"></i>
            <div>
                <strong class="text-dark">Backend Guardrail:</strong> Output AI divalidasi. Aksi di luar whitelist (<code class="text-dark bg-white px-1 rounded border">goto, click, fill, select, search, assert_*</code>) ditolak otomatis.
            </div>
        </div>
    </div>
</div>
