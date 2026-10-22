<!-- Modal: Knowledge Base & Page Scan Explorer -->
<div class="modal fade" id="modalScanExplorer" tabindex="-1" aria-labelledby="modalScanExplorerLabel" aria-hidden="true">
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content shadow-lg border-0">
            <div class="modal-header bg-dark text-white py-3">
                <div class="d-flex align-items-center gap-2">
                    <i class="bi bi-diagram-3-fill text-info fs-5"></i>
                    <div>
                        <h6 class="modal-title fw-bold mb-0" id="modalScanExplorerLabel">Peta Pengetahuan UI e-Jatra (Hasil Auto-Scan Playwright)</h6>
                        <small class="text-white-50" id="modalScanMeta">Memuat data scan...</small>
                    </div>
                </div>
                <div class="d-flex align-items-center gap-2">
                    <div class="dropdown">
                        <button class="btn btn-sm btn-outline-light dropdown-toggle d-flex align-items-center gap-1" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                            <i class="bi bi-arrow-repeat"></i> Scan UI
                        </button>
                        <ul class="dropdown-menu dropdown-menu-end shadow">
                            <li>
                                <a class="dropdown-item py-2" href="javascript:void(0)" onclick="triggerScanFull()">
                                    <i class="bi bi-globe me-2 text-primary"></i>
                                    <strong>Scan Seluruh Website</strong>
                                    <div class="text-muted small ps-4">Scan lengkap seluruh 51 halaman e-Jatra (~60-90s)</div>
                                </a>
                            </li>
                            <li><hr class="dropdown-divider my-1"></li>
                            <li>
                                <a class="dropdown-item py-2" href="javascript:void(0)" onclick="triggerScanCurrentPage()">
                                    <i class="bi bi-file-earmark-code me-2 text-success"></i>
                                    <strong>Scan Halaman Terpilih Saja</strong>
                                    <div class="text-muted small ps-4">Scan cepat halaman aktif & merge data (~15-20s)</div>
                                </a>
                            </li>
                        </ul>
                    </div>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
            </div>
            <div class="modal-body p-0">
                <div class="row g-0" style="min-height: 520px;">
                    <!-- Left Column: Pages List -->
                    <div class="col-md-4 border-end bg-light p-3">
                        <div class="mb-3">
                            <div class="input-group input-group-sm">
                                <span class="input-group-text bg-white border-end-0"><i class="bi bi-search text-muted"></i></span>
                                <input type="text" id="scanPageSearch" class="form-control border-start-0" placeholder="Cari halaman (contoh: SPM, PO, Rekening)..." oninput="filterScanPages()">
                            </div>
                        </div>
                        <div class="text-muted small fw-bold text-uppercase mb-2" style="font-size: 0.72rem;">
                            Daftar Halaman (<span id="scanPagesCount">0</span> Halaman)
                        </div>
                        <div class="list-group list-group-flush rounded-3 border bg-white overflow-auto" id="scanPagesList" style="max-height: 440px;">
                            <div class="text-center py-4 text-muted small">Memuat daftar halaman...</div>
                        </div>
                    </div>

                    <!-- Right Column: Elements Detail -->
                    <div class="col-md-8 p-3 d-flex flex-column">
                        <div class="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom">
                            <div>
                                <h6 class="fw-bold text-dark mb-0" id="scanDetailTitle">Pilih halaman di sebelah kiri</h6>
                                <small class="text-muted font-monospace" id="scanDetailUrl">-</small>
                            </div>
                            <div class="d-flex align-items-center gap-2">
                                <button type="button" id="btnScanCurrentPage" class="btn btn-sm btn-outline-success d-none align-items-center gap-1" onclick="triggerScanCurrentPage()" title="Scan cepat dan perbarui elemen untuk halaman ini saja">
                                    <i class="bi bi-lightning-charge-fill"></i> Scan Halaman Ini (~15s)
                                </button>
                                <span class="badge bg-primary rounded-pill px-3 py-2" id="scanDetailBadge" style="display: none;">0 Elemen</span>
                            </div>
                        </div>
                        <div class="table-responsive flex-grow-1 overflow-auto" style="max-height: 440px;">
                            <table class="table table-sm table-hover align-middle mb-0" style="font-size: 0.8rem;">
                                <thead class="table-light sticky-top">
                                    <tr>
                                        <th style="width: 35px;">Tipe</th>
                                        <th>Nama / Label</th>
                                        <th>Widget / Selector</th>
                                        <th>Placeholder / Header</th>
                                    </tr>
                                </thead>
                                <tbody id="scanElementsBody">
                                    <tr>
                                        <td colspan="4" class="text-center text-muted py-5">
                                            <i class="bi bi-arrow-left-circle fs-3 d-block mb-2 text-secondary opacity-50"></i>
                                            Pilih salah satu halaman di panel kiri untuk melihat seluruh elemen UI yang terdeteksi.
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-footer bg-light py-2 px-3 justify-content-between">
                <small class="text-muted">
                    <i class="bi bi-info-circle text-primary"></i> Data di atas otomatis dijadikan acuan (ground-truth) bagi LLM untuk menyusun selector Playwright yang 100% akurat.
                </small>
                <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">Tutup</button>
            </div>
        </div>
    </div>
</div>
