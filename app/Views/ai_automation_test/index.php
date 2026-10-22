<?= $this->extend('layouts/main') ?>

<?= $this->section('title') ?>AI Automation Testing Studio — e-Jatra<?= $this->endSection() ?>

<?= $this->section('content') ?>
<div class="container-fluid px-3 px-lg-4">
    
    <!-- Header Banner & Stats Toolbar -->
    <?= $this->include('ai_automation_test/partials/_header_stats') ?>

    <!-- Baris 1: Skenario & Review Test Plan (Berdampingan di Desktop) -->
    <div class="row g-4 mb-4 align-items-stretch">
        
        <!-- Kolom Kiri: Input Form & Parameter (Section 1) -->
        <div class="col-lg-5 d-flex flex-column">
            <?= $this->include('ai_automation_test/partials/_test_form') ?>
        </div>

        <!-- Kolom Kanan: Review Test Plan (Section 2 & Placeholder) -->
        <div class="col-lg-7 d-flex flex-column" style="min-height: 0;">
            <?= $this->include('ai_automation_test/partials/_plan_preview') ?>
        </div>

    </div>

    <!-- Baris 2: Eksekusi Paralel Skenario Tersimpan / Batch Runner (Section 4) -->
    <?= $this->include('ai_automation_test/partials/_batch_runner') ?>

</div>

<!-- Modal: Execution Run Detail & Artifact Inspector (Shared for Batch & History) -->
<?= $this->include('ai_automation_test/partials/_run_detail_modal') ?>

<!-- Modal: Knowledge Base & Page Scan Explorer -->
<?= $this->include('ai_automation_test/partials/_scan_modal') ?>

<?= $this->endSection() ?>

<?= $this->section('scripts') ?>
<script src="<?= base_url('assets/js/qa-utils.js?v=' . time()) ?>"></script>
<script src="<?= base_url('assets/js/qa-history.js?v=' . time()) ?>"></script>
<script src="<?= base_url('assets/js/qa-studio.js?v=' . time()) ?>"></script>
<?= $this->include('ai_automation_test/partials/_scanner_script') ?>
<?= $this->endSection() ?>
