<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= $this->renderSection('title') ?: 'AI Automation Testing Studio — e-Jatra' ?></title>
    
    <!-- Meta & CSRF -->
    <meta name="csrf-token" content="<?= csrf_hash() ?>">
    <meta name="csrf-header" content="<?= csrf_header() ?>">
    <meta name="description" content="e-Jatra AI Automation Testing Studio and Autonomous Test Runner">

    <!-- Google Fonts: Inter & JetBrains Mono -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">

    <!-- Bootstrap 5.3.3 & Bootstrap Icons -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
    
    <!-- Custom Application CSS -->
    <link rel="stylesheet" href="<?= base_url('assets/css/ai-automation-test.css?v=' . @filemtime(FCPATH . 'assets/css/ai-automation-test.css')) ?>">
    
    <!-- Page Specific Styles -->
    <?= $this->renderSection('styles') ?>
</head>
<body>

    <!-- Top Navigation Bar Partial -->
    <?= $this->include('partials/navbar') ?>

    <!-- Main Content Container -->
    <main class="py-4">
        <?= $this->renderSection('content') ?>
    </main>

    <!-- Global Modals Partial (Screenshots, DOM Snapshot Inspector, Custom Studio Dialog) -->
    <?= $this->include('partials/modals') ?>

    <!-- Bootstrap Bundle JS & SweetAlert2 -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <script>
        const BASE_URL = '<?= rtrim(base_url(), '/') . '/' ?>';
    </script>
    
    <!-- Page Specific Scripts -->
    <?= $this->renderSection('scripts') ?>
</body>
</html>
