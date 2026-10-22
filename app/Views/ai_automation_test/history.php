<?= $this->extend('layouts/main') ?>

<?= $this->section('title') ?>Riwayat Pengujian — e-Jatra AI Automation Studio<?= $this->endSection() ?>

<?= $this->section('content') ?>
<div class="container-fluid px-3 px-lg-4">
    
    <!-- Header Banner & Stats Toolbar -->
    <?= $this->include('ai_automation_test/partials/_header_stats') ?>

    <!-- Dedicated Full-Page Execution History Table -->
    <?= $this->include('ai_automation_test/partials/_history_table') ?>

</div>

<!-- Modal: Knowledge Base & Page Scan Explorer -->
<?= $this->include('ai_automation_test/partials/_scan_modal') ?>

<?= $this->endSection() ?>

<?= $this->section('scripts') ?>
<script src="<?= base_url('assets/js/qa-utils.js?v=' . time()) ?>"></script>
<script src="<?= base_url('assets/js/qa-history.js?v=' . time()) ?>"></script>
<?= $this->include('ai_automation_test/partials/_scanner_script') ?>
<?= $this->endSection() ?>
