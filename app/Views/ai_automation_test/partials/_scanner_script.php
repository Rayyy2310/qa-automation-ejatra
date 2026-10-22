<script>
let allScannedPages = [];
let activeScannedPage = null;
let activeScannedPageUrl = null;

// ─── Open Scan Explorer Modal ───
async function openScanExplorer() {
    const modalEl = document.getElementById('modalScanExplorer');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    await loadScannedPages();
}

async function loadScannedPages() {
    try {
        const resp = await fetch('<?= base_url("ai-automation-test/scan-pages") ?>');
        const data = await resp.json();

        if (data.success && data.pages && data.pages.length > 0) {
            allScannedPages = data.pages;
            document.getElementById('scanPagesCount').textContent = data.pages.length;
            const meta = data.scan_info;
            document.getElementById('modalScanMeta').textContent = `${data.pages.length} Halaman Terpetakan · ${meta.total_elements || 0} Elemen · Target: ${meta.base_url || '-'}`;

            renderScanPagesList(allScannedPages);
            selectScanPage(allScannedPages[0].menu_path, allScannedPages[0].page_url, allScannedPages[0].element_count);
        } else {
            document.getElementById('scanPagesList').innerHTML = `
                <div class="text-center py-4 text-muted small">
                    <i class="bi bi-exclamation-circle text-warning fs-4 d-block mb-1"></i>
                    Belum ada data scan.<br>
                    <button class="btn btn-sm btn-primary mt-2" onclick="triggerScanFull()">Mulai Full Scan Sekarang</button>
                </div>
            `;
        }
    } catch (e) {
        document.getElementById('scanPagesList').innerHTML = `<div class="text-center py-4 text-danger small">Gagal memuat data: ${e.message}</div>`;
    }
}

function renderScanPagesList(pages) {
    const container = document.getElementById('scanPagesList');
    if (!pages || pages.length === 0) {
        container.innerHTML = '<div class="text-center py-4 text-muted small">Tidak ada halaman yang cocok.</div>';
        return;
    }

    container.innerHTML = pages.map(p => `
        <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-2 px-3 page-item-btn ${activeScannedPage === p.menu_path ? 'active' : ''}" onclick="selectScanPage('${escapeHtml(p.menu_path)}', '${escapeHtml(p.page_url)}', ${p.element_count})">
            <div class="text-truncate me-2 text-start">
                <div class="fw-semibold text-truncate" style="font-size: 0.82rem;">${escapeHtml(p.menu_path)}</div>
                <div class="small opacity-75 text-truncate" style="font-size: 0.7rem;">${escapeHtml(p.page_url)}</div>
            </div>
            <span class="badge ${activeScannedPage === p.menu_path ? 'bg-white text-primary' : 'bg-light text-dark border'} rounded-pill">${p.element_count}</span>
        </button>
    `).join('');
}

function filterScanPages() {
    const q = document.getElementById('scanPageSearch').value.toLowerCase().trim();
    if (!q) {
        renderScanPagesList(allScannedPages);
        return;
    }
    const filtered = allScannedPages.filter(p => 
        p.menu_path.toLowerCase().includes(q) || 
        p.page_url.toLowerCase().includes(q)
    );
    renderScanPagesList(filtered);
}

