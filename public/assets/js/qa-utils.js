/**
 * qa-utils.js — Shared Utilities & High-Fidelity Dialog/Toast Engine
 *
 * Exported via QAUtils IIFE global.
 * Must be loaded FIRST, before qa-history.js and qa-studio.js.
 *
 * Provides:
 *  - escapeHtml(text)              : XSS-safe HTML entity encoder
 *  - getStatusBadge(status, type)  : Single source-of-truth status badge/pill renderer
 *  - getActionBadge(action)        : Semantic color-coded action badge renderer
 *  - getCsrfHeaders()              : CI4 CSRF-aware fetch headers builder
 *  - toast(opts)                   : Non-blocking floating glass toast notification
 *  - alert(opts)                   : High-fidelity alert modal (replaces window.alert)
 *  - confirm(opts)                 : High-fidelity confirmation modal (replaces window.confirm)
 *  - openFormModal(opts)           : High-fidelity form modal (replaces window.prompt)
 */

'use strict';

/* global bootstrap, Swal */

const QAUtils = (() => {

    /**
     * Escape special HTML characters to prevent XSS in innerHTML assignments.
     * @param {string|null} text
     * @returns {string}
     */
    function escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g,  '&amp;')
            .replace(/</g,  '&lt;')
            .replace(/>/g,  '&gt;')
            .replace(/"/g,  '&quot;')
            .replace(/'/g,  '&#039;');
    }

    /**
     * Single source of truth for all status display properties.
     * Used by both pill (live run table) and badge (history table / modal).
     */
    const STATUS_MAP = {
        PASSED:    { pillClass: 'status-pill-passed',  badgeCss: 'bg-success-subtle text-success border-success',       icon: 'bi-check-circle-fill', label: 'PASSED'    },
        PASS:      { pillClass: 'status-pill-passed',  badgeCss: 'bg-success-subtle text-success border-success',       icon: 'bi-check2',            label: 'PASS'      },
        FAILED:    { pillClass: 'status-pill-failed',  badgeCss: 'bg-danger-subtle text-danger border-danger',          icon: 'bi-x-circle-fill',     label: 'FAILED'    },
        FAIL:      { pillClass: 'status-pill-failed',  badgeCss: 'bg-danger-subtle text-danger border-danger',          icon: 'bi-x',                 label: 'FAIL'      },
        RUNNING:   { pillClass: 'status-pill-running', badgeCss: 'bg-warning-subtle text-warning border-warning',       icon: 'bi-arrow-repeat spin', label: 'RUNNING'   },
        QUEUED:    { pillClass: 'status-pill-muted',   badgeCss: 'bg-info-subtle text-info border-info',                icon: 'bi-hourglass-split',   label: 'QUEUED'    },
        CANCELLED: { pillClass: 'status-pill-muted',  badgeCss: 'bg-secondary-subtle text-secondary border-secondary', icon: 'bi-slash-circle',      label: 'CANCELLED' },
        SKIPPED:   { pillClass: 'status-pill-muted',  badgeCss: 'bg-secondary-subtle text-secondary border-secondary', icon: '',                     label: 'SKIPPED'   },
        PENDING:   { pillClass: 'status-pill-muted',  badgeCss: 'bg-secondary-subtle text-secondary border-secondary', icon: 'bi-clock',             label: 'PENDING'   },
    };

    /**
     * Render an HTML badge or pill for a given status string.
     * @param {string}         status
     * @param {'pill'|'badge'} type
     * @returns {string} HTML string
     */
    function getStatusBadge(status, type = 'pill') {
        const s   = (status || 'PENDING').toUpperCase();
        const cfg = STATUS_MAP[s] || STATUS_MAP.PENDING;

        if (type === 'badge') {
            const iconHtml = cfg.icon ? `<i class="bi ${cfg.icon} me-1"></i>` : '';
            return `<span class="badge border ${cfg.badgeCss} py-1 px-2">${iconHtml}${cfg.label}</span>`;
        }

        // pill — RUNNING gets a live spinner
        if (s === 'RUNNING') {
            return `<span class="status-pill status-pill-running"><span class="spinner-border spinner-border-sm me-1" style="width:0.7rem;height:0.7rem;"></span> RUNNING</span>`;
        }
        const iconHtml = cfg.icon ? `<i class="bi ${cfg.icon}"></i> ` : '';
        return `<span class="status-pill ${cfg.pillClass}">${iconHtml}${cfg.label}</span>`;
    }

    /**
     * Render a semantic color-coded action badge for Playwright steps.
     * @param {string} action
     * @returns {string}
     */
    function getActionBadge(action) {
        const raw = String(action || '-').trim();
        const lower = raw.toLowerCase();
        let variant = 'action-default';
        if (lower === 'goto' || lower === 'navigate') variant = 'action-goto';
        else if (lower === 'click') variant = 'action-click';
        else if (lower === 'fill' || lower === 'type') variant = 'action-fill';
        else if (lower === 'select') variant = 'action-select';
        else if (lower === 'search' || lower.includes('select2')) variant = 'action-search';
        else if (lower.startsWith('assert') || lower.includes('wait')) variant = 'action-assert';

        return `<span class="action-code-badge ${variant}">${escapeHtml(raw)}</span>`;
    }

    /**
     * Build fetch headers that include the CI4 CSRF token when present.
     * @returns {Object}
     */
    function getCsrfHeaders() {
        const tokenMeta  = document.querySelector('meta[name="csrf-token"]');
        const headerMeta = document.querySelector('meta[name="csrf-header"]');
        const headers    = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
        if (tokenMeta && headerMeta && tokenMeta.content) {
            headers[headerMeta.content] = tokenMeta.content;
        }
        return headers;
    }

    /**
     * Show a sleek floating glass toast notification.
     * @param {{ title?: string, text?: string, icon?: 'success'|'error'|'warning'|'info', duration?: number }} opts
     */
    function toast(opts = {}) {
        const type = opts.icon || 'success';
        const title = opts.title || (type === 'error' ? 'Gagal' : type === 'warning' ? 'Perhatian' : 'Berhasil');
        const text = opts.text || '';
        const duration = opts.duration || 2600;

        const container = document.getElementById('qaStudioToastContainer');
        if (!container) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: type,
                    title: title,
                    text: text,
                    showConfirmButton: false,
                    timer: duration,
                    customClass: { popup: 'qa-swal-toast' }
                });
            }
            return;
        }

        const iconMap = {
            success: { icon: 'bi-check-circle-fill', cls: 'qa-toast-success' },
            error:   { icon: 'bi-x-circle-fill',     cls: 'qa-toast-error'   },
            warning: { icon: 'bi-exclamation-triangle-fill', cls: 'qa-toast-warning' },
            info:    { icon: 'bi-info-circle-fill',  cls: 'qa-toast-info'    }
        };
        const cfg = iconMap[type] || iconMap.info;

        const el = document.createElement('div');
        el.className = `qa-glass-toast ${cfg.cls}`;
        el.innerHTML = `
            <div class="qa-toast-icon"><i class="bi ${cfg.icon}"></i></div>
            <div class="qa-toast-content">
                <div class="qa-toast-title">${escapeHtml(title)}</div>
                ${text ? `<div class="qa-toast-desc">${escapeHtml(text)}</div>` : ''}
            </div>
            <button type="button" class="btn-close qa-toast-close" aria-label="Close"></button>
        `;

        container.appendChild(el);
        requestAnimationFrame(() => el.classList.add('show'));

        const removeToast = () => {
            el.classList.remove('show');
            setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
        };

        const closeBtn = el.querySelector('.qa-toast-close');
        if (closeBtn) closeBtn.addEventListener('click', removeToast);
        setTimeout(removeToast, duration);
    }

    /**
     * Internal controller for #qaStudioDialogModal (High-Fidelity Bootstrap 5 Modal).
     * Ensures sequential modal transitions (waits for hidden.bs.modal before resolving or opening next dialog)
     * so chained dialogs (e.g., Form Modal -> Conflict Confirm Modal) never collide or auto-dismiss.
     */
    function openStudioDialog(config) {
        const modalEl    = document.getElementById('qaStudioDialogModal');
        const titleEl    = document.getElementById('qaDialogTitle');
        const subEl      = document.getElementById('qaDialogSubtitle');
        const bodyEl     = document.getElementById('qaDialogBody');
        const errWrap    = document.getElementById('qaDialogError');
        const errText    = document.getElementById('qaDialogErrorText');
        const iconWrap   = document.getElementById('qaDialogIconWrap');
        const iconEl     = document.getElementById('qaDialogIcon');
        const cancelBtn  = document.getElementById('qaDialogCancelBtn');
        const confirmBtn = document.getElementById('qaDialogConfirmBtn');

        if (!modalEl || typeof bootstrap === 'undefined') {
            return Promise.resolve({ isConfirmed: false, value: null });
        }

        const mountAndShow = () => new Promise((resolve) => {
            const variantMap = {
                primary: { badge: 'qa-modal-icon-primary', btn: 'qa-btn-modal-confirm', icon: config.icon || 'bi-layers-fill' },
                danger:  { badge: 'qa-modal-icon-danger',  btn: 'qa-btn-modal-danger',  icon: config.icon || 'bi-trash3-fill' },
                warning: { badge: 'qa-modal-icon-warning', btn: 'qa-btn-modal-warning', icon: config.icon || 'bi-exclamation-triangle-fill' },
                success: { badge: 'qa-modal-icon-success', btn: 'qa-btn-modal-confirm', icon: config.icon || 'bi-check-circle-fill' },
            };
            const v = variantMap[config.variant || 'primary'] || variantMap.primary;

            if (titleEl) titleEl.textContent = config.title || 'Konfirmasi';
            if (subEl)   subEl.textContent   = config.subtitle || 'AI Automation Testing Studio';
            if (bodyEl)  bodyEl.innerHTML    = config.bodyHtml || '';
            if (errWrap) errWrap.classList.add('d-none');
            if (errText) errText.textContent = '';

            if (iconWrap) iconWrap.className = `qa-modal-icon-badge ${v.badge}`;
            if (iconEl)   iconEl.className   = `bi ${v.icon}`;

            if (cancelBtn) {
                cancelBtn.textContent = config.cancelText || 'Batal';
                cancelBtn.classList.toggle('d-none', config.showCancel === false);
            }
            if (confirmBtn) {
                confirmBtn.className = `btn ${v.btn}`;
                confirmBtn.innerHTML = config.confirmHtml || escapeHtml(config.confirmText || 'OK');
            }

            const bsModal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl, { backdrop: 'static' });

            let confirmed = false;
            let finished  = false;
            let pendingResult = { isConfirmed: false, value: null };

            const showValidationError = (msg) => {
                if (errText) errText.textContent = msg;
                if (errWrap) errWrap.classList.remove('d-none');
            };

            const onHidden = () => {
                if (finished) return;
                finished = true;
                confirmBtn.removeEventListener('click', onConfirm);
                modalEl.removeEventListener('keydown', onKeyDown);
                modalEl.removeEventListener('hidden.bs.modal', onHidden);
                resolve(pendingResult);
            };

            const triggerHide = () => {
                if (bsModal._isTransitioning) {
                    modalEl.addEventListener('shown.bs.modal', () => bsModal.hide(), { once: true });
                } else {
                    bsModal.hide();
                }
                setTimeout(() => {
                    if (!finished) onHidden();
                }, 400);
            };

            const onConfirm = () => {
                if (confirmed) return;
                if (typeof config.preConfirm === 'function') {
                    const result = config.preConfirm(showValidationError);
                    if (result === false) return;
                    confirmed = true;
                    pendingResult = { isConfirmed: true, value: result };
                    triggerHide();
                } else {
                    confirmed = true;
                    pendingResult = { isConfirmed: true, value: true };
                    triggerHide();
                }
            };

            const onKeyDown = (e) => {
                if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') {
                    e.preventDefault();
                    onConfirm();
                }
            };

            confirmBtn.addEventListener('click', onConfirm);
            modalEl.addEventListener('keydown', onKeyDown);
            modalEl.addEventListener('hidden.bs.modal', onHidden);

            bsModal.show();

            setTimeout(() => {
                const firstInput = bodyEl ? bodyEl.querySelector('input, select, textarea') : null;
                if (firstInput) {
                    firstInput.focus();
                    if (typeof firstInput.select === 'function' && firstInput.value) {
                        firstInput.select();
                    }
                } else if (confirmBtn) {
                    confirmBtn.focus();
                }
            }, 180);
        });

        // If modal is currently visible or mid-transition, wait for it to finish hiding first
        const existingModal = bootstrap.Modal.getInstance(modalEl);
        if (modalEl.classList.contains('show') || (existingModal && existingModal._isTransitioning)) {
            return new Promise((resolve) => {
                let proceeded = false;
                const proceed = () => {
                    if (proceeded) return;
                    proceeded = true;
                    modalEl.removeEventListener('hidden.bs.modal', proceed);
                    mountAndShow().then(resolve);
                };
                modalEl.addEventListener('hidden.bs.modal', proceed, { once: true });
                if (existingModal && !existingModal._isTransitioning) {
                    existingModal.hide();
                }
                setTimeout(proceed, 400);
            });
        }

        return mountAndShow();
    }

    /**
     * High-Fidelity Alert Modal (replaces window.alert).
     */
    function alert(opts = {}) {
        const options = typeof opts === 'string' ? { text: opts } : opts;
        return openStudioDialog({
            title: options.title || 'Informasi Studio',
            subtitle: options.subtitle || 'Validasi & Sistem',
            variant: options.variant || 'warning',
            icon: options.icon || 'bi-info-circle-fill',
            bodyHtml: options.html || options.bodyHtml || `<p class="mb-0">${escapeHtml(options.text || '')}</p>`,
            showCancel: false,
            confirmText: options.confirmText || 'Mengerti',
        });
    }

    /**
     * High-Fidelity Confirmation Modal (replaces window.confirm).
     */
    function confirm(opts = {}) {
        return openStudioDialog({
            title: opts.title || 'Konfirmasi Tindakan',
            subtitle: opts.subtitle || 'Konfirmasi Eksekusi',
            variant: opts.variant || 'danger',
            icon: opts.icon || 'bi-exclamation-triangle-fill',
            bodyHtml: opts.html || opts.bodyHtml || `<p class="mb-0">${escapeHtml(opts.text || '')}</p>`,
            showCancel: true,
            cancelText: opts.cancelText || 'Batal',
            confirmHtml: opts.confirmHtml || `<i class="bi bi-check-lg me-1"></i> ${escapeHtml(opts.confirmText || 'Ya, Lanjutkan')}`,
        });
    }

    /**
     * High-Fidelity Form Modal (replaces window.prompt & multi-field Swal).
     */
    function openFormModal(opts = {}) {
        const fields = opts.fields || [];
        const fieldsHtml = fields.map(f => `
            <div class="mb-3">
                <label class="qa-modal-label" for="${escapeHtml(f.id)}">
                    ${escapeHtml(f.label)}
                    ${f.required ? '<span class="text-danger">*</span>' : ''}
                    ${f.hint ? `<span class="text-muted fw-normal ms-1">(${escapeHtml(f.hint)})</span>` : ''}
                </label>
                <input
                    type="${escapeHtml(f.type || 'text')}"
                    id="${escapeHtml(f.id)}"
                    class="form-control qa-modal-input"
                    placeholder="${escapeHtml(f.placeholder || '')}"
                    value="${escapeHtml(f.value || '')}"
                    autocomplete="off"
                />
            </div>
        `).join('');

        return openStudioDialog({
            title: opts.title || 'Input Data',
            subtitle: opts.subtitle || 'AI Automation Testing Studio',
            variant: opts.variant || 'primary',
            icon: opts.icon || 'bi-pencil-square',
            bodyHtml: `<div class="text-start">${fieldsHtml}</div>`,
            showCancel: true,
            cancelText: opts.cancelText || 'Batal',
            confirmHtml: opts.confirmHtml || `<i class="bi bi-check-lg me-1"></i> ${escapeHtml(opts.confirmText || 'Simpan')}`,
            preConfirm: (showError) => {
                const values = {};
                for (let i = 0; i < fields.length; i++) {
                    const f = fields[i];
                    const el = document.getElementById(f.id);
                    const val = el ? el.value.trim() : '';
                    if (f.required && !val) {
                        showError(f.errorText || `${f.label} wajib diisi!`);
                        if (el) el.focus();
                        return false;
                    }
                    values[f.name || f.id] = val;
                }
                return values;
            }
        });
    }

    return {
        escapeHtml,
        getStatusBadge,
        getActionBadge,
        getCsrfHeaders,
        toast,
        alert,
        confirm,
        openFormModal,
    };
})();
