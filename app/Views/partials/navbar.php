<?php
$currentUri = uri_string();
$isStudioActive = ($currentUri === '' || $currentUri === '/' || $currentUri === 'ai-automation-test');
$isHistoryActive = (strpos($currentUri, 'ai-automation-test/history') !== false || strpos($currentUri, 'ai-automation-test/detail') !== false);
?>
<nav class="navbar navbar-expand-lg qa-topbar py-2">
    <div class="container-fluid px-4">
        <!-- Brand / Logo -->
        <a class="navbar-brand d-flex align-items-center gap-2 text-decoration-none py-1" href="<?= base_url('ai-automation-test') ?>">
            <div class="qa-logo-badge">
                <i class="bi bi-robot"></i>
            </div>
            <div>
                <div class="fw-bold text-dark lh-1" style="font-size: 1rem; letter-spacing: -0.02em;">e-Jatra QA</div>
                <div class="text-secondary small fw-medium" style="font-size: 0.72rem;">AI Automation Testing Studio</div>
            </div>
        </a>

        <button class="navbar-toggler border-0" type="button" data-bs-dismiss="false" data-bs-toggle="collapse" data-bs-target="#qaNavbarContent" aria-controls="qaNavbarContent" aria-expanded="false" aria-label="Toggle navigation">
            <span class="navbar-toggler-icon"></span>
        </button>

        <div class="collapse navbar-collapse" id="qaNavbarContent">
            <!-- Navigation Links -->
            <ul class="navbar-nav me-auto mb-2 mb-lg-0 ms-lg-3 gap-1">
                <li class="nav-item">
                    <a class="qa-nav-link <?= $isStudioActive ? 'active' : '' ?>" href="<?= base_url('ai-automation-test') ?>">
                        <i class="bi bi-terminal-split"></i> Studio
                    </a>
                </li>
                <li class="nav-item">
                    <a class="qa-nav-link <?= $isHistoryActive ? 'active' : '' ?>" href="<?= base_url('ai-automation-test/history') ?>">
                        <i class="bi bi-clock-history"></i> Riwayat Pengujian
                    </a>
                </li>
            </ul>

            <!-- Right Status & Environment Info -->
            <div class="d-flex align-items-center gap-3">
                <div class="d-none d-md-flex align-items-center gap-2 bg-light px-2.5 py-1 rounded-pill border" style="font-size: 0.75rem;">
                    <span class="badge <?= ENVIRONMENT === 'development' ? 'bg-primary text-white' : (ENVIRONMENT === 'testing' ? 'bg-info text-dark' : 'bg-warning text-dark') ?> rounded-pill" style="font-size: 0.68rem;">
                        <?= strtoupper(ENVIRONMENT) ?>
                    </span>
                    <span class="text-secondary">CI4 v<?= \CodeIgniter\CodeIgniter::CI_VERSION ?></span>
                </div>
                
                <div class="d-flex align-items-center gap-2 text-secondary" style="font-size: 0.8rem;">
                    <span class="pulse-dot text-success"></span>
                    <span class="fw-medium text-dark">Playwright Runner :3001</span>
                </div>
            </div>
        </div>
    </div>
</nav>
