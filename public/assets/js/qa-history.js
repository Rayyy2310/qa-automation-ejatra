/**
 * qa-history.js — History Section Handler for AI Automation Testing Studio
 *
 * Depends on: QAUtils (qa-utils.js) and global BASE_URL set by the PHP view.
 * Must be loaded AFTER qa-utils.js, BEFORE qa-studio.js.
 *
 * Responsibilities:
 *  - Render & filter the history runs table
 *  - Open the run-detail modal and load step details via AJAX
 *  - Delete a history run record
 *  - Handle screenshot & DOM snapshot preview modals
 *  - Route all click events via a single document-level delegate
 */

'use strict';

/* global BASE_URL, bootstrap, QAUtils */

const QAHistory = (() => {
    const { escapeHtml, getStatusBadge, getActionBadge, getCsrfHeaders, toast, alert: showAlert, confirm: showConfirm } = QAUtils;

    // ── Filter ──────────────────────────────────────────────────────────────
    function filterHistoryTable(status) {
        document.querySelectorAll('.filter-history-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-status') === status);
        });
        document.querySelectorAll('#historyTableBody tr').forEach(tr => {
            const rowStatus = tr.getAttribute('data-status');
            if (!rowStatus) return;
            tr.style.display = (status === 'ALL' || rowStatus === status) ? '' : 'none';
        });
    }

    // ── Refresh ─────────────────────────────────────────────────────────────
    function refreshHistoryTable() {
        fetch(`${BASE_URL}ai-automation-test/history`, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
        })
        .then(r => r.json())
        .then(data => {
            if (data.success && data.history) renderHistoryRows(data.history);
        })
        .catch(err => console.error('History refresh error:', err));
    }

    // ── Render Rows ─────────────────────────────────────────────────────────
    function renderHistoryRows(runs) {
        const tbody = document.getElementById('historyTableBody');
        if (!tbody) return;
        if (!runs || runs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4"><i class="bi bi-inbox fs-3 d-block mb-1 text-secondary opacity-50"></i>Belum ada riwayat pengujian.</td></tr>';
            return;
        }
        tbody.innerHTML = runs.map(run => buildHistoryRow(run)).join('');
    }

    function buildHistoryRow(run) {
        const statusUpper = (run.status || 'PENDING').toUpperCase();
        const dateStr     = run.created_at ? new Date(run.created_at).toLocaleString('id-ID') : '-';
        return `
        <tr data-status="${statusUpper}" id="historyRow-${run.id}">
            <td class="ps-3 fw-bold text-secondary">#${run.id}</td>
            <td>
                <div class="fw-bold text-dark mb-0">${escapeHtml(run.test_case_name || run.module_name || 'Pengujian Studio')}</div>
                <small class="text-muted"><i class="bi bi-grid me-1"></i>${escapeHtml(run.module_name || 'General')}</small>
            </td>
            <td><small class="text-dark d-block">${dateStr}</small></td>
            <td><span class="badge bg-light text-dark border font-monospace small">${escapeHtml(run.mode || 'read_only')}</span></td>
            <td><small class="text-secondary font-monospace">${escapeHtml(run.llm_provider || 'groq')}</small></td>
            <td class="text-center"><span class="badge bg-light text-dark border fw-normal"><span class="text-success fw-bold">${run.passed_steps || 0}</span> / ${run.total_steps || 0}</span></td>
            <td class="text-end"><small class="font-monospace text-muted">${(run.total_duration_ms || 0).toLocaleString()} ms</small></td>
            <td class="text-center">${getStatusBadge(statusUpper, 'badge')}</td>
            <td class="text-end pe-3">
                <button type="button" class="btn btn-sm btn-outline-primary py-0 px-2 me-1 js-open-run-detail" data-run-id="${run.id}" title="Lihat Detail &amp; Artefak"><i class="bi bi-eye"></i> Detail</button>
                <button type="button" class="btn btn-sm btn-outline-danger py-0 px-2 js-delete-run" data-run-id="${run.id}" title="Hapus Riwayat"><i class="bi bi-trash"></i></button>
            </td>
        </tr>`;
    }

    // ── Detail Modal ─────────────────────────────────────────────────────────
    function openRunDetailModal(runId) {
        const modalEl = document.getElementById('runDetailModal');
        if (!modalEl) return;
        const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);

        const runIdText = document.getElementById('detailRunIdText');
        if (runIdText) runIdText.textContent = runId;

        const exportBtn = document.getElementById('btnExportRunJson');
        if (exportBtn) exportBtn.href = `${BASE_URL}ai-automation-test/export-json/${runId}`;

        const tableBody = document.getElementById('detailModalTableBody');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted"><span class="spinner-border spinner-border-sm me-2"></span> Memuat detail pengujian...</td></tr>';
        }
        modal.show();

        fetch(`${BASE_URL}ai-automation-test/detail/${runId}`, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
        })
        .then(r => r.json())
        .then(data => renderDetailModal(data, tableBody))
        .catch(err => {
            console.error('Detail fetch error:', err);
            if (tableBody) {
                tableBody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-danger">Terjadi kesalahan server saat memuat detail.</td></tr>';
            }
        });
    }

    function renderDetailModal(data, tableBody) {
        if (!data.success || !data.data) {
            if (tableBody) {
                tableBody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-danger">Gagal memuat detail pengujian.</td></tr>';
            }
            return;
        }

        const detail      = data.data;
        const statusUpper = (detail.status || 'PENDING').toUpperCase();

        const statusPill = document.getElementById('detailModalStatusPill');
        if (statusPill) {
            statusPill.innerHTML = `<span class="badge ${statusUpper === 'PASSED' ? 'bg-success' : 'bg-danger'}">${statusUpper}</span>`;
        }

        const durEl = document.getElementById('detailModalDuration');
        if (durEl) durEl.textContent = `${(detail.duration_ms || 0).toLocaleString()} ms`;

        const sumEl = document.getElementById('detailModalSummary');
        if (sumEl) sumEl.textContent = `${detail.passed || 0} Lolos / ${detail.failed || 0} Gagal`;

        const engEl = document.getElementById('detailModalEngine');
        if (engEl) engEl.textContent = `${detail.mode || 'read_only'} / ${detail.llm_provider || 'groq'}`;

        const steps = detail.steps || [];
        if (!tableBody) return;

        if (steps.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">Tidak ada rincian langkah.</td></tr>';
            return;
        }

        tableBody.innerHTML = steps.map((st, idx) => buildDetailStepRow(st, idx)).join('');
    }

    function buildDetailStepRow(st, idx) {
        const stBadge   = getStatusBadge(st.result || 'PASS', 'badge');
        const errLog    = st.error
            ? `<div class="small text-danger text-truncate" style="max-width:220px;" title="${escapeHtml(st.error)}">${escapeHtml(st.error)}</div>`
            : '-';
        const filename  = st.screenshot ? st.screenshot.split(/[\\\/]/).pop() : null;
        const assetBtns = filename
            ? `<button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 view-screenshot" data-src="${BASE_URL}ai-automation-test/screenshot/${encodeURIComponent(filename)}"><i class="bi bi-camera"></i> Screen</button>`
            : '-';

        return `
        <tr>
            <td class="ps-3 fw-bold text-secondary">${st.step_no || (idx + 1)}</td>
            <td><span class="badge bg-light text-dark border font-monospace">${escapeHtml(st.action || '-')}</span></td>
            <td><small class="text-dark">${escapeHtml(st.target_json || st.target || '-')}</small></td>
            <td>${stBadge}</td>
            <td><small class="font-monospace">${st.duration_ms || 0} ms</small></td>
            <td class="text-center">${st.retry_count || 0}</td>
            <td>${errLog}</td>
            <td class="text-end pe-3">${assetBtns}</td>
        </tr>`;
    }

    // ── Delete Run ───────────────────────────────────────────────────────────
    function deleteHistoryRun(runId) {
        showConfirm({
            title: `Hapus Riwayat #${runId}?`,
            subtitle: 'Riwayat Eksekusi Pengujian',
            variant: 'danger',
            icon: 'bi-trash3-fill',
            text: `Apakah Anda yakin ingin menghapus riwayat pengujian #${runId} beserta log langkahnya?`,
            confirmHtml: '<i class="bi bi-trash3 me-1"></i> Ya, Hapus Riwayat'
        }).then(result => {
            if (!result.isConfirmed) return;
            const headers = Object.assign({ 'X-Requested-With': 'XMLHttpRequest' }, getCsrfHeaders());

            fetch(`${BASE_URL}ai-automation-test/delete-run/${runId}`, { method: 'POST', headers })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    const row = document.getElementById(`historyRow-${runId}`);
                    if (row) row.remove();
                    toast({ icon: 'success', title: 'Riwayat Dihapus', text: `Riwayat pengujian #${runId} telah dihapus.` });
                } else {
                    showAlert({ variant: 'danger', icon: 'bi-x-circle-fill', title: 'Gagal Menghapus', text: data.error || 'Terjadi kesalahan.' });
                }
            })
            .catch(err => {
                console.error('Delete run error:', err);
                showAlert({ variant: 'danger', icon: 'bi-wifi-off', title: 'Kesalahan Jaringan', text: 'Gagal menghapus riwayat pengujian.' });
            });
        });
    }

    // ── Screenshot Modal Helper ──────────────────────────────────────────────
    function openScreenshotModal(src) {
        const modalEl = document.getElementById('screenshotModal');
        if (!modalEl) return;
        const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        const imgEl = document.getElementById('screenshotImg');
        const dlBtn = document.getElementById('screenshotDownloadBtn');
        if (imgEl) imgEl.src = src;
        if (dlBtn) dlBtn.href = src;
        modal.show();
    }

    // ── DOM Snapshot Modal Helper ────────────────────────────────────────────
    function openDomModal(domText) {
        const domModalEl = document.getElementById('domModal');
        if (!domModalEl) return;
        const modal      = bootstrap.Modal.getInstance(domModalEl) || new bootstrap.Modal(domModalEl);
        const domContent = document.getElementById('domContent');
        if (domContent) domContent.textContent = domText || 'DOM snapshot tidak tersedia.';
        modal.show();
    }

    // ── Unified Event Delegation ─────────────────────────────────────────────
    document.addEventListener('click', function (e) {
        const detailBtn = e.target.closest('.js-open-run-detail');
        if (detailBtn) {
            e.preventDefault();
            openRunDetailModal(detailBtn.getAttribute('data-run-id'));
            return;
        }

        const deleteBtn = e.target.closest('.js-delete-run');
        if (deleteBtn) {
            e.preventDefault();
            deleteHistoryRun(deleteBtn.getAttribute('data-run-id'));
            return;
        }

        const filterBtn = e.target.closest('.filter-history-btn');
        if (filterBtn) {
            filterHistoryTable(filterBtn.getAttribute('data-status') || 'ALL');
            return;
        }

        const refreshBtn = e.target.closest('#btnRefreshHistory');
        if (refreshBtn) {
            refreshHistoryTable();
            return;
        }

        const screenshotBtn = e.target.closest('.view-screenshot');
        if (screenshotBtn) {
            e.preventDefault();
            const src = screenshotBtn.getAttribute('data-src');
            if (src) openScreenshotModal(src);
            return;
        }

        const domBtn = e.target.closest('.view-dom');
        if (domBtn) {
            e.preventDefault();
            openDomModal(domBtn.getAttribute('data-dom'));
        }
    });

    // ── Window Shims (backward-compat) ──────────────────────────────────────
    window.openRunDetailModal  = openRunDetailModal;
    window.deleteHistoryRun    = deleteHistoryRun;
    window.filterHistoryTable  = filterHistoryTable;
    window.refreshHistoryTable = refreshHistoryTable;

    return { filterHistoryTable, refreshHistoryTable, renderHistoryRows, openRunDetailModal, deleteHistoryRun };
})();
