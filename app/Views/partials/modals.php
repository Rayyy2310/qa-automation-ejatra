<!-- Screenshot Modal Lightbox -->
<div class="modal fade qa-glass-modal" id="screenshotModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-xl modal-dialog-centered">
        <div class="modal-content rounded-4 border-0 shadow-lg">
            <div class="modal-header border-bottom py-3 px-4">
                <h6 class="modal-title fw-bold text-dark d-flex align-items-center gap-2 mb-0">
                    <span class="qa-modal-icon-badge qa-modal-icon-primary"><i class="bi bi-camera"></i></span>
                    <span>Snapshot Tangkapan Layar Kegagalan</span>
                </h6>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body text-center p-3">
                <div class="bg-light rounded-3 p-2 overflow-auto border" style="max-height: 75vh;">
                    <img id="screenshotImg" src="" class="img-fluid rounded" alt="Failure Screenshot" />
                </div>
            </div>
            <div class="modal-footer border-top py-2 px-4 d-flex justify-content-between align-items-center">
                <span class="text-muted small"><i class="bi bi-shield-check text-primary me-1"></i>Captured by Playwright Service</span>
                <a id="screenshotDownloadBtn" href="" target="_blank" class="btn btn-sm btn-outline-secondary" download>
                    <i class="bi bi-download me-1"></i> Buka Gambar Penuh
                </a>
            </div>
        </div>
    </div>
</div>

<!-- DOM Snapshot Inspector Modal -->
<div class="modal fade qa-glass-modal" id="domModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content rounded-4 border-0 shadow-lg">
            <div class="modal-header border-bottom py-3 px-4">
                <h6 class="modal-title fw-bold text-dark d-flex align-items-center gap-2 mb-0">
                    <span class="qa-modal-icon-badge qa-modal-icon-primary"><i class="bi bi-code-square"></i></span>
                    <span>DOM Snapshot Inspector</span>
                </h6>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body p-4">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <span class="text-secondary small">Struktur HTML elemen saat pengujian berlangsung:</span>
                    <button type="button" id="btnCopyDom" class="btn btn-sm btn-outline-secondary py-1 px-2">
                        <i class="bi bi-clipboard me-1"></i> Salin HTML
                    </button>
                </div>
                <pre id="domContent" class="code-pre-box mb-0"></pre>
            </div>
            <div class="modal-footer border-top py-2 px-4">
                <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">Tutup</button>
            </div>
        </div>
    </div>
</div>

<!-- Universal High-Fidelity Studio Dialog Modal (Fallback & Custom Form Dialog) -->
<div class="modal fade qa-glass-modal" id="qaStudioDialogModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered" style="max-width: 440px;">
        <div class="modal-content qa-dialog-card border-0">
            <div class="modal-header border-0 pt-4 px-4 pb-2 d-flex align-items-start justify-content-between">
                <div class="d-flex align-items-center gap-3">
                    <div id="qaDialogIconWrap" class="qa-modal-icon-badge qa-modal-icon-primary">
                        <i id="qaDialogIcon" class="bi bi-layers-fill"></i>
                    </div>
                    <div>
                        <h6 class="modal-title fw-bold text-dark mb-0" id="qaDialogTitle" style="font-size: 1.02rem; letter-spacing: -0.015em;">Dialog Studio</h6>
                        <div class="text-secondary small" id="qaDialogSubtitle" style="font-size: 0.78rem;">AI Automation Testing Studio</div>
                    </div>
                </div>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body px-4 py-3">
                <div id="qaDialogBody" class="text-secondary" style="font-size: 0.86rem; line-height: 1.55;"></div>
                <div id="qaDialogError" class="qa-dialog-validation d-none mt-2">
                    <i class="bi bi-exclamation-circle-fill me-1"></i>
                    <span id="qaDialogErrorText"></span>
                </div>
            </div>
            <div class="modal-footer border-0 px-4 pb-4 pt-2 d-flex justify-content-end gap-2">
                <button type="button" id="qaDialogCancelBtn" class="btn qa-btn-modal-cancel" data-bs-dismiss="modal">Batal</button>
                <button type="button" id="qaDialogConfirmBtn" class="btn qa-btn-modal-confirm">Simpan</button>
            </div>
        </div>
    </div>
</div>

<!-- Floating Toast Notification Stack -->
<div id="qaStudioToastContainer" class="toast-container position-fixed top-0 end-0 p-3" style="z-index: 1095;"></div>
