<!-- Modal: Execution Run Detail & Artifact Inspector -->
<div class="modal fade" id="runDetailModal" tabindex="-1" aria-labelledby="runDetailModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content border-0 shadow-lg">
            <div class="modal-header bg-dark text-white py-3">
                <div class="d-flex align-items-center gap-2">
                    <i class="bi bi-file-earmark-medical fs-4 text-primary"></i>
                    <div>
                        <h5 class="modal-title fw-bold mb-0" id="runDetailModalLabel">Detail Eksekusi Pengujian #<span id="detailRunIdText">-</span></h5>
                        <small class="text-secondary" id="detailRunSubtitle">Laporan lengkap hasil pengujian Playwright dan screenshot</small>
                    </div>
                </div>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body p-4 bg-light">
                <!-- Overview Stats Bar -->
                <div class="row g-3 mb-4" id="detailOverviewStats">
                    <div class="col-md-3">
                        <div class="card border-0 shadow-sm p-3 rounded-3 text-center bg-white">
                            <span class="text-muted small">Status Eksekusi</span>
                            <div class="fw-bold fs-5 mt-1" id="detailModalStatusPill">-</div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card border-0 shadow-sm p-3 rounded-3 text-center bg-white">
                            <span class="text-muted small">Total Durasi</span>
                            <div class="fw-bold fs-5 text-dark mt-1" id="detailModalDuration">- ms</div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card border-0 shadow-sm p-3 rounded-3 text-center bg-white">
                            <span class="text-muted small">Ringkasan Langkah</span>
                            <div class="fw-bold fs-5 text-dark mt-1" id="detailModalSummary">-</div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card border-0 shadow-sm p-3 rounded-3 text-center bg-white">
                            <span class="text-muted small">Mode / Engine</span>
                            <div class="fw-bold fs-6 text-dark mt-1" id="detailModalEngine">-</div>
                        </div>
                    </div>
                </div>

                <!-- Steps Table -->
                <div class="card border-0 shadow-sm rounded-3">
                    <div class="card-header bg-white py-3 border-bottom d-flex justify-content-between align-items-center">
                        <h6 class="fw-bold mb-0 text-dark"><i class="bi bi-list-check me-2 text-primary"></i>Rincian Langkah Eksekusi</h6>
                        <a href="#" id="btnExportRunJson" class="btn btn-sm btn-outline-secondary" download>
                            <i class="bi bi-download me-1"></i> Export JSON
                        </a>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle mb-0">
                                <thead class="table-light">
                                    <tr>
                                        <th class="ps-3" style="width: 50px;">#</th>
                                        <th>Action</th>
                                        <th>Target Locator</th>
                                        <th>Status</th>
                                        <th>Durasi</th>
                                        <th class="text-center">Retry</th>
                                        <th>Error Log</th>
                                        <th class="text-end pe-3">Artefak</th>
                                    </tr>
                                </thead>
                                <tbody id="detailModalTableBody">
                                    <tr>
                                        <td colspan="8" class="text-center py-4 text-muted">
                                            <span class="spinner-border spinner-border-sm me-2"></span> Memuat detail pengujian...
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-footer bg-white py-2">
                <button type="button" class="btn btn-secondary px-4" data-bs-dismiss="modal">Tutup</button>
            </div>
        </div>
    </div>
</div>
