<?php

use CodeIgniter\Router\RouteCollection;

/**
 * @var RouteCollection $routes
 */

// Default root route points directly to AI Automation Testing Studio
$routes->get('/', 'AiAutomationTest::index');

// AI Automation Testing Routes Group
$routes->group('ai-automation-test', function ($routes) {
    $routes->get('/', 'AiAutomationTest::index');
    $routes->get('providers', 'AiAutomationTest::getProviders');
    $routes->post('generate-plan', 'AiAutomationTest::generatePlan');
    $routes->post('save-case', 'AiAutomationTest::savePlan');
    $routes->post('run', 'AiAutomationTest::runTest');
    $routes->post('run-batch', 'AiAutomationTest::runBatch');
    $routes->get('batch-status/(:segment)', 'AiAutomationTest::batchStatus/$1');
    $routes->post('cancel-batch/(:segment)', 'AiAutomationTest::cancelBatch/$1');
    $routes->get('status/(:num)', 'AiAutomationTest::getStatus/$1');
    $routes->post('callback', 'AiAutomationTest::callback');
    $routes->get('history', 'AiAutomationTest::history');
    $routes->get('detail/(:num)', 'AiAutomationTest::detail/$1');
    $routes->get('saved-cases', 'AiAutomationTest::getSavedCases');
    $routes->delete('saved-case/(:num)', 'AiAutomationTest::deleteSavedCase/$1');
    $routes->post('delete-case/(:num)', 'AiAutomationTest::deleteSavedCase/$1');
    $routes->post('update-case-name/(:num)', 'AiAutomationTest::updateCaseName/$1');
    $routes->get('modules', 'AiAutomationTest::getModules');
    $routes->post('save-module', 'AiAutomationTest::saveModule');
    $routes->post('update-module/(:num)', 'AiAutomationTest::updateModule/$1');
    $routes->delete('module/(:num)', 'AiAutomationTest::deleteModule/$1');
    $routes->post('delete-module/(:num)', 'AiAutomationTest::deleteModule/$1');
    $routes->post('cancel/(:num)', 'AiAutomationTest::cancelRun/$1');
    $routes->post('cancel-all', 'AiAutomationTest::cancelAll');
    $routes->post('reset-browser', 'AiAutomationTest::resetBrowser');
    $routes->post('delete-run/(:num)', 'AiAutomationTest::deleteRun/$1');
    $routes->delete('delete-run/(:num)', 'AiAutomationTest::deleteRun/$1');
    $routes->get('export-json/(:num)', 'AiAutomationTest::exportJson/$1');
    $routes->get('screenshot/(:segment)', 'AiAutomationTest::screenshot/$1');
    // Page Scanner Routes
    $routes->post('scan', 'AiAutomationTest::triggerScan');
    $routes->post('scan-callback', 'AiAutomationTest::scanCallback');
    $routes->get('scan-status', 'AiAutomationTest::scanStatus');
    $routes->get('scan-pages', 'AiAutomationTest::getScanPages');
    $routes->get('scan-page-elements', 'AiAutomationTest::getScanPageElements');
});