async function selectScanPage(menuPath, pageUrl, elementCount) {
    activeScannedPage = menuPath;
    activeScannedPageUrl = pageUrl;
    document.getElementById('scanDetailTitle').textContent = menuPath;
    document.getElementById('scanDetailUrl').textContent = pageUrl;
    const badge = document.getElementById('scanDetailBadge');
    badge.textContent = `${elementCount} Elemen`;
    badge.style.display = 'inline-block';

    const btnCurrent = document.getElementById('btnScanCurrentPage');
    if (btnCurrent) {
        btnCurrent.classList.remove('d-none');
        btnCurrent.classList.add('d-inline-flex');
        const shortName = menuPath.includes('>') ? menuPath.split('>').pop().trim() : menuPath;
        btnCurrent.innerHTML = `<i class="bi bi-lightning-charge-fill me-1"></i> Scan ${escapeHtml(shortName)} (~15s)`;
    }

    document.querySelectorAll('.page-item-btn').forEach(btn => {
        if (btn.querySelector('.fw-semibold')?.textContent === menuPath) {
            btn.classList.add('active');
            btn.querySelector('.badge')?.classList.replace('bg-light', 'bg-white');
            btn.querySelector('.badge')?.classList.replace('text-dark', 'text-primary');
        } else {
            btn.classList.remove('active');
            btn.querySelector('.badge')?.classList.replace('bg-white', 'bg-light');
            btn.querySelector('.badge')?.classList.replace('text-primary', 'text-dark');
        }
    });

    const tbody = document.getElementById('scanElementsBody');
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-muted small"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Memuat elemen halaman...</td></tr>`;

    try {
        const resp = await fetch(`<?= base_url("ai-automation-test/scan-page-elements") ?>?menu_path=${encodeURIComponent(menuPath)}`);
        const data = await resp.json();

        if (data.success && data.elements && data.elements.length > 0) {
            tbody.innerHTML = data.elements.map(el => {
                let badgeClass = 'bg-secondary';
                let icon = 'bi-code-square';
                if (el.element_category === 'input') { badgeClass = 'bg-primary'; icon = 'bi-input-cursor-text'; }
                else if (el.element_category === 'dropdown') { badgeClass = el.widget_type === 'select2' ? 'bg-warning text-dark' : 'bg-info text-white'; icon = 'bi-menu-button-wide'; }
                else if (el.element_category === 'button') { badgeClass = 'bg-success'; icon = 'bi-hand-index-thumb'; }
                else if (el.element_category === 'table') { badgeClass = 'bg-danger'; icon = 'bi-table'; }
                else if (el.element_category === 'heading') { badgeClass = 'bg-dark'; icon = 'bi-type-h1'; }

                const nameOrLabel = el.label_text || el.button_text || el.element_name || el.element_id || '(Tanpa Label)';
                const widgetBadge = el.widget_type !== 'native' ? `<span class="badge bg-dark rounded-pill ms-1" style="font-size:0.65rem;">${el.widget_type.toUpperCase()}</span>` : '';
                const selector = el.css_selector || (el.element_id ? `#${el.element_id}` : (el.element_name ? `[name="${el.element_name}"]` : '-'));
                const extra = el.placeholder ? `<span class="text-muted fst-italic">Placeholder: "${escapeHtml(el.placeholder)}"</span>` : 
                             (el.table_headers ? `<span class="text-muted small">Kolom: ${escapeHtml(el.table_headers)}</span>` : 
                             (el.options_sample ? `<span class="text-muted small">Opsi: ${escapeHtml(el.options_sample)}</span>` : '-'));

                return `
                    <tr>
                        <td>
                            <span class="badge ${badgeClass} p-1" title="${el.element_category}">
                                <i class="bi ${icon}"></i>
                            </span>
                        </td>
                        <td>
                            <div class="fw-semibold text-dark text-truncate" style="max-width: 260px;" title="${escapeHtml(nameOrLabel)}">${escapeHtml(nameOrLabel)}</div>
                            ${el.element_name ? `<small class="text-muted font-monospace" style="font-size:0.7rem;">name="${escapeHtml(el.element_name)}"</small>` : ''}
                        </td>
                        <td>
                            <code class="text-primary fw-bold" style="font-size:0.75rem;">${escapeHtml(selector)}</code>
                            ${widgetBadge}
                        </td>
                        <td>
                            <div class="text-truncate" style="max-width: 240px;" title="${escapeHtml(extra)}">${extra}</div>
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-muted small">Tidak ada elemen terdeteksi di halaman ini.</td></tr>`;
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-danger small">Gagal memuat elemen: ${err.message}</td></tr>`;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Page Scanner Functions ───
function triggerScanFull() {
    triggerPageScan(true, 'full');
}

function triggerScanCurrentPage() {
    if (!activeScannedPageUrl && !activeScannedPage) {
        if (typeof QAUtils !== 'undefined' && QAUtils.toast) {
            QAUtils.toast({ icon: 'warning', title: 'Pilih Halaman', text: 'Silakan pilih salah satu halaman dari daftar terlebih dahulu.' });
        }
        return;
    }
    triggerPageScan(true, activeScannedPageUrl || activeScannedPage);
}

async function triggerPageScan(force = false, customTarget = null) {
    const btn = document.getElementById('btnScanPages');
    const statusText = document.getElementById('scanStatusText');
    const icon = document.getElementById('scanIcon');
    const targetUrl = customTarget !== null 
        ? customTarget 
        : (document.getElementById('targetUrlInput')?.value || document.getElementById('targetUrl')?.value || 'full');

    if (!force && statusText.textContent.includes('hal')) {
        openScanExplorer();
        return;
    }
    
    if (btn) btn.disabled = true;
    const isFull = (targetUrl === 'full' || targetUrl === 'all' || targetUrl === 'http://192.168.15.69:8080/');
    if (statusText) statusText.textContent = isFull ? 'Full Scan...' : 'Scanning 1 Hal...';
    if (icon) icon.className = 'bi bi-arrow-repeat spin-icon';
    
    // Close modal if open so user sees progress or keep user informed
    try {
        const resp = await fetch('<?= base_url("ai-automation-test/scan") ?>', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_url: targetUrl })
        });
        const data = await resp.json();
        
        if (data.success) {
            if (statusText) statusText.textContent = isFull ? 'Full Scan...' : 'Scan 1 Hal...';
            pollScanStatus();
        } else {
            if (statusText) statusText.textContent = data.error || 'Gagal';
            if (icon) icon.className = 'bi bi-x-circle text-danger';
            if (btn) btn.disabled = false;
        }
    } catch (err) {
        if (statusText) statusText.textContent = 'Error';
        if (icon) icon.className = 'bi bi-x-circle text-danger';
        if (btn) btn.disabled = false;
    }
}

function pollScanStatus() {
    const interval = setInterval(async () => {
        try {
            const resp = await fetch('<?= base_url("ai-automation-test/scan-status") ?>');
            const data = await resp.json();
            
            if (!data.has_scan) return;
            
            const scan = data.scan;
            const statusText = document.getElementById('scanStatusText');
            const icon = document.getElementById('scanIcon');
            const btn = document.getElementById('btnScanPages');
            
            if (scan.scan_status === 'completed') {
                clearInterval(interval);
                statusText.textContent = `${scan.total_pages} hal · ${scan.total_elements} el`;
                icon.className = 'bi bi-check-circle-fill text-success';
                btn.disabled = false;
                btn.title = `Klik untuk melihat detail ${scan.total_pages} halaman (${scan.total_elements} elemen terdeteksi)`;
                btn.onclick = () => openScanExplorer();
            } else if (scan.scan_status === 'failed') {
                clearInterval(interval);
                btn.disabled = false;
                if (data.latest_completed) {
                    statusText.textContent = `${data.latest_completed.total_pages} hal · ${data.latest_completed.total_elements} el`;
                    icon.className = 'bi bi-check-circle-fill text-success';
                    btn.onclick = () => openScanExplorer();
                    btn.title = `Scan baru terhenti, data tersimpan sebelumnya (${data.latest_completed.total_pages} halaman) aktif. Klik untuk melihat detail.`;
                } else {
                    statusText.textContent = 'Scan Ulang';
                    icon.className = 'bi bi-arrow-clockwise text-warning';
                    btn.onclick = () => triggerPageScan(true);
                }
            }
        } catch (e) {
            clearInterval(interval);
            const btn = document.getElementById('btnScanPages');
            if (btn) btn.disabled = false;
        }
    }, 2000);
}

// Check scan status on page load
(async function() {
    try {
        const resp = await fetch('<?= base_url("ai-automation-test/scan-status") ?>');
        const data = await resp.json();
        const btn = document.getElementById('btnScanPages');
        if (!btn) return;
        
        if (data.has_scan && data.scan.scan_status === 'running') {
            document.getElementById('scanStatusText').textContent = 'Scanning...';
            document.getElementById('scanIcon').className = 'bi bi-arrow-repeat spin-icon';
            btn.disabled = true;
            pollScanStatus();
        } else if (data.latest_completed || (data.has_scan && data.scan.scan_status === 'completed')) {
            const comp = (data.has_scan && data.scan.scan_status === 'completed') ? data.scan : data.latest_completed;
            document.getElementById('scanStatusText').textContent = `${comp.total_pages} hal · ${comp.total_elements} el`;
            document.getElementById('scanIcon').className = 'bi bi-check-circle-fill text-success';
            btn.disabled = false;
            btn.title = `Klik untuk melihat detail ${comp.total_pages} halaman (${comp.total_elements} elemen terdeteksi)`;
            btn.onclick = () => openScanExplorer();
        } else if (data.has_scan && data.scan.scan_status === 'failed') {
            document.getElementById('scanStatusText').textContent = 'Scan Ulang';
            document.getElementById('scanIcon').className = 'bi bi-arrow-clockwise text-warning';
            btn.disabled = false;
            btn.onclick = () => triggerPageScan(true);
        }
    } catch (e) {}
})();
</script>
<style>
.spin-icon { animation: spin 1s linear infinite; } 
@keyframes spin { to { transform: rotate(360deg); } }
.list-group-item.active { background-color: #0d6efd !important; border-color: #0d6efd !important; color: #fff !important; }
</style>
