/**
 * qa-studio.js - Main Studio Panel for AI Automation Testing Studio
 * Depends on: QAUtils (qa-utils.js). BASE_URL must be defined by the PHP view.
 */
'use strict';
document.addEventListener('DOMContentLoaded', function () {
    var escapeHtml    = QAUtils.escapeHtml;
    var getStatusBadge= QAUtils.getStatusBadge;
    var getActionBadge= QAUtils.getActionBadge;
    var getCsrfHeaders= QAUtils.getCsrfHeaders;
    var showToast     = QAUtils.toast;
    var showAlert     = QAUtils.alert;
    var showConfirm   = QAUtils.confirm;
    var openFormModal = QAUtils.openFormModal;

    var providerSelect       = document.getElementById('providerSelect');
    var modelSelect          = document.getElementById('modelSelect');
    var moduleSelect         = document.getElementById('moduleSelect');
    var btnAddModule         = document.getElementById('btnAddModule');
    var btnEditModule        = document.getElementById('btnEditModule');
    var btnDeleteModule      = document.getElementById('btnDeleteModule');
    var savedCaseSelect      = document.getElementById('savedCaseSelect');
    var testCaseInput        = document.getElementById('testCaseInput');
    var charCounter          = document.getElementById('charCounter');
    var modeSelect           = document.getElementById('modeSelect');
    var modeHelpText         = document.getElementById('modeHelpText');
    var browserDisplaySelect = document.getElementById('browserDisplaySelect');
    var btnResetBrowser      = document.getElementById('btnResetBrowser');
    var targetUrlInput       = document.getElementById('targetUrlInput');
    var btnGenerate          = document.getElementById('btnGenerate');
    var btnSaveCase          = document.getElementById('btnSaveCase');
    var btnEditSavedCase     = document.getElementById('btnEditSavedCase');
    var btnDeleteSavedCase   = document.getElementById('btnDeleteSavedCase');
    var savedCaseBadge       = document.getElementById('savedCaseBadge');
    var btnRunTest           = document.getElementById('btnRunTest');
    var emptyStatePlaceholder= document.getElementById('emptyStatePlaceholder');
    var loadingArea          = document.getElementById('loadingArea');
    var loadingTitle         = document.getElementById('loadingTitle');
    var loadingText          = document.getElementById('loadingText');
    var testPlanArea         = document.getElementById('testPlanArea');
    var testPlanBody         = document.getElementById('testPlanBody');
    var stepCountBadge       = document.getElementById('stepCountBadge');
    var validationAlerts     = document.getElementById('validationAlerts');
    var queueArea            = document.getElementById('queueArea');
    var queueText            = document.getElementById('queueText');
    var resultArea           = document.getElementById('resultArea');
    var resultBody           = document.getElementById('resultBody');
    var overallStatus        = document.getElementById('overallStatus');
    var resultSummary        = document.getElementById('resultSummary');
    var resultDuration       = document.getElementById('resultDuration');
    var btnCancelRun         = document.getElementById('btnCancelRun');
    var btnBackToPlan        = document.getElementById('btnBackToPlan');
    var testProgressBar      = document.getElementById('testProgressBar');
    var progressPercentText  = document.getElementById('progressPercentText');
    var executionNotice      = document.getElementById('executionNotice');
    var executionNoticeIcon  = document.getElementById('executionNoticeIcon');
    var executionNoticeText  = document.getElementById('executionNoticeText');
    var btnCopyDom           = document.getElementById('btnCopyDom');
    var domContent           = document.getElementById('domContent');

    var tabBtnPlan           = document.getElementById('tabBtnPlan');
    var tabBtnMonitor        = document.getElementById('tabBtnMonitor');
    var panePlan             = document.getElementById('panePlan');
    var paneMonitor          = document.getElementById('paneMonitor');
    var planHeaderControls   = document.getElementById('planHeaderControls');
    var monitorHeaderControls= document.getElementById('monitorHeaderControls');

    var currentTestPlan = null;
    var currentRunId    = null;
    var pollInterval    = null;

    function switchStudioTab(tab) {
        if (tab === 'monitor') {
            if (tabBtnPlan)            { tabBtnPlan.classList.remove('active'); tabBtnPlan.setAttribute('aria-selected', 'false'); }
            if (tabBtnMonitor)         { tabBtnMonitor.classList.add('active'); tabBtnMonitor.setAttribute('aria-selected', 'true'); }
            if (panePlan)              { panePlan.classList.remove('show', 'active'); }
            if (paneMonitor)           { paneMonitor.classList.add('show', 'active'); }
            if (planHeaderControls)    { planHeaderControls.classList.add('d-none'); planHeaderControls.classList.remove('d-flex'); }
            if (monitorHeaderControls) { monitorHeaderControls.classList.remove('d-none'); monitorHeaderControls.classList.add('d-flex'); }
        } else {
            if (tabBtnMonitor)         { tabBtnMonitor.classList.remove('active'); tabBtnMonitor.setAttribute('aria-selected', 'false'); }
            if (tabBtnPlan)            { tabBtnPlan.classList.add('active'); tabBtnPlan.setAttribute('aria-selected', 'true'); }
            if (paneMonitor)           { paneMonitor.classList.remove('show', 'active'); }
            if (panePlan)              { panePlan.classList.add('show', 'active'); }
            if (monitorHeaderControls) { monitorHeaderControls.classList.add('d-none'); monitorHeaderControls.classList.remove('d-flex'); }
            if (planHeaderControls)    { planHeaderControls.classList.remove('d-none'); planHeaderControls.classList.add('d-flex'); }
        }
    }

    function initStudioTabs() {
        if (tabBtnPlan)     tabBtnPlan.addEventListener('click', function() { switchStudioTab('plan'); });
        if (tabBtnMonitor)  tabBtnMonitor.addEventListener('click', function() { switchStudioTab('monitor'); });
        if (btnBackToPlan)  btnBackToPlan.addEventListener('click', function() { switchStudioTab('plan'); });
    }

    var PROMPT_TEMPLATES = {
        login_aspal:   'Login sebagai user test. Buka menu SPM Aspal. Cari customer PT. Jaya Konstruksi Manggala Pratama, Tbk jobsite Lampung. Buat pesanan 18000 kg. Simpan transaksi. Pastikan transaksi berhasil tersimpan.',
        search_filter: 'Buka daftar transaksi modul Kendaraan. Masukkan filter pencarian plat nomor "B 1234 ABC". Klik tombol Filter. Pastikan hasil tabel menampilkan baris kendaraan yang sesuai.',
        crud_create:   'Buka menu Master Aset. Klik tombol Tambah Aset Baru. Isi nama aset "Kompresor HE-01", kategori "Heavy Equipment", nilai perolehan "25000000". Klik tombol Simpan. Pastikan muncul notifikasi sukses tersimpan.'
    };

    // =========================================================================
    // SECTION A - Form Inits
    // =========================================================================
    function initBrowserDisplay() {
        if (!browserDisplaySelect) return;
        var saved = localStorage.getItem('ejatra_browser_display');
        if (saved !== null) browserDisplaySelect.value = saved;
        browserDisplaySelect.addEventListener('change', function () {
            localStorage.setItem('ejatra_browser_display', this.value);
        });
    }

    function populateModelsForProvider() {
        if (!providerSelect || !modelSelect) return;
        modelSelect.innerHTML = '<option value="">-- Pilih Model --</option>';
        var selected = providerSelect.options[providerSelect.selectedIndex];
        if (!selected || !selected.value) return;
        try {
            var models = JSON.parse(selected.getAttribute('data-models') || '[]');
            models.forEach(function(m) {
                var opt = document.createElement('option');
                opt.value = typeof m === 'object' ? (m.name || m.id) : m;
                opt.textContent = typeof m === 'object' ? (m.displayName || m.name) : m;
                modelSelect.appendChild(opt);
            });
            if (models.length > 0) {
                var targetIdx = 1;
                for (var i = 1; i < modelSelect.options.length; i++) {
                    if (modelSelect.options[i].value.indexOf('gpt-oss-120b') !== -1) { targetIdx = i; break; }
                }
                modelSelect.selectedIndex = targetIdx;
            }
        } catch(e) { console.error('Error parsing models:', e); }
    }

    function initProviderModel() {
        if (!providerSelect) return;
        providerSelect.addEventListener('change', populateModelsForProvider);
        var groqIdx = -1;
        for (var i = 0; i < providerSelect.options.length; i++) {
            if (providerSelect.options[i].value === 'groq') { groqIdx = i; break; }
        }
        providerSelect.selectedIndex = groqIdx !== -1 ? groqIdx : (providerSelect.options.length > 1 ? 1 : 0);
        populateModelsForProvider();
    }

    function initQuickInsert() {
        document.querySelectorAll('.qa-quick-insert-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var key = this.getAttribute('data-template');
                if (PROMPT_TEMPLATES[key] && testCaseInput) { testCaseInput.value = PROMPT_TEMPLATES[key]; updateCounters(); }
            });
        });
    }

    function updateCounters() {
        var text = testCaseInput ? testCaseInput.value.trim() : '';
        var words = text ? text.split(/\s+/).length : 0;
        if (charCounter) charCounter.textContent = words + ' kata / ' + text.length + ' karakter';
    }

    function initCounters() {
        if (!testCaseInput) return;
        testCaseInput.addEventListener('input', updateCounters);
        updateCounters();
        testCaseInput.addEventListener('keydown', function(e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); if (btnGenerate) btnGenerate.click(); }
        });
    }

    function initModeHelp() {
        if (!modeSelect || !modeHelpText) return;
        modeSelect.addEventListener('change', function() {
            var isWrite = this.value === 'write_test';
            modeHelpText.innerHTML = isWrite
                ? '<i class="bi bi-exclamation-triangle text-warning"></i> Operasi Simpan Aktif'
                : '<i class="bi bi-shield-check text-success"></i> Aman (baca saja)';
            modeHelpText.setAttribute('title', isWrite
                ? 'Operasi simpan/ubah data diaktifkan (DB Testing)'
                : 'Aman (hanya navigasi dan baca data)');
        });
    }

    function loadSavedCases(moduleId, selectCaseId) {
        if (!savedCaseSelect) return;
        savedCaseSelect.innerHTML = '<option value="">-- Tulis Skenario Baru --</option>';
        if (btnEditSavedCase)   btnEditSavedCase.classList.add('d-none');
        if (btnDeleteSavedCase) btnDeleteSavedCase.classList.add('d-none');
        if (savedCaseBadge)     savedCaseBadge.classList.add('d-none');
        if (!moduleId) {
            renderBatchSavedCases([], '');
            return;
        }

        var modOpt = moduleSelect ? moduleSelect.options[moduleSelect.selectedIndex] : null;
        var modName = modOpt ? (modOpt.getAttribute('data-name') || modOpt.textContent || '') : '';

        fetch(BASE_URL + 'ai-automation-test/saved-cases?module_id=' + moduleId)
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var cases = (data.test_cases || []).slice().sort(function(a, b) {
                return (a.test_name || '').localeCompare(b.test_name || '', undefined, { sensitivity: 'base', numeric: true });
            });
            cases.forEach(function(c) {
                var opt = Object.assign(document.createElement('option'), { value: c.id, textContent: c.test_name + ' (' + (c.llm_provider || 'auto') + ')' });
                opt.setAttribute('data-name',   c.test_name || '');
                opt.setAttribute('data-prompt', c.prompt || '');
                opt.setAttribute('data-mode',   c.mode   || 'read_only');
                opt.setAttribute('data-plan',   c.test_plan_json || '');
                if (selectCaseId && String(c.id) === String(selectCaseId)) {
                    opt.selected = true;
                }
                savedCaseSelect.appendChild(opt);
            });
            if (selectCaseId && savedCaseSelect.value) {
                if (btnEditSavedCase)   btnEditSavedCase.classList.remove('d-none');
                if (btnDeleteSavedCase) btnDeleteSavedCase.classList.remove('d-none');
                if (savedCaseBadge)     savedCaseBadge.classList.remove('d-none');
            }
            renderBatchSavedCases(cases, modName);
        })
        .catch(function(err) { console.error('Error fetching saved cases:', err); });
    }

    function updateModuleActionButtons() {
        var hasModule = moduleSelect && moduleSelect.value !== '';
        if (btnEditModule)   btnEditModule.classList.toggle('d-none', !hasModule);
        if (btnDeleteModule) btnDeleteModule.classList.toggle('d-none', !hasModule);
    }

    function loadModules(selectModuleId) {
        if (!moduleSelect) return;
        fetch(BASE_URL + 'ai-automation-test/modules')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var modules = data.modules || [];
            moduleSelect.innerHTML = '<option value="">-- Pilih Modul e-Jatra --</option>';
            modules.forEach(function(m) {
                var opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = (m.name || '') + ' (' + (m.code || '') + ')';
                opt.setAttribute('data-name', m.name || '');
                opt.setAttribute('data-code', m.code || '');
                opt.setAttribute('data-base-url', m.base_url || '');
                if (selectModuleId && String(m.id) === String(selectModuleId)) {
                    opt.selected = true;
                }
                moduleSelect.appendChild(opt);
            });
            updateModuleActionButtons();
            var selected = moduleSelect.options[moduleSelect.selectedIndex];
            if (selected && selected.getAttribute('data-base-url') && targetUrlInput) {
                targetUrlInput.value = selected.getAttribute('data-base-url');
            }
            loadSavedCases(moduleSelect.value);
        })
        .catch(function(err) { console.error('Error fetching modules:', err); });
    }

    function initModuleSelect() {
        if (!moduleSelect) return;
        updateModuleActionButtons();
        moduleSelect.addEventListener('change', function() {
            updateModuleActionButtons();
            var selected = this.options[this.selectedIndex];
            if (selected && selected.getAttribute('data-base-url') && targetUrlInput) targetUrlInput.value = selected.getAttribute('data-base-url');
            loadSavedCases(this.value);
        });
    }

    function initAddModule() {
        if (!btnAddModule) return;
        btnAddModule.addEventListener('click', function() {
            var defaultUrl = targetUrlInput ? targetUrlInput.value.trim() : '';

            openFormModal({
                title: 'Tambah Modul Bisnis Baru',
                subtitle: 'Konfigurasi target modul bisnis e-Jatra',
                icon: 'bi-grid-plus',
                confirmHtml: '<i class="bi bi-plus-lg me-1"></i> Tambah Modul',
                fields: [
                    { id: 'swalModuleName', name: 'name', label: 'Nama Modul Bisnis', required: true, placeholder: 'Contoh: Kontrak & Penjualan', errorText: 'Nama modul bisnis wajib diisi!' },
                    { id: 'swalModuleCode', name: 'code', label: 'Kode Singkat Modul', required: false, hint: 'opsional', placeholder: 'Contoh: kontrak' }
                ]
            }).then(function(result) {
                if (!result.isConfirmed || !result.value) return;
                fetch(BASE_URL + 'ai-automation-test/save-module', {
                    method: 'POST',
                    headers: getCsrfHeaders(),
                    body: JSON.stringify({
                        name: result.value.name,
                        code: result.value.code,
                        base_url: defaultUrl
                    })
                })
                .then(function(r) { return r.json(); })
                .then(function(res) {
                    if (res.success) {
                        showToast({ icon: 'success', title: 'Modul Ditambahkan', text: 'Modul bisnis baru berhasil disimpan.' });
                        loadModules(res.id);
                    } else {
                        showAlert({ variant: 'danger', icon: 'bi-x-circle-fill', title: 'Gagal Menambahkan Modul', text: res.error || 'Gagal menambahkan modul bisnis.' });
                    }
                })
                .catch(function() {
                    showAlert({ variant: 'danger', icon: 'bi-wifi-off', title: 'Kesalahan Jaringan', text: 'Terjadi kesalahan jaringan saat menghubungi server.' });
                });
            });
        });
    }

    function initEditModule() {
        if (!btnEditModule) return;
        btnEditModule.addEventListener('click', function() {
            var moduleId = moduleSelect ? moduleSelect.value : null;
            if (!moduleId) return;
            var selOpt = moduleSelect.options[moduleSelect.selectedIndex];
            var currentName = selOpt ? (selOpt.getAttribute('data-name') || '') : '';
            var currentCode = selOpt ? (selOpt.getAttribute('data-code') || '') : '';

            openFormModal({
                title: 'Ubah Modul Bisnis',
                subtitle: 'Perbarui identitas modul bisnis e-Jatra',
                icon: 'bi-pencil-square',
                confirmHtml: '<i class="bi bi-check-lg me-1"></i> Simpan Perubahan',
                fields: [
                    { id: 'swalEditModuleName', name: 'name', label: 'Nama Modul Bisnis', required: true, value: currentName, errorText: 'Nama modul bisnis tidak boleh kosong!' },
                    { id: 'swalEditModuleCode', name: 'code', label: 'Kode Singkat Modul', required: false, value: currentCode }
                ]
            }).then(function(result) {
                if (!result.isConfirmed || !result.value) return;
                fetch(BASE_URL + 'ai-automation-test/update-module/' + moduleId, {
                    method: 'POST',
                    headers: getCsrfHeaders(),
                    body: JSON.stringify({
                        name: result.value.name,
                        code: result.value.code
                    })
                })
                .then(function(r) { return r.json(); })
                .then(function(res) {
                    if (res.success) {
                        showToast({ icon: 'success', title: 'Modul Diperbarui', text: 'Perubahan modul bisnis berhasil disimpan.' });
                        loadModules(moduleId);
                    } else {
                        showAlert({ variant: 'danger', icon: 'bi-x-circle-fill', title: 'Gagal Memperbarui', text: res.error || 'Gagal memperbarui modul bisnis.' });
                    }
                })
                .catch(function() {
                    showAlert({ variant: 'danger', icon: 'bi-wifi-off', title: 'Kesalahan Jaringan', text: 'Terjadi kesalahan jaringan.' });
                });
            });
        });
    }

    function initDeleteModule() {
        if (!btnDeleteModule) return;
        btnDeleteModule.addEventListener('click', function() {
            var moduleId = moduleSelect ? moduleSelect.value : null;
            if (!moduleId) return;
            var selOpt = moduleSelect.options[moduleSelect.selectedIndex];
            var selectedText = selOpt ? selOpt.text : 'modul ini';

            showConfirm({
                title: 'Hapus Modul Bisnis?',
                subtitle: 'Tindakan ini tidak dapat dibatalkan',
                variant: 'danger',
                icon: 'bi-trash3-fill',
                text: 'Hapus modul "' + selectedText + '"? Skenario tersimpan pada modul ini juga akan ikut terhapus.',
                confirmHtml: '<i class="bi bi-trash3 me-1"></i> Ya, Hapus Modul'
            }).then(function(result) {
                if (!result.isConfirmed) return;
                fetch(BASE_URL + 'ai-automation-test/module/' + moduleId, {
                    method: 'DELETE',
                    headers: getCsrfHeaders()
                })
                .then(function(r) { return r.json(); })
                .then(function(res) {
                    if (res.success) {
                        showToast({ icon: 'success', title: 'Modul Dihapus', text: 'Modul bisnis berhasil dihapus.' });
                        loadModules('');
                    } else {
                        showAlert({ variant: 'danger', icon: 'bi-x-circle-fill', title: 'Gagal Menghapus', text: res.error || 'Terjadi kesalahan saat menghapus modul.' });
                    }
                })
                .catch(function() {
                    showAlert({ variant: 'danger', icon: 'bi-wifi-off', title: 'Kesalahan Jaringan', text: 'Terjadi kesalahan jaringan.' });
                });
            });
        });
    }

    function initSavedCaseSelect() {
        if (!savedCaseSelect) return;
        savedCaseSelect.addEventListener('change', function() {
            var selected = this.options[this.selectedIndex];
            if (selected && selected.value) {
                if (btnEditSavedCase)   btnEditSavedCase.classList.remove('d-none');
                if (btnDeleteSavedCase) btnDeleteSavedCase.classList.remove('d-none');
                if (savedCaseBadge)     savedCaseBadge.classList.remove('d-none');
                var promptVal = selected.getAttribute('data-prompt');
                var modeVal   = selected.getAttribute('data-mode');
                var planJson  = selected.getAttribute('data-plan');
                if (promptVal && testCaseInput) testCaseInput.value = promptVal;
                if (modeVal && modeSelect) { modeSelect.value = modeVal; modeSelect.dispatchEvent(new Event('change')); }
                updateCounters();
                if (planJson) {
                    try {
                        var p = JSON.parse(planJson); currentTestPlan = p; renderTestPlan(p);
                        if (emptyStatePlaceholder) emptyStatePlaceholder.classList.add('d-none');
                        if (validationAlerts) validationAlerts.classList.add('d-none');
                        if (testPlanArea) testPlanArea.classList.remove('d-none');
                        if (btnRunTest)   btnRunTest.disabled = false;
                    } catch(e) {}
                }
            } else {
                if (btnEditSavedCase)   btnEditSavedCase.classList.add('d-none');
                if (btnDeleteSavedCase) btnDeleteSavedCase.classList.add('d-none');
                if (savedCaseBadge)     savedCaseBadge.classList.add('d-none');
            }
        });
    }

    function initEditSavedCase() {
        if (!btnEditSavedCase) return;
        btnEditSavedCase.addEventListener('click', function() {
            var caseId = savedCaseSelect ? savedCaseSelect.value : null;
            if (!caseId) return;
            var selOpt = savedCaseSelect.options[savedCaseSelect.selectedIndex];
            var currentName = selOpt ? (selOpt.getAttribute('data-name') || selOpt.text.replace(/\s*\([^)]*\)\s*$/, '')) : '';

            openFormModal({
                title: 'Ubah Nama Skenario',
                subtitle: 'Regression Suite Scenario',
                icon: 'bi-bookmark-star-fill',
                confirmHtml: '<i class="bi bi-check-lg me-1"></i> Simpan Nama',
                fields: [
                    { id: 'swalEditScenarioName', name: 'test_name', label: 'Nama Skenario Pengujian', required: true, value: currentName, errorText: 'Nama skenario tidak boleh kosong!' }
                ]
            }).then(function(result) {
                if (!result.isConfirmed || !result.value) return;
                fetch(BASE_URL + 'ai-automation-test/update-case-name/' + caseId, {
                    method: 'POST',
                    headers: getCsrfHeaders(),
                    body: JSON.stringify({ test_name: result.value.test_name })
                })
                .then(function(r) { return r.json(); })
                .then(function(res) {
                    if (res.success) {
                        showToast({ icon: 'success', title: 'Nama Diperbarui', text: 'Nama skenario berhasil diubah.' });
                        if (moduleSelect) {
                            loadSavedCases(moduleSelect.value, caseId);
                        }
                    } else {
                        showAlert({ variant: 'danger', icon: 'bi-x-circle-fill', title: 'Gagal Mengubah Nama', text: res.error || 'Terjadi kesalahan saat mengubah nama.' });
                    }
                })
                .catch(function() {
                    showAlert({ variant: 'danger', icon: 'bi-wifi-off', title: 'Kesalahan Jaringan', text: 'Terjadi kesalahan jaringan.' });
                });
            });
        });
    }

    function initDeleteSavedCase() {
        if (!btnDeleteSavedCase) return;
        btnDeleteSavedCase.addEventListener('click', function() {
            var caseId = savedCaseSelect ? savedCaseSelect.value : null;
            if (!caseId) return;
            var selOpt = savedCaseSelect.options[savedCaseSelect.selectedIndex];
            var selectedText = selOpt ? selOpt.text : 'skenario ini';

            showConfirm({
                title: 'Hapus Skenario Regresi?',
                subtitle: 'Hapus dari daftar Regression Suite',
                variant: 'danger',
                icon: 'bi-trash3-fill',
                text: 'Hapus skenario "' + selectedText + '" dari regression suite?',
                confirmHtml: '<i class="bi bi-trash3 me-1"></i> Ya, Hapus'
            }).then(function(result) {
                if (!result.isConfirmed) return;
                fetch(BASE_URL + 'ai-automation-test/saved-case/' + caseId, { method: 'DELETE', headers: getCsrfHeaders() })
                .then(function(r) { return r.json(); })
                .then(function(res) {
                    if (res.success) {
                        showToast({ icon: 'success', title: 'Skenario Dihapus', text: 'Skenario berhasil dihapus dari regression suite.' });
                        if (moduleSelect) loadSavedCases(moduleSelect.value);
                    } else {
                        showAlert({ variant: 'danger', icon: 'bi-x-circle-fill', title: 'Gagal Menghapus', text: res.error || 'Terjadi kesalahan' });
                    }
                })
                .catch(function() {
                    showAlert({ variant: 'danger', icon: 'bi-wifi-off', title: 'Kesalahan Jaringan', text: 'Terjadi kesalahan jaringan.' });
                });
            });
        });
    }

    function initResetBrowser() {
        if (!btnResetBrowser) return;
        btnResetBrowser.addEventListener('click', function() {
            var self = this, origHtml = this.innerHTML;
            this.disabled = true;
            this.innerHTML = '<span class="spinner-border spinner-border-sm" style="width:0.7rem;height:0.7rem;"></span> Membersihkan...';
            if (browserDisplaySelect) { browserDisplaySelect.value = 'false'; localStorage.setItem('ejatra_browser_display', 'false'); }
            fetch(BASE_URL + 'ai-automation-test/reset-browser', { method: 'POST', headers: getCsrfHeaders() })
            .then(function(r) { return r.json(); })
            .then(function() { self.disabled = false; self.innerHTML = '<i class="bi bi-check-circle text-success"></i> Bersih & Visual Siap!'; setTimeout(function() { self.innerHTML = origHtml; }, 2000); })
            .catch(function(err) { self.disabled = false; self.innerHTML = origHtml; console.error(err); });
        });
    }

    // =========================================================================
    // SECTION B - Generate Plan
    // =========================================================================
    function setGeneratingState(provider, model) {
        switchStudioTab('plan');
        if (emptyStatePlaceholder) emptyStatePlaceholder.classList.add('d-none');
        if (testPlanArea)     testPlanArea.classList.add('d-none');
        if (resultArea)       resultArea.classList.add('d-none');
        if (queueArea)        queueArea.classList.add('d-none');
        if (validationAlerts) { validationAlerts.innerHTML = ''; validationAlerts.classList.add('d-none'); }
        if (btnSaveCase)      btnSaveCase.disabled = true;
        if (btnRunTest)       btnRunTest.disabled  = true;
        if (loadingArea)      loadingArea.classList.remove('d-none');
        if (loadingTitle)     loadingTitle.textContent = 'Menghubungi ' + provider.toUpperCase() + ' (' + model + ')...';
        if (loadingText)      loadingText.textContent  = 'Menerjemahkan instruksi natural language menjadi skema JSON...';
    }

    function handleGeneratePlanResponse(data) {
        if (loadingArea) loadingArea.classList.add('d-none');
        if (!data.success || !data.test_plan) {
            showAlert({ variant: 'danger', icon: 'bi-exclamation-octagon-fill', title: 'Gagal Generate Test Plan', text: data.error || data.message || 'Respons tidak valid' });
            return;
        }
        currentTestPlan = data.test_plan; renderTestPlan(data.test_plan);
        if (testPlanArea) testPlanArea.classList.remove('d-none');
        if (btnSaveCase)  btnSaveCase.disabled = false;
        if (btnRunTest)   btnRunTest.disabled  = false;
        switchStudioTab('plan');
        showToast({ icon: 'success', title: 'Test Plan Siap', text: (data.test_plan.steps ? data.test_plan.steps.length : 0) + ' langkah pengujian berhasil disusun.' });
        if (data.metadata) {
            var tokenBadge = document.getElementById('llmTokenBadge');
            var modelEl    = document.getElementById('llmModelName');
            var promptEl   = document.getElementById('promptTokensCount');
            var complEl    = document.getElementById('completionTokensCount');
            if (tokenBadge && modelEl && promptEl && complEl) {
                var modelName = data.metadata.model || data.metadata.provider || 'AI Model';
                modelEl.textContent  = modelName;
                modelEl.title        = modelName;
                promptEl.textContent = (data.metadata.prompt_tokens     || 0).toLocaleString();
                complEl.textContent  = (data.metadata.completion_tokens || 0).toLocaleString();
                tokenBadge.classList.remove('d-none');
            }
        }
        if (data.validation && !data.validation.valid && validationAlerts) {
            var errs = data.validation.errors || [];
            validationAlerts.classList.remove('d-none');
            validationAlerts.innerHTML = '<div class="alert alert-warning py-2 px-3 small d-flex align-items-start gap-2"><i class="bi bi-exclamation-octagon-fill fs-6 text-warning"></i><div><div class="fw-bold">Peringatan Validasi Backend:</div><ul class="mb-0 ps-3">' + errs.map(function(e){ return '<li>' + e + '</li>'; }).join('') + '</ul></div></div>';
        }
    }

    function initGeneratePlan() {
        if (!btnGenerate) return;
        btnGenerate.addEventListener('click', function() {
            var moduleId  = moduleSelect   ? moduleSelect.value   : '';
            var provider  = providerSelect ? providerSelect.value  : '';
            var model     = modelSelect    ? modelSelect.value     : '';
            var mode      = modeSelect     ? modeSelect.value      : 'read_only';
            var testCase  = testCaseInput  ? testCaseInput.value.trim() : '';
            var targetUrl = targetUrlInput ? targetUrlInput.value.trim() : '';
            if (!moduleId)           { showToast({ icon: 'warning', title: 'Modul Belum Dipilih', text: 'Silakan pilih modul bisnis terlebih dahulu.' }); if (moduleSelect)   moduleSelect.focus();   return; }
            if (!provider || !model) { showToast({ icon: 'warning', title: 'Model AI Belum Dipilih', text: 'Silakan pilih LLM Provider dan Model.' });   if (providerSelect) providerSelect.focus(); return; }
            if (!testCase)           { showToast({ icon: 'warning', title: 'Instruksi Kosong', text: 'Silakan masukkan skenario pengujian bahasa natural.' }); if (testCaseInput)  testCaseInput.focus();  return; }
            setGeneratingState(provider, model);
            fetch(BASE_URL + 'ai-automation-test/generate-plan', {
                method: 'POST', headers: getCsrfHeaders(),
                body: JSON.stringify({ module_id: moduleId, provider: provider, model: model, mode: mode, test_case: testCase, target_url: targetUrl })
            })
            .then(function(res) { return res.json(); })
            .then(function(data) { handleGeneratePlanResponse(data); })
            .catch(function(err) {
                if (loadingArea) loadingArea.classList.add('d-none');
                console.error(err);
                showAlert({ variant: 'danger', icon: 'bi-wifi-off', title: 'Koneksi Gagal', text: 'Terjadi kesalahan koneksi atau internal server error.' });
            });
        });
    }

    // =========================================================================
    // SECTION C - Render Test Plan
    // =========================================================================
    function buildTestPlanRow(step) {
        var tr = document.createElement('tr');
        var targetStr = '<span class="text-muted">-</span>';
        if (step.target) {
            targetStr = '<span class="action-code-badge">' + escapeHtml(step.target.strategy || 'css') + '</span> <code class="text-dark small">' + escapeHtml(step.target.value || '') + '</code>';
            if (step.target.fallback) targetStr += '<div class="text-muted small" style="font-size:0.72rem;">fallback: ' + escapeHtml(step.target.fallback) + '</div>';
        }
        var waitStr = '<span class="text-muted">none</span>';
        if (step.wait_before && step.wait_before.type !== 'none') {
            waitStr = '<span class="badge bg-light text-dark border">' + escapeHtml(step.wait_before.type) + '</span>';
            if (step.wait_before.timeout_ms) waitStr += ' <span class="text-muted small">' + step.wait_before.timeout_ms + 'ms</span>';
        }
        var retryStr = (step.retry && step.retry.max_attempts) ? '<span class="badge bg-light text-dark border">' + step.retry.max_attempts + 'x</span>' : '<span class="text-muted">0</span>';
        tr.innerHTML = '<td class="text-center fw-bold text-secondary">' + (step.step_no || '') + '</td><td><span class="action-code-badge">' + escapeHtml(step.action || '') + '</span></td><td>' + targetStr + '</td><td><small class="text-dark">' + escapeHtml(step.value || '-') + '</small></td><td>' + waitStr + '</td><td class="text-center">' + retryStr + '</td><td><small class="text-secondary">' + escapeHtml(step.expected_result || '-') + '</small></td>';
        return tr;
    }

    function renderTestPlan(plan) {
        if (!testPlanBody) return;
        testPlanBody.innerHTML = '';
        var steps = plan.steps || [];
        if (stepCountBadge) stepCountBadge.textContent = steps.length + ' Langkah';
        steps.forEach(function(step) { testPlanBody.appendChild(buildTestPlanRow(step)); });
    }

    // =========================================================================
    // SECTION D - Save Case (With Conflict Detection & Replace Confirmation)
    // =========================================================================
    function promptSaveScenario(initialName) {
        if (!currentTestPlan) return;
        var selOpt = moduleSelect && moduleSelect.options[moduleSelect.selectedIndex];
        var selCaseOpt = savedCaseSelect && savedCaseSelect.selectedIndex > 0 ? savedCaseSelect.options[savedCaseSelect.selectedIndex] : null;
        var activeCaseName = selCaseOpt ? (selCaseOpt.getAttribute('data-name') || selCaseOpt.text.replace(/\s*\([^)]*\)\s*$/, '')) : '';
        var defaultScenarioName = initialName || activeCaseName || (currentTestPlan.test_name ? currentTestPlan.test_name : ('Test ' + (selOpt ? selOpt.text : 'Modul')));

        openFormModal({
            title: 'Simpan Skenario Pengujian',
            subtitle: 'Tambahkan ke Regression Suite modul ini',
            icon: 'bi-bookmark-plus-fill',
            confirmHtml: '<i class="bi bi-bookmark-check me-1"></i> Simpan Skenario',
            fields: [
                {
                    id: 'swalSaveScenarioName',
                    name: 'test_name',
                    label: 'Nama Skenario Regresi',
                    required: true,
                    value: defaultScenarioName,
                    placeholder: 'Contoh: TC-SPM-001 Input & Verifikasi',
                    errorText: 'Nama skenario wajib diisi!'
                }
            ]
        }).then(function(result) {
            if (!result.isConfirmed || !result.value) return;
            var testName = result.value.test_name ? result.value.test_name.trim() : '';
            if (!testName) return;

            executeSaveCase(testName, false);
        });
    }

    function executeSaveCase(testName, replace) {
        var moduleId = moduleSelect ? moduleSelect.value : '';
        if (!moduleId) {
            showToast({ icon: 'warning', title: 'Modul Belum Dipilih', text: 'Silakan pilih modul bisnis terlebih dahulu.' });
            return;
        }

        fetch(BASE_URL + 'ai-automation-test/save-case', {
            method: 'POST',
            headers: getCsrfHeaders(),
            body: JSON.stringify({
                module_id: moduleId,
                test_name: testName,
                prompt: testCaseInput ? testCaseInput.value.trim() : '',
                mode: modeSelect ? modeSelect.value : 'read_only',
                test_plan_json: currentTestPlan,
                llm_provider: providerSelect ? providerSelect.value : '',
                llm_model: modelSelect ? modelSelect.value : '',
                replace: Boolean(replace)
            })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.conflict) {
                // Skenario dengan nama yang sama sudah ada -> Tampilkan konfirmasi replace ala save file di device
                showConfirm({
                    title: 'Nama Skenario Sudah Ada',
                    subtitle: 'Konfirmasi Menimpa (Replace)',
                    variant: 'warning',
                    icon: 'bi-exclamation-triangle-fill',
                    html: '<div class="text-start">' +
                          '<p class="mb-2">Skenario dengan nama <strong class="text-dark">"' + escapeHtml(testName) + '"</strong> sudah ada pada modul ini.</p>' +
                          '<p class="mb-0 text-secondary small">Apakah Anda yakin ingin <strong>menimpa (replace)</strong> skenario tersebut dengan test plan ini? Langkah-langkah lama akan diperbarui.</p>' +
                          '</div>',
                    confirmHtml: '<i class="bi bi-arrow-repeat me-1"></i> Ya, Timpa (Replace)',
                    cancelText: 'Ganti Nama / Batal'
                }).then(function(confirmResult) {
                    if (confirmResult.isConfirmed) {
                        // User setuju menimpa -> kirim ulang dengan replace = true
                        executeSaveCase(testName, true);
                    } else {
                        // User klik Batal / Ganti Nama -> buka kembali form modal simpan dengan nama yang sama agar mudah diedit
                        promptSaveScenario(testName);
                    }
                });
                return;
            }

            if (data.success) {
                var isReplaced = Boolean(data.replaced);
                showToast({
                    icon: 'success',
                    title: isReplaced ? 'Skenario Berhasil Ditimpa' : 'Skenario Tersimpan',
                    text: '"' + escapeHtml(testName) + '" ' + (isReplaced ? 'berhasil diperbarui (replace) dalam regression suite.' : 'berhasil disimpan ke regression suite.')
                });
                if (moduleSelect) {
                    loadSavedCases(moduleSelect.value, data.id);
                }
            } else {
                showAlert({
                    variant: 'danger',
                    icon: 'bi-x-circle-fill',
                    title: 'Gagal Menyimpan',
                    text: data.error || 'Terjadi kesalahan saat menyimpan skenario.'
                });
            }
        })
        .catch(function(err) {
            console.error('Save case error:', err);
            showAlert({
                variant: 'danger',
                icon: 'bi-wifi-off',
                title: 'Kesalahan Jaringan',
                text: 'Terjadi kesalahan jaringan saat menghubungi server.'
            });
        });
    }

    function initSaveCase() {
        if (!btnSaveCase) return;
        btnSaveCase.addEventListener('click', function() {
            promptSaveScenario();
        });
    }

    // =========================================================================
    // SECTION E - Run Test & Polling
    // =========================================================================
    function resetMonitorToIdle(statusLabel, message) {
        if (btnRunTest)   btnRunTest.disabled = false;
        if (btnCancelRun) btnCancelRun.classList.add('d-none');
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
        currentRunId = null;

        if (overallStatus) {
            overallStatus.className = 'pill-status pill-neutral ms-1 py-0 px-2';
            overallStatus.innerHTML = statusLabel || 'IDLE';
        }
        if (resultSummary) {
            resultSummary.textContent = message || 'Pengujian belum dijalankan.';
        }
        if (resultDuration) {
            resultDuration.innerHTML = '<i class="bi bi-stopwatch"></i> 0 ms';
        }
        if (progressPercentText) {
            progressPercentText.textContent = 'Progres: 0%';
        }
        if (testProgressBar) {
            testProgressBar.className = 'progress-bar bg-secondary';
            testProgressBar.style.width = '0%';
            testProgressBar.classList.remove('progress-bar-animated', 'progress-bar-striped');
        }
        if (queueArea) queueArea.classList.add('d-none');

        if (currentTestPlan && currentTestPlan.steps) {
            renderLiveSteps([], currentTestPlan.steps, 'IDLE');
        }
    }

    function setRunningState() {
        switchStudioTab('monitor');
        if (resultArea)      resultArea.classList.remove('d-none');
        if (queueArea)       queueArea.classList.add('d-none');
        if (btnCancelRun)    { btnCancelRun.classList.remove('d-none'); btnCancelRun.disabled = false; btnCancelRun.innerHTML = '<i class="bi bi-stop-circle me-1"></i> Hentikan'; }
        if (overallStatus)   { overallStatus.className = 'pill-status pill-running ms-1 py-0 px-2'; overallStatus.innerHTML = '<i class="bi bi-arrow-repeat"></i> RUNNING'; }
        if (resultSummary)   resultSummary.textContent  = 'Memulai Playwright Runner...';
        if (resultDuration)  resultDuration.innerHTML   = '<i class="bi bi-stopwatch"></i> 0 ms';
        if (progressPercentText) progressPercentText.textContent = 'Progres: 0%';
        if (testProgressBar) {
            testProgressBar.className = 'progress-bar bg-primary progress-bar-striped progress-bar-animated';
            testProgressBar.style.width = '0%';
        }
        if (executionNotice) executionNotice.classList.add('d-none');
    }

    function initRunTest() {
        if (!btnRunTest) return;
        btnRunTest.addEventListener('click', function() {
            if (!currentTestPlan) return;
            btnRunTest.disabled = true;
            setRunningState();
            renderLiveSteps([], currentTestPlan.steps || []);
            var isHeadless = browserDisplaySelect ? (browserDisplaySelect.value === 'true') : false;
            fetch(BASE_URL + 'ai-automation-test/run', {
                method: 'POST', headers: getCsrfHeaders(),
                body: JSON.stringify({ module_id: moduleSelect ? moduleSelect.value : '', mode: modeSelect ? modeSelect.value : 'read_only', test_plan_json: currentTestPlan, llm_provider: providerSelect ? providerSelect.value : '', llm_model: modelSelect ? modelSelect.value : '', test_case_id: savedCaseSelect ? (savedCaseSelect.value || null) : null, target_url: targetUrlInput ? targetUrlInput.value.trim() : '', headless: isHeadless, prompt: testCaseInput ? testCaseInput.value.trim() : '' })
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.success && data.run_id) {
                    currentRunId = data.run_id;
                    if (data.status === 'QUEUED' && queueArea && queueText) { queueArea.classList.remove('d-none'); queueText.textContent = 'Pengujian masuk antrian (Posisi: ' + (data.queue_position || 1) + ').'; }
                    startPolling();
                } else {
                    resetMonitorToIdle('<i class="bi bi-x-circle text-danger me-1"></i> DITOLAK', 'Pengujian ditolak sistem sebelum dijalankan.');
                    switchStudioTab('plan');
                    var errorDetail = (data.validation_errors && data.validation_errors.length > 0) ? '\n- ' + data.validation_errors.join('\n- ') : '';
                    showAlert({ variant: 'danger', icon: 'bi-exclamation-octagon-fill', title: 'Gagal Menjalankan Test', text: (data.error || 'Server error') + errorDetail });
                }
            })
            .catch(function(err) {
                resetMonitorToIdle('<i class="bi bi-x-circle text-danger me-1"></i> GAGAL', 'Gagal terhubung ke CI4 Backend.');
                switchStudioTab('plan');
                console.error(err);
                showAlert({ variant: 'danger', icon: 'bi-wifi-off', title: 'Koneksi Runner Gagal', text: 'Gagal terhubung ke CI4 Backend.' });
            });
        });
    }

    function initCancelRun() {
        if (!btnCancelRun) return;
        btnCancelRun.addEventListener('click', function() {
            if (!currentRunId) {
                resetMonitorToIdle('IDLE', 'Pengujian dibatalkan.');
                switchStudioTab('plan');
                return;
            }
            var self = this;
            showConfirm({
                title: 'Hentikan Pengujian Sekarang?',
                subtitle: 'Playwright Live Runner',
                variant: 'warning',
                icon: 'bi-stop-circle-fill',
                text: 'Apakah Anda yakin ingin menghentikan eksekusi pengujian yang sedang berjalan?',
                confirmHtml: '<i class="bi bi-stop-circle me-1"></i> Ya, Hentikan'
            }).then(function(result) {
                if (!result.isConfirmed || !currentRunId) return;
                self.disabled = true; self.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Menghentikan...';
                fetch(BASE_URL + 'ai-automation-test/cancel/' + currentRunId, { method: 'POST', headers: getCsrfHeaders() })
                .then(function(r) { return r.json(); })
                .then(function() {
                    self.classList.add('d-none'); self.disabled = false; self.innerHTML = '<i class="bi bi-stop-circle me-1"></i> Hentikan';
                    if (btnRunTest)   btnRunTest.disabled = false;
                    if (pollInterval) clearInterval(pollInterval);
                    if (overallStatus) { overallStatus.className = 'status-pill status-pill-muted'; overallStatus.innerHTML = '<i class="bi bi-slash-circle"></i> DIBATALKAN'; }
                    if (resultSummary) resultSummary.textContent = 'Pengujian berhasil dihentikan oleh pengguna.';
                    showToast({ icon: 'warning', title: 'Pengujian Dihentikan', text: 'Eksekusi Playwright telah dibatalkan.' });
                })
                .catch(function(err) {
                    self.disabled = false;
                    self.innerHTML = '<i class="bi bi-stop-circle me-1"></i> Hentikan';
                    console.error(err);
                    showAlert({ variant: 'danger', icon: 'bi-x-circle-fill', title: 'Gagal Membatalkan', text: 'Gagal mengirim sinyal pembatalan ke runner.' });
                });
            });
        });
    }

    function computeMetrics(steps, data, runObj) {
        var passed   = (data.passed   != null) ? data.passed   : (runObj.passed_steps  || 0);
        var failed   = (data.failed   != null) ? data.failed   : (runObj.failed_steps  || 0);
        var skipped  = (data.skipped  != null) ? data.skipped  : (runObj.skipped_steps || 0);
        var duration = (data.duration_ms != null) ? data.duration_ms : (runObj.total_duration_ms || 0);
        if (steps.length > 0) {
            var pC = 0, fC = 0, sC = 0, durSum = 0;
            steps.forEach(function(s) { var r = (s.result||'').toUpperCase(); if(r==='PASS')pC++; else if(r==='FAIL')fC++; else if(r==='SKIPPED')sC++; if(s.duration_ms) durSum += Number(s.duration_ms); });
            if (pC > passed)  passed  = pC; if (fC > failed) failed = fC; if (sC > skipped) skipped = sC; if (duration === 0 && durSum > 0) duration = durSum;
        }
        return { passed: passed, failed: failed, skipped: skipped, duration: duration };
    }

    function updateProgressUI(metrics, totalSteps, completedCount) {
        var pct = totalSteps > 0 ? Math.min(100, Math.round((completedCount / totalSteps) * 100)) : 0;
        if (resultDuration)      resultDuration.innerHTML    = '<i class="bi bi-stopwatch"></i> ' + metrics.duration.toLocaleString() + ' ms';
        if (resultSummary)       resultSummary.textContent   = metrics.passed + ' Lolos | ' + metrics.failed + ' Gagal | ' + metrics.skipped + ' Dilewati (Total ' + totalSteps + ')';
        if (testProgressBar)     testProgressBar.style.width = pct + '%';
        if (progressPercentText) progressPercentText.textContent = 'Progres: ' + pct + '%';
    }

    function startPolling() {
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(function() {
            if (!currentRunId) { clearInterval(pollInterval); return; }
            fetch(BASE_URL + 'ai-automation-test/status/' + currentRunId)
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (!data.success) return;
                var runObj = data.run || {}, steps = data.steps || [];
                var plannedSteps = currentTestPlan ? (currentTestPlan.steps || []) : [];
                var totalSteps   = data.total_steps || runObj.total_steps || Math.max(plannedSteps.length, steps.length);
                var metrics      = computeMetrics(steps, data, runObj);
                var rawStatus    = (data.status || runObj.status || 'RUNNING').toUpperCase();
                if (rawStatus === 'QUEUED') {
                    if (queueArea && queueText) {
                        queueArea.classList.remove('d-none');
                        queueText.textContent = 'Pengujian berada dalam antrean berurutan (Posisi: ' + (data.queue_position || 1) + '). Menunggu pengujian sebelumnya selesai...';
                    }
                    if (overallStatus) {
                        overallStatus.className = 'pill-status pill-neutral ms-1 py-0 px-2';
                        overallStatus.innerHTML = '<i class="bi bi-hourglass-split"></i> QUEUED';
                    }
                    return;
                } else {
                    if (queueArea) queueArea.classList.add('d-none');
                    if (overallStatus && rawStatus === 'RUNNING') {
                        overallStatus.className = 'pill-status pill-running ms-1 py-0 px-2';
                        overallStatus.innerHTML = '<i class="bi bi-arrow-repeat"></i> RUNNING';
                    }
                }
                if (rawStatus === 'COMPLETED') rawStatus = (metrics.failed > 0) ? 'FAILED' : 'PASSED';
                var completedCount = metrics.passed + metrics.failed + metrics.skipped;
                if (rawStatus !== 'RUNNING' && totalSteps > 0 && completedCount >= totalSteps) rawStatus = (metrics.failed > 0) ? 'FAILED' : 'PASSED';
                updateProgressUI(metrics, totalSteps, completedCount);
                renderLiveSteps(steps, plannedSteps, rawStatus);
                if (rawStatus === 'PASSED' || rawStatus === 'FAILED' || rawStatus === 'CANCELLED') {
                    clearInterval(pollInterval);
                    if (btnRunTest)   btnRunTest.disabled = false;
                    if (btnCancelRun) btnCancelRun.classList.add('d-none');
                    if (testProgressBar) testProgressBar.classList.remove('progress-bar-animated', 'progress-bar-striped');
                    applyFinalStatus(rawStatus, metrics.passed, metrics.failed, metrics.duration);
                }
            })
            .catch(function(err) { console.error('Poll error:', err); });
        }, 250);
    }

    // =========================================================================
    // SECTION F - Live Steps Table
    // =========================================================================
    function buildLiveStepRow(planItem, idx, completedSteps, isFinished) {
        var stepNum = planItem.step_no || (idx + 1);
        var comp    = completedSteps.find(function(c) { return c.step_no === stepNum || completedSteps.indexOf(c) === idx; });
        var res = 'PENDING';
        if (comp) res = (comp.result || 'PASS').toUpperCase();
        else if (!isFinished && idx === completedSteps.length) res = 'RUNNING';
        var rowClass  = { RUNNING: 'row-running', PASS: 'row-passed', FAIL: 'row-failed' }[res] || '';
        var badgeHtml = getStatusBadge(res, 'pill');
        var durationMs= comp ? (comp.duration_ms    || 0) : 0;
        var retryCount= comp ? (comp.retry_count    || 0) : 0;
        var errorMsg  = comp ? (comp.error          || null) : null;
        var errorCat  = comp ? (comp.error_category || null) : null;
        var screenshot= comp ? (comp.screenshot     || null) : null;
        var domSnapshot=comp ? (comp.dom_snapshot   || null) : null;
        var rawTarget = planItem.target || (comp ? comp.target : null);
        var targetVal = '-';
        if (rawTarget) targetVal = typeof rawTarget === 'object' ? (rawTarget.value || JSON.stringify(rawTarget)) : rawTarget;
        else if (comp && comp.target_json) { try { targetVal = JSON.parse(comp.target_json).value || comp.target_json; } catch(e) { targetVal = comp.target_json; } }
        var errorHtml = errorMsg ? '<div><span class="badge bg-danger-subtle text-danger border border-danger mb-1">' + escapeHtml(errorCat||'ERROR') + '</span><div class="small text-danger text-truncate" style="max-width:200px;" title="' + escapeHtml(errorMsg) + '">' + escapeHtml(errorMsg) + '</div></div>' : '<span class="text-muted">-</span>';
        var assetBtns = '';
        if (screenshot) { var fn = screenshot.split(/[\\\/]/).pop(); assetBtns += '<button type="button" class="btn-secondary-clean btn-sm py-0 px-2 me-1 view-screenshot" data-src="' + BASE_URL + 'ai-automation-test/screenshot/' + encodeURIComponent(fn) + '"><i class="bi bi-camera"></i> Screen</button>'; }
        if (domSnapshot) assetBtns += '<button type="button" class="btn-secondary-clean btn-sm py-0 px-2 view-dom" data-dom="' + escapeHtml(domSnapshot) + '"><i class="bi bi-code-slash"></i> DOM</button>';
        if (!assetBtns) assetBtns = '<span class="text-muted">-</span>';
        var actionName = planItem.action || (comp ? (comp.action || comp.action_name) : '-');
        return '<tr class="' + rowClass + '"><td class="text-center fw-bold text-secondary">' + stepNum + '</td><td><span class="action-code-badge">' + escapeHtml(actionName) + '</span></td><td><small class="text-dark text-truncate d-inline-block" style="max-width:140px;" title="' + escapeHtml(targetVal) + '">' + escapeHtml(targetVal) + '</small></td><td>' + badgeHtml + '</td><td><small class="font-monospace">' + durationMs + ' ms</small></td><td class="text-center">' + retryCount + '</td><td>' + errorHtml + '</td><td class="text-end">' + assetBtns + '</td></tr>';
    }

    function renderLiveSteps(completedSteps, plannedSteps, runStatus) {
        completedSteps = completedSteps || []; plannedSteps = plannedSteps || []; runStatus = runStatus || 'RUNNING';
        if (!resultBody) return;
        var sourceList = (plannedSteps.length > 0) ? plannedSteps : completedSteps;
        if (!sourceList || sourceList.length === 0) { resultBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">Menunggu respons worker step pertama...</td></tr>'; return; }
        var isFinished = (runStatus === 'PASSED' || runStatus === 'FAILED' || runStatus === 'CANCELLED' || runStatus === 'IDLE' || runStatus === 'REJECTED');
        resultBody.innerHTML = sourceList.map(function(planItem, idx) { return buildLiveStepRow(planItem, idx, completedSteps, isFinished); }).join('');
    }

    // =========================================================================
    // SECTION G - Final Status
    // =========================================================================
    function applyFinalStatus(status, passed, failed, duration) {
        var CONFIGS = {
            PASSED:    { barClass: 'progress-bar bg-success', pillClass: 'status-pill-passed', pillHtml: '<i class="bi bi-check-circle-fill me-1"></i> PASSED',   alertClass: 'alert-success', noticeIcon: 'check-circle-fill text-success',         alertText: 'Pengujian Selesai: Seluruh ' + passed + ' langkah lolos (' + duration.toLocaleString() + ' ms).' },
            FAILED:    { barClass: 'progress-bar bg-danger',  pillClass: 'status-pill-failed', pillHtml: '<i class="bi bi-x-circle-fill me-1"></i> FAILED',       alertClass: 'alert-danger',  noticeIcon: 'exclamation-triangle-fill text-danger', alertText: 'Pengujian Selesai: ' + passed + ' langkah lolos, ' + failed + ' langkah gagal. Periksa baris merah.' },
            CANCELLED: { barClass: 'progress-bar bg-warning', pillClass: 'status-pill-muted',  pillHtml: '<i class="bi bi-slash-circle me-1"></i> CANCELLED',     alertClass: 'alert-warning', noticeIcon: 'slash-circle text-warning',              alertText: 'Pengujian dibatalkan oleh pengguna.' }
        };
        var cfg = CONFIGS[status] || CONFIGS.CANCELLED;
        if (testProgressBar) testProgressBar.className = cfg.barClass;
        if (overallStatus)   { overallStatus.className = 'pill-status ' + cfg.pillClass + ' ms-1 py-0 px-2'; overallStatus.innerHTML = cfg.pillHtml; }
        if (executionNotice) {
            executionNotice.className = 'alert ' + cfg.alertClass + ' py-2 px-3 mt-2 mb-0 small d-flex align-items-center gap-2';
            if (executionNoticeIcon) executionNoticeIcon.className = 'bi bi-' + cfg.noticeIcon + ' fs-6';
            if (executionNoticeText) executionNoticeText.textContent = cfg.alertText;
            executionNotice.classList.remove('d-none');
        }
    }

    // =========================================================================
    // SECTION H - Copy DOM
    // =========================================================================
    function initCopyDom() {
        if (!btnCopyDom) return;
        btnCopyDom.addEventListener('click', function() {
            var self = this, orig = this.innerHTML;
            navigator.clipboard.writeText(domContent ? domContent.textContent : '').then(function() {
                self.innerHTML = '<i class="bi bi-check2 text-success"></i> Tersalin!';
                setTimeout(function() { self.innerHTML = orig; }, 1500);
            });
        });
    }

    // =========================================================================
    // SECTION I - Studio Card Height Synchronization
    // =========================================================================
    function initStudioCardHeightSync() {
        var leftCard  = document.getElementById('studioLeftCard');
        var rightCard = document.getElementById('studioRightCard');
        if (!leftCard || !rightCard) return;

        function syncHeight() {
            if (window.innerWidth >= 992) {
                var h = Math.round(leftCard.offsetHeight);
                if (h > 100) {
                    rightCard.style.height = h + 'px';
                    rightCard.style.maxHeight = h + 'px';
                }
            } else {
                rightCard.style.height = '';
                rightCard.style.maxHeight = '';
            }
        }

        if (window.ResizeObserver) {
            var ro = new ResizeObserver(function() {
                syncHeight();
            });
            ro.observe(leftCard);
        }

        window.addEventListener('resize', syncHeight);
        requestAnimationFrame(syncHeight);
        setTimeout(syncHeight, 150);
    }

    // =========================================================================
    // SECTION J - Batch Parallel Regression Runner (FR-12)
    // =========================================================================
    var batchRunnerCard       = document.getElementById('batchRunnerCard');
    var batchCasesContainer   = document.getElementById('batchCasesContainer');
    var batchModuleTitle      = document.getElementById('batchModuleTitle');
    var batchSelectedCountEl  = document.getElementById('batchSelectedCount');
    var batchBrowserModeSelect= document.getElementById('batchBrowserModeSelect');
    var btnBatchSelectMax     = document.getElementById('btnBatchSelectMax');
    var btnBatchSelectAll     = document.getElementById('btnBatchSelectAll');
    var btnBatchClearSelection= document.getElementById('btnBatchClearSelection');
    var btnRunBatch           = document.getElementById('btnRunBatch');
    var btnRunBatchLabel      = document.getElementById('btnRunBatchLabel');
    var btnCancelBatch        = document.getElementById('btnCancelBatch');
    var batchWriteWarning     = document.getElementById('batchWriteWarning');
    var batchCountRunning     = document.getElementById('batchCountRunning');
    var batchCountQueued      = document.getElementById('batchCountQueued');
    var batchCountPassed      = document.getElementById('batchCountPassed');
    var batchCountFailed      = document.getElementById('batchCountFailed');
    var batchProgressText     = document.getElementById('batchProgressText');
    var batchProgressSummary  = document.getElementById('batchProgressSummary');
    var batchProgressBar      = document.getElementById('batchProgressBar');
    var batchMonitorBody      = document.getElementById('batchMonitorBody');

    var maxParallelSlots = batchRunnerCard ? (parseInt(batchRunnerCard.getAttribute('data-max-parallel'), 10) || 4) : 4;
    var currentBatchId   = null;
    var batchPollTimer   = null;

    function getCheckedBatchCheckboxes() {
        if (!batchCasesContainer) return [];
        return Array.prototype.slice.call(batchCasesContainer.querySelectorAll('.js-batch-case-check:checked'));
    }

    function updateBatchSelectionState() {
        var checked = getCheckedBatchCheckboxes();
        var count = checked.length;
        if (batchSelectedCountEl) batchSelectedCountEl.textContent = String(count);
        if (btnRunBatch) {
            btnRunBatch.disabled = (count === 0 || currentBatchId !== null);
            if (count > 0) {
                var parallelNow = Math.min(count, maxParallelSlots);
                var queuedLater = Math.max(0, count - maxParallelSlots);
                btnRunBatch.title = 'Jalankan ' + count + ' skenario secara paralel (' + parallelNow + ' jalan bersamaan' + (queuedLater > 0 ? ', ' + queuedLater + ' mengantre' : '') + ')';
            } else {
                btnRunBatch.title = 'Pilih setidaknya 1 skenario tersimpan untuk dieksekusi';
            }
        }
        if (btnRunBatchLabel) {
            if (count > 0) {
                var parallelNow = Math.min(count, maxParallelSlots);
                var queuedLater = Math.max(0, count - maxParallelSlots);
                btnRunBatchLabel.textContent = queuedLater > 0
                    ? ('Jalankan ' + count + ' Paralel (' + queuedLater + ' Antre)')
                    : ('Jalankan ' + count + ' Paralel');
            } else {
                btnRunBatchLabel.textContent = 'Jalankan Paralel';
            }
        }
        var hasWriteTest = checked.some(function(cb) { return cb.getAttribute('data-mode') === 'write_test'; });
        if (batchWriteWarning) {
            batchWriteWarning.classList.toggle('d-none', !(hasWriteTest && count > 1));
        }
    }

    function renderBatchSavedCases(cases, moduleName) {
        if (!batchCasesContainer) return;
        if (batchModuleTitle) {
            batchModuleTitle.textContent = moduleName ? moduleName : 'Pilih Modul di Panel 1';
        }
        if (!cases || cases.length === 0) {
            batchCasesContainer.innerHTML = '<div class="text-center text-muted py-5 small"><i class="bi bi-journal-bookmark fs-3 d-block mb-2 opacity-50"></i>' +
                (moduleName ? 'Belum ada skenario tersimpan pada modul <strong>' + escapeHtml(moduleName) + '</strong>.' : 'Pilih <strong>Target Modul Bisnis</strong> pada Panel 1 di atas untuk memuat daftar skenario tersimpan.') +
                '</div>';
            updateBatchSelectionState();
            return;
        }

        var html = '<div class="row g-2">';
        cases.forEach(function(c, idx) {
            var mode = c.mode || 'read_only';
            var isWrite = mode === 'write_test';
            var modeBadge = isWrite
                ? '<span class="badge bg-warning-subtle text-warning border border-warning-subtle font-monospace" style="font-size:0.68rem;">write_test</span>'
                : '<span class="badge bg-success-subtle text-success border border-success-subtle font-monospace" style="font-size:0.68rem;">read_only</span>';
            var stepCount = 0;
            try {
                var parsed = JSON.parse(c.test_plan_json || '{}');
                stepCount = Array.isArray(parsed.steps) ? parsed.steps.length : 0;
            } catch (e) {}

            var checkId = 'batchCaseCheck_' + c.id;
            html += '<div class="col-md-6">' +
                '<label class="d-flex align-items-start gap-2 p-2 rounded-2 border bg-white h-100 shadow-xs batch-case-item" for="' + checkId + '" style="cursor:pointer;">' +
                '<input type="checkbox" class="form-check-input mt-1 flex-shrink-0 js-batch-case-check" id="' + checkId + '" value="' + c.id + '" data-mode="' + escapeHtml(mode) + '" data-name="' + escapeHtml(c.test_name || '') + '">' +
                '<div class="flex-grow-1 overflow-hidden">' +
                '<div class="fw-semibold text-dark small text-truncate" title="' + escapeHtml(c.test_name || '') + '">' + (idx + 1) + '. ' + escapeHtml(c.test_name || 'Skenario #' + c.id) + '</div>' +
                '<div class="d-flex align-items-center gap-1 mt-1 flex-wrap">' +
                modeBadge +
                '<span class="badge bg-light text-secondary border" style="font-size:0.68rem;">' + stepCount + ' langkah</span>' +
                '</div>' +
                '</div>' +
                '</label>' +
                '</div>';
        });
        html += '</div>';
        batchCasesContainer.innerHTML = html;

        batchCasesContainer.querySelectorAll('.js-batch-case-check').forEach(function(cb) {
            cb.addEventListener('change', updateBatchSelectionState);
        });
        updateBatchSelectionState();
    }

    function renderBatchMonitorItems(data) {
        if (!batchMonitorBody) return;
        var counts = data.counts || { running: 0, queued: 0, passed: 0, failed: 0, cancelled: 0 };
        if (batchCountRunning) batchCountRunning.textContent = String(counts.running || 0);
        if (batchCountQueued)  batchCountQueued.textContent  = String(counts.queued  || 0);
        if (batchCountPassed)  batchCountPassed.textContent  = String(counts.passed  || 0);
        if (batchCountFailed)  batchCountFailed.textContent  = String(counts.failed  || 0);

        var pct = data.progress_percent || 0;
        var total = data.total || 0;
        var finished = data.finished || 0;
        if (batchProgressBar) {
            batchProgressBar.style.width = pct + '%';
            if (data.is_done) {
                batchProgressBar.className = (counts.failed > 0) ? 'progress-bar bg-danger' : 'progress-bar bg-success';
            } else {
                batchProgressBar.className = 'progress-bar bg-primary progress-bar-striped progress-bar-animated';
            }
        }
        if (batchProgressText) {
            batchProgressText.textContent = data.is_done
                ? ('Batch Selesai (' + pct + '%)')
                : ('Menjalankan Paralel... (' + pct + '%)');
        }
        if (batchProgressSummary) {
            batchProgressSummary.textContent = finished + ' / ' + total + ' Skenario Selesai';
        }

        var items = data.items || [];
        if (items.length === 0) {
            batchMonitorBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4 small">Tidak ada data eksekusi batch.</td></tr>';
            return;
        }

        batchMonitorBody.innerHTML = items.map(function(item) {
            var st = (item.status || 'QUEUED').toUpperCase();
            var badge = getStatusBadge(st, 'badge');
            var durText = item.duration_ms ? (Number(item.duration_ms).toLocaleString() + ' ms') : '-';
            var stepsText = (item.passed_steps || 0) + ' / ' + (item.total_steps || 0);
            return '<tr>' +
                '<td class="ps-2 fw-bold text-secondary">#' + item.run_id + '</td>' +
                '<td><div class="fw-semibold text-dark text-truncate" style="max-width:170px;" title="' + escapeHtml(item.test_name || '') + '">' + escapeHtml(item.test_name || ('Run #' + item.run_id)) + '</div></td>' +
                '<td class="text-center"><span class="badge bg-light text-dark border font-monospace" style="font-size:0.68rem;">' + escapeHtml(item.mode || 'read_only') + '</span></td>' +
                '<td class="text-center"><span class="badge bg-light text-dark border fw-normal">' + stepsText + '</span></td>' +
                '<td class="text-end font-monospace small">' + durText + '</td>' +
                '<td class="text-center">' + badge + '</td>' +
                '<td class="text-end pe-2">' +
                '<button type="button" class="btn btn-sm btn-outline-primary py-0 px-2 js-open-run-detail" data-run-id="' + item.run_id + '" title="Lihat Detail Langkah & Artefak"><i class="bi bi-eye"></i></button>' +
                '</td>' +
                '</tr>';
        }).join('');
    }

    function startBatchPolling(batchId) {
        if (batchPollTimer) clearInterval(batchPollTimer);
        currentBatchId = batchId;

        function pollOnce() {
            if (!currentBatchId) {
                clearInterval(batchPollTimer);
                return;
            }
            fetch(BASE_URL + 'ai-automation-test/batch-status/' + encodeURIComponent(currentBatchId))
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (!data || !data.success) return;
                renderBatchMonitorItems(data);
                if (data.is_done) {
                    clearInterval(batchPollTimer);
                    batchPollTimer = null;
                    currentBatchId = null;
                    if (btnCancelBatch) btnCancelBatch.classList.add('d-none');
                    updateBatchSelectionState();
                    var c = data.counts || {};
                    showToast({
                        icon: (c.failed > 0) ? 'warning' : 'success',
                        title: 'Batch Paralel Selesai',
                        text: (c.passed || 0) + ' skenario lolos, ' + (c.failed || 0) + ' gagal.'
                    });
                }
            })
            .catch(function(err) { console.error('Batch poll error:', err); });
        }

        pollOnce();
        batchPollTimer = setInterval(pollOnce, 600);
    }

    function initBatchRunner() {
        if (!batchRunnerCard) return;

        if (batchBrowserModeSelect) {
            var savedBatchMode = localStorage.getItem('ejatra_batch_headless');
            if (savedBatchMode !== null) batchBrowserModeSelect.value = savedBatchMode;
            batchBrowserModeSelect.addEventListener('change', function() {
                localStorage.setItem('ejatra_batch_headless', this.value);
            });
        }

        if (btnBatchSelectMax) {
            btnBatchSelectMax.addEventListener('click', function() {
                if (!batchCasesContainer) return;
                var all = Array.prototype.slice.call(batchCasesContainer.querySelectorAll('.js-batch-case-check'));
                all.forEach(function(cb, idx) { cb.checked = (idx < maxParallelSlots); });
                updateBatchSelectionState();
            });
        }

        if (btnBatchSelectAll) {
            btnBatchSelectAll.addEventListener('click', function() {
                if (!batchCasesContainer) return;
                batchCasesContainer.querySelectorAll('.js-batch-case-check').forEach(function(cb) { cb.checked = true; });
                updateBatchSelectionState();
            });
        }

        if (btnBatchClearSelection) {
            btnBatchClearSelection.addEventListener('click', function() {
                if (!batchCasesContainer) return;
                batchCasesContainer.querySelectorAll('.js-batch-case-check').forEach(function(cb) { cb.checked = false; });
                updateBatchSelectionState();
            });
        }

        if (btnRunBatch) {
            btnRunBatch.addEventListener('click', function() {
                var checked = getCheckedBatchCheckboxes();
                if (checked.length === 0) {
                    showToast({ icon: 'warning', title: 'Pilih Skenario', text: 'Centang minimal 1 skenario tersimpan untuk dijalankan.' });
                    return;
                }
                var caseIds = checked.map(function(cb) { return parseInt(cb.value, 10); });
                var isHeadless = batchBrowserModeSelect ? (batchBrowserModeSelect.value === 'true') : true;
                var targetUrl = targetUrlInput ? targetUrlInput.value.trim() : '';

                btnRunBatch.disabled = true;
                if (btnCancelBatch) {
                    btnCancelBatch.classList.remove('d-none');
                    btnCancelBatch.disabled = false;
                }
                if (batchProgressText) batchProgressText.textContent = 'Mengirim batch ke Playwright Parallel Runner...';

                fetch(BASE_URL + 'ai-automation-test/run-batch', {
                    method: 'POST',
                    headers: getCsrfHeaders(),
                    body: JSON.stringify({
                        case_ids: caseIds,
                        headless: isHeadless,
                        target_url: targetUrl
                    })
                })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success && data.batch_id) {
                        showToast({
                            icon: 'info',
                            title: 'Batch Paralel Dimulai',
                            text: data.dispatched + ' skenario dikirim (Maks ' + maxParallelSlots + ' browser paralel sekaligus).'
                        });
                        startBatchPolling(data.batch_id);
                    } else {
                        if (btnCancelBatch) btnCancelBatch.classList.add('d-none');
                        updateBatchSelectionState();
                        showAlert({ variant: 'danger', icon: 'bi-exclamation-octagon-fill', title: 'Gagal Menjalankan Batch', text: data.error || 'Gagal memulai eksekusi batch.' });
                    }
                })
                .catch(function(err) {
                    console.error(err);
                    if (btnCancelBatch) btnCancelBatch.classList.add('d-none');
                    updateBatchSelectionState();
                    showAlert({ variant: 'danger', icon: 'bi-wifi-off', title: 'Koneksi Gagal', text: 'Gagal menghubungi server untuk menjalankan batch.' });
                });
            });
        }

        if (btnCancelBatch) {
            btnCancelBatch.addEventListener('click', function() {
                if (!currentBatchId) return;
                var batchToCancel = currentBatchId;
                showConfirm({
                    title: 'Hentikan Eksekusi Batch Paralel?',
                    subtitle: 'Parallel Batch Runner',
                    variant: 'warning',
                    icon: 'bi-stop-circle-fill',
                    text: 'Seluruh skenario yang sedang berjalan maupun yang mengantre pada batch ini akan dihentikan.',
                    confirmHtml: '<i class="bi bi-stop-circle me-1"></i> Ya, Hentikan Batch'
                }).then(function(res) {
                    if (!res.isConfirmed) return;
                    btnCancelBatch.disabled = true;
                    fetch(BASE_URL + 'ai-automation-test/cancel-batch/' + encodeURIComponent(batchToCancel), {
                        method: 'POST',
                        headers: getCsrfHeaders()
                    })
                    .then(function(r) { return r.json(); })
                    .then(function() {
                        if (batchPollTimer) clearInterval(batchPollTimer);
                        batchPollTimer = null;
                        currentBatchId = null;
                        btnCancelBatch.classList.add('d-none');
                        btnCancelBatch.disabled = false;
                        updateBatchSelectionState();
                        if (batchProgressText) batchProgressText.textContent = 'Batch Dibatalkan';
                        showToast({ icon: 'warning', title: 'Batch Dihentikan', text: 'Seluruh pengujian dalam batch telah dibatalkan.' });
                    })
                    .catch(function(err) {
                        btnCancelBatch.disabled = false;
                        console.error(err);
                    });
                });
            });
        }
    }

    // =========================================================================
    // BOOTSTRAP
    // =========================================================================
    initStudioCardHeightSync();
    initBrowserDisplay();
    initStudioTabs();
    initProviderModel();
    initQuickInsert();
    initCounters();
    initModeHelp();
    initModuleSelect();
    initAddModule();
    initEditModule();
    initDeleteModule();
    initSavedCaseSelect();
    initEditSavedCase();
    initDeleteSavedCase();
    initResetBrowser();
    initGeneratePlan();
    initSaveCase();
    initRunTest();
    initCancelRun();
    initCopyDom();
    initBatchRunner();

    // Note: auto-reset on page load removed to support parallel test execution.
    // Use the "Reset Browser" button in the UI to manually clean up sessions when needed.
    window.addEventListener('beforeunload', function() {
        if (currentRunId || currentBatchId) { try { navigator.sendBeacon(BASE_URL + 'ai-automation-test/cancel-all'); } catch(e) {} }
    });
});
