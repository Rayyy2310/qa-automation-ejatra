/**
 * pageScanner.js — High-Speed & Resilient Auto-Discovery Page Scanner
 * Playwright pure automation, NO LLM required.
 * 
 * Explores all e-Jatra submenus and module toolbars rapidly,
 * extracts DOM interactive elements (inputs, dropdowns, buttons, tables),
 * builds hierarchical categories, and dispatches to CI4 callback.
 */

const path = require('path');
const dotenv = require('dotenv');
const { chromium } = require('playwright');
const axios = require('axios');
const { waitReady, explorePageState } = require('./stateExplorer');
const appProfile = require('../utils/appProfile');

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

/**
 * Periksa apakah URL masih berada di halaman login (/masuk, /login, atau root '/').
 */
function isUnauthenticatedUrl(url) {
  if (!url) return true;
  const lower = String(url).toLowerCase().trim();
  if (/\/(masuk|login)(?:[/?#]|$)/.test(lower)) return true;
  try {
    const parsed = new URL(lower);
    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    if (cleanPath === '') return true;
  } catch {}
  return false;
}

/**
 * Periksa apakah halaman saat ini menampilkan form login (baik via URL maupun keberadaan input password).
 */
async function isOnLoginPage(page) {
  const url = page.url();
  if (isUnauthenticatedUrl(url)) return true;
  const loginFormSel = appProfile.get('loginForm', 'form[action*="masuk" i], form[action*="login" i]');
  const hasPassField = (await page.locator(`${loginFormSel}:visible, input[name="password"]:visible, input[type="password"]:visible`).count().catch(() => 0)) > 0;
  return hasPassField;
}

/**
 * Lakukan login ke e-Jatra secara tangguh (hingga 3 percobaan) dan pastikan sudah keluar dari halaman login.
 */
async function authenticateScanner(page, cleanBaseUrl, username, password) {
  console.log(`[Scanner] Navigating to ${cleanBaseUrl} (user: ${username})`);
  await page.goto(cleanBaseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await waitReady(page);

  if (!(await isOnLoginPage(page))) {
    console.log(`[Scanner] Already authenticated at ${page.url()}`);
    return true;
  }

  const usernameSel = appProfile.get('loginUsernameSelector', 'input[name="username"], input[type="text"]');
  const passwordSel = appProfile.get('loginPasswordSelector', 'input[name="password"], input[type="password"]');
  const recaptchaSel = appProfile.get('loginRecaptchaSelector', '.g-recaptcha, [id*="recaptcha" i]');
  const submitSel = appProfile.get('loginSubmitSelector', 'button:has-text("Masuk"), button[type="submit"], .btn-primary');

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (!(await isOnLoginPage(page))) break;

    // Tutup popup SweetAlert sisa (misal: peringatan sesi habis saat redirect ke /masuk) sebelum mengisi form
    const preSwalBtn = page.locator('.swal2-popup:visible .swal2-confirm, .swal2-container:visible button.swal2-confirm').first();
    if ((await preSwalBtn.count().catch(() => 0)) > 0 && (await preSwalBtn.isVisible().catch(() => false))) {
      await preSwalBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(400);
    }

    const usernameInput = page.locator(usernameSel).first();
    const passwordInput = page.locator(passwordSel).first();

    if ((await usernameInput.count().catch(() => 0)) === 0 || (await passwordInput.count().catch(() => 0)) === 0) {
      await page.goto(`${cleanBaseUrl}/masuk`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      await waitReady(page);
    }

    // Beri jeda singkat agar Google reCAPTCHA siap di halaman login
    const hasRecaptcha = (await page.locator(recaptchaSel).count().catch(() => 0)) > 0;
    if (hasRecaptcha) {
      await page.waitForTimeout(1200);
    }

    await usernameInput.click({ force: true }).catch(() => {});
    await usernameInput.fill(username);
    await usernameInput.evaluate(el => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }).catch(() => {});

    await passwordInput.click({ force: true }).catch(() => {});
    await passwordInput.fill(password);
    await passwordInput.evaluate(el => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }).catch(() => {});

    const loginBtn = page.locator(submitSel).first();
    if ((await loginBtn.count().catch(() => 0)) > 0) {
      console.log(`[Scanner] Submitting login (attempt ${attempt}/3)...`);
      await loginBtn.click({ force: true }).catch(async () => {
        await passwordInput.press('Enter').catch(() => {});
      });
    } else {
      await passwordInput.press('Enter').catch(() => {});
    }

    // Tunggu perpindahan URL keluar dari halaman login atau kemunculan popup
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(450);

      const swalBtn = page.locator('.swal2-popup:visible .swal2-confirm, .swal2-actions:visible button, .modal.show:visible .btn-primary, button:has-text("OK"):visible, button:has-text("Mengerti"):visible').first();
      const swalVisible = (await swalBtn.count().catch(() => 0)) > 0 && (await swalBtn.isVisible().catch(() => false));
      const stillOnLogin = await isOnLoginPage(page);

      if (!stillOnLogin) {
        // Sudah berpindah ke halaman terautentikasi (misal /halaman-utama)
        if (swalVisible) {
          console.log('[Scanner] Dismissing post-login welcome popup...');
          await swalBtn.click({ force: true }).catch(() => {});
          await page.waitForTimeout(500);
        }
        break;
      }

      if (swalVisible) {
        // Popup muncul ketika masih di halaman login (bisa jadi notifikasi error/captcha atau konfirmasi sebelum redirect)
        console.log('[Scanner] Dismissing popup on login page...');
        await swalBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(800);
        if (!(await isOnLoginPage(page))) {
          break;
        }
        break;
      }
    }

    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
    if (!(await isOnLoginPage(page))) {
      // Pastikan popup pasca-login di halaman-utama sudah tertutup
      const postSwal = page.locator('.swal2-popup:visible .swal2-confirm, button:has-text("OK"):visible, button:has-text("Mengerti"):visible').first();
      if ((await postSwal.count().catch(() => 0)) > 0 && (await postSwal.isVisible().catch(() => false))) {
        await postSwal.click({ force: true }).catch(() => {});
        await page.waitForTimeout(400);
      }
      console.log(`[Scanner] Login berhasil pada percobaan ${attempt}. Landing URL: ${page.url()}`);
      return true;
    }

    console.warn(`[Scanner] Percobaan login ${attempt} belum keluar dari ${page.url()}, mencoba ulang...`);
    await page.waitForTimeout(1000);
  }

  return !(await isOnLoginPage(page));
}

/**
 * Main scanner entry point.
 */
async function scanEjatra({ baseUrl, username, password, callbackUrl, scanId, internalToken, targetUrl }) {
  const startTime = Date.now();
  const allPages = [];
  const errors = [];
  const toolbarCategories = new Set();
  let browser;

  const resolvedBaseUrl = (baseUrl || process.env.EJATRA_TESTING_BASE_URL || '').replace(/^['"]+|['"]+$/g, '').trim();
  const resolvedUsername = (username || process.env.EJATRA_TEST_USERNAME || process.env.EJATRA_USERNAME || '').replace(/^['"]+|['"]+$/g, '').trim();
  const resolvedPassword = (password || process.env.EJATRA_TEST_PASSWORD || process.env.EJATRA_PASSWORD || '').replace(/^['"]+|['"]+$/g, '').trim();

  try {
    if (!resolvedBaseUrl || !resolvedUsername || !resolvedPassword) {
      throw new Error('Konfigurasi kredensial belum lengkap. Pastikan EJATRA_TESTING_BASE_URL, EJATRA_TEST_USERNAME, dan EJATRA_TEST_PASSWORD tersedia di .env.');
    }

    const isHeadless = process.env.SCANNER_HEADLESS !== undefined
      ? process.env.SCANNER_HEADLESS === 'true'
      : (process.env.BROWSER_HEADLESS === 'true');

    browser = await chromium.launch({
      headless: isHeadless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--no-default-browser-check',
        ...(isHeadless ? ['--window-size=1920,1080'] : ['--start-maximized']),
      ],
    });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    const page = await context.newPage();

    // Auto-dismiss any JS dialog/alert/confirm during scanning to avoid freezing
    page.on('dialog', async dialog => {
      await dialog.dismiss().catch(() => {});
    });

    // ── TAHAP 1: Login menggunakan kredensial .env ──
    const cleanBaseUrl = resolvedBaseUrl.replace(/\/+$/, '');
    const loggedIn = await authenticateScanner(page, cleanBaseUrl, resolvedUsername, resolvedPassword);
    if (!loggedIn || (await isOnLoginPage(page))) {
      throw new Error(
        `Autentikasi login gagal (masih tertahan di ${page.url()}). ` +
        `Pastikan EJATRA_TEST_USERNAME ("${resolvedUsername}") dan EJATRA_TEST_PASSWORD di .env valid.`
      );
    }

    // ── OPSI KHUSUS: Single-Submenu Scan (On-Demand / Incremental) ──
    if (targetUrl) {
      const resolvedTarget = targetUrl.startsWith('http')
        ? targetUrl
        : `${cleanBaseUrl}/${targetUrl.replace(/^\//, '')}`;

      console.log(`[Scanner] ── Single-Submenu Active Scan: ${resolvedTarget} ──`);
      try {
        await page.goto(resolvedTarget, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await waitReady(page);

        if (await isOnLoginPage(page)) {
          await authenticateScanner(page, cleanBaseUrl, resolvedUsername, resolvedPassword);
          await page.goto(resolvedTarget, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await waitReady(page);
        }

        const currentUrl = page.url();
        if (await isOnLoginPage(page)) {
          throw new Error(`Halaman target ${resolvedTarget} me-redirect ke halaman login (${currentUrl})`);
        }

        const pageTitle = await getPageTitle(page);

        // Resolve hierarchical menu path from sidebar or breadcrumbs (e.g. "Aspal > Timbangan SPB")
        let hierarchicalMenuPath = await page.evaluate((target) => {
          const cleanTarget = target.replace(/^[#\.\/\s]+/, '').toLowerCase();

          // 1. Check sidebar / navbar items for link matching target URL
          const candidateLinks = Array.from(document.querySelectorAll('.sidebar a, .sidebar-menu a, nav a, .navbar a, [role="navigation"] a'));
          for (const link of candidateLinks) {
            const href = (link.getAttribute('href') || '').toLowerCase();
            if (href && (href.includes(cleanTarget) || href.endsWith(cleanTarget))) {
              const parentHeader = link.closest('.treeview, .has-treeview, .nav-item, li.dropdown, .menu-item');
              const parentToggle = parentHeader ? parentHeader.querySelector(':scope > a, :scope > span, :scope > .dropdown-toggle') : null;
              const parentText = parentToggle ? parentToggle.textContent.trim().replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ') : '';
              const childText = link.textContent.trim().replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ');
              if (parentText && childText && parentText !== childText) {
                return `${parentText} > ${childText}`;
              }
              if (childText) return childText;
            }
          }

          // 2. Check breadcrumbs
          const crumbs = Array.from(document.querySelectorAll('.breadcrumb li, .breadcrumb-item, ol.breadcrumb li, .content-header .breadcrumb li'))
            .map(el => el.textContent.trim().replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' '))
            .filter(t => t && !['home', 'dashboard', 'utama'].includes(t.toLowerCase()));
          if (crumbs.length >= 2) return crumbs.join(' > ');
          if (crumbs.length === 1) return crumbs[0];

          return null;
        }, targetUrl).catch(() => null);

        const scannerCfg = appProfile.get('scanner', {}) || {};
        const landingKeyword = scannerCfg.landingPathKeyword || 'halaman-utama';
        const landingMenuName = scannerCfg.landingMenuName || 'Halaman Utama';

        let resolvedMenuPath = hierarchicalMenuPath || pageTitle || targetUrl;
        if (currentUrl.includes(landingKeyword) || targetUrl.includes(landingKeyword) || resolvedMenuPath.startsWith('http://') || resolvedMenuPath.startsWith('https://')) {
          resolvedMenuPath = landingMenuName;
        }

        const elements = await explorePageState(page);

        allPages.push({
          menu_path: resolvedMenuPath,
          page_url: currentUrl,
          page_title: pageTitle,
          elements: elements,
        });

        console.log(`[Scanner] Single-submenu scan success: ${elements.length} elements found at ${currentUrl}`);
      } catch (err) {
        errors.push(`Error Single Scan: ${targetUrl} — ${err.message}`);
        console.error(`[Scanner] Single scan error: ${err.message}`);
      }
    } else {
      const seenUrls = new Set();
      const scannerCfg = appProfile.get('scanner', {}) || {};
      const landingKeyword = scannerCfg.landingPathKeyword || 'halaman-utama';
      const landingMenuName = scannerCfg.landingMenuName || 'Halaman Utama';

      // ── TAHAP 2A: Scan Landing Page (Halaman Utama) terlebih dahulu ──
      const landingUrl = page.url();
      if (!(await isOnLoginPage(page))) {
        const landingNorm = normalizePageUrl(landingUrl);
        seenUrls.add(landingNorm);
        const landingTitle = await getPageTitle(page);
        const landingElements = await explorePageState(page);
        allPages.push({
          menu_path: landingMenuName,
          page_url: landingUrl,
          page_title: landingTitle || landingMenuName,
          elements: landingElements,
        });
        console.log(`[Scanner] ✓ Captured ${landingMenuName} (${landingUrl}): ${landingElements.length} elements`);
      }

      // ── TAHAP 2B: Scan Menu Structure ──
      const menuStructure = await scanMenuStructure(page);
      console.log(`[Scanner] Found ${menuStructure.length} top-level menu groups`);

      // ── TAHAP 3: Fast Direct Page Scanning ──
      for (const menu of menuStructure) {
        for (const child of menu.children) {
          const menuPath = `${menu.parent} > ${child.text}`;
          
          // Resolve absolute target URL
          let tUrl = '';
          if (child.href && !child.href.startsWith('#') && !child.href.startsWith('javascript:')) {
            tUrl = child.href.startsWith('http') ? child.href : new URL(child.href, page.url()).href;
          }

          if (!tUrl || isUnauthenticatedUrl(tUrl)) continue;

          const normalizedUrl = normalizePageUrl(tUrl);
          if (seenUrls.has(normalizedUrl)) continue;
          seenUrls.add(normalizedUrl);

          console.log(`[Scanner] Scanning: ${menuPath} (${tUrl})`);

          try {
            await page.goto(tUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await waitReady(page);

            if (await isOnLoginPage(page)) {
              console.warn(`[Scanner] Session redirected to ${page.url()}, re-authenticating...`);
              const reauthed = await authenticateScanner(page, cleanBaseUrl, resolvedUsername, resolvedPassword);
              if (reauthed) {
                await page.goto(tUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                await waitReady(page);
              }
            }

            const currentUrl = page.url();
            if (await isOnLoginPage(page)) {
              console.warn(`[Scanner]   → Skipping ${menuPath}: redirected to login (${currentUrl})`);
              continue;
            }

            const pageTitle = await getPageTitle(page);
            const elements = await explorePageState(page);

            allPages.push({
              menu_path: menuPath,
              page_url: currentUrl,
              page_title: pageTitle,
              elements: elements,
            });

            console.log(`[Scanner]   → ${elements.length} elements found at ${currentUrl}`);

            // Discover in-page subnav links (e.g. Pengalihan SPB & Realisasi SPB on /spb-aspal)
            const subNavs = await page.evaluate(() => {
              const links = Array.from(document.querySelectorAll('.nav-tabs a[href], .nav-pills a[href], .content-header a[href], .page-header a[href], .card-header a[href]'));
              return links.map(a => ({
                text: a.textContent.trim().replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' '),
                href: a.getAttribute('href')
              })).filter(x => x.text && x.href && !x.href.startsWith('#') && !x.href.startsWith('javascript:'));
            }).catch(() => []);

            for (const sub of subNavs) {
              const subAbsUrl = sub.href.startsWith('http') ? sub.href : new URL(sub.href, page.url()).href;
              const subNorm = normalizePageUrl(subAbsUrl);
              if (!seenUrls.has(subNorm)) {
                const subLabel = child.text && !sub.text.toLowerCase().includes(child.text.toLowerCase())
                  ? `${child.text} > ${sub.text}`
                  : sub.text;
                menu.children.push({ text: subLabel, href: subAbsUrl });
              }
            }
          } catch (err) {
            errors.push(`Error: ${menuPath} — ${err.message}`);
            console.error(`[Scanner]   → Error: ${err.message}`);
          }
        }
      }

      // ── TAHAP 3.5: Scan Module Dashboard Sub-Toolbars (Hierarchical Grouping) ──
      console.log('[Scanner] ── TAHAP 3.5: Scanning Module Dashboard Sub-Toolbars ──');

      const urlToPageIndex = new Map();
      allPages.forEach((p, idx) => {
        const normalized = normalizePageUrl(p.page_url);
        urlToPageIndex.set(normalized, idx);
      });

      // Identify candidate dashboards to inspect for categorized toolbars (daftar dari app-profile.json → scanDashboards)
      const dashboardUrls = appProfile.get('scanDashboards', []).map(d => ({
        name: d.name,
        url: `${cleanBaseUrl}/${d.path}`,
        defaultPath: `Dashboard > ${d.name}`,
      }));

      for (const dash of dashboardUrls) {
        try {
          console.log(`[Scanner] Checking toolbar on Dashboard: ${dash.name} (${dash.url})`);
          await page.goto(dash.url, { waitUntil: 'domcontentloaded', timeout: 7000 });
          await waitReady(page);

          if (await isOnLoginPage(page)) {
            console.warn(`[Scanner] Dashboard ${dash.name} redirected to ${page.url()}, re-authenticating...`);
            const reauthed = await authenticateScanner(page, cleanBaseUrl, resolvedUsername, resolvedPassword);
            if (reauthed) {
              await page.goto(dash.url, { waitUntil: 'domcontentloaded', timeout: 7000 });
              await waitReady(page);
            }
          }

          // Check if page loaded successfully (not 404 or redirect to login)
          const currentUrl = page.url();
          if (await isOnLoginPage(page)) {
            console.warn(`[Scanner]   → Skipping Dashboard ${dash.name}: still on login page (${currentUrl})`);
            continue;
          }

          const pageNormalized = normalizePageUrl(currentUrl);
          const pageTitle = await getPageTitle(page);
          if (pageTitle && pageTitle.trim() === '404') {
            continue;
          }

          // Scan dashboard page itself if not yet scanned
          if (!urlToPageIndex.has(pageNormalized)) {
            const elements = await explorePageState(page);
            const resolvedDashPath = currentUrl.includes(landingKeyword) ? landingMenuName : dash.defaultPath;
            allPages.push({
              menu_path: resolvedDashPath,
              page_url: currentUrl,
              page_title: pageTitle,
              elements: elements,
            });
            urlToPageIndex.set(pageNormalized, allPages.length - 1);
            console.log(`[Scanner]   ✓ Captured Dashboard page: ${resolvedDashPath} (${elements.length} elements)`);
          }

          // Extract ONLY module content toolbar dropdown groups (quickLinksToggle*) — NEVER global sidebar menus
          const toolbarGroups = await scanModuleToolbar(page);
          if (toolbarGroups.length === 0) continue;

          console.log(`[Scanner]   → Found ${toolbarGroups.length} category groups for module "${dash.name}"`);
          toolbarGroups.forEach(g => toolbarCategories.add(g.category));

          for (const group of toolbarGroups) {
            for (const child of group.children) {
              if (isUnauthenticatedUrl(child.href)) continue;
              const childNormalized = normalizePageUrl(child.href);
              const existingIdx = urlToPageIndex.get(childNormalized);

              // Do NOT reclassify existing pages! Preserve exact "Menu > Submenu" path from main navigation bar
              if (existingIdx !== undefined) {
                continue;
              }

              // Discover and scan new page from toolbar without middle dashboard category
              const cleanChildText = child.text.replace(/\s+-\s+/g, ' > ');
              const directPath = `${dash.name} > ${cleanChildText}`;
              console.log(`[Scanner]     │  ★ NEW page: ${directPath} (${child.href})`);
              try {
                await page.goto(child.href, { waitUntil: 'domcontentloaded', timeout: 15000 });
                await waitReady(page);

                const childCurrentUrl = page.url();
                if (await isOnLoginPage(page)) {
                  console.warn(`[Scanner]     │    → Skipping ${directPath}: redirected to login (${childCurrentUrl})`);
                  continue;
                }

                const childTitle = await getPageTitle(page);
                const elements = await explorePageState(page);

                allPages.push({
                  menu_path: directPath,
                  page_url: child.href,
                  page_title: childTitle,
                  elements: elements,
                });
                urlToPageIndex.set(childNormalized, allPages.length - 1);
                console.log(`[Scanner]     │    → ${elements.length} elements found`);
              } catch (navErr) {
                console.error(`[Scanner]     │    → Error: ${navErr.message}`);
              }
            }
          }
        } catch (dashErr) {
          // Continue to next dashboard if this one is not enabled
        }
      }
    } // end else (full scan)

    console.log(`[Scanner] ── Scan process completed ──`);
    await browser.close();
  } catch (fatalErr) {
    errors.push(`Fatal: ${fatalErr.message}`);
    console.error(`[Scanner] Fatal error: ${fatalErr.message}`);
    if (browser) await browser.close().catch(() => {});
  }

  const durationMs = Date.now() - startTime;
  const totalElements = allPages.reduce((sum, p) => sum + p.elements.length, 0);
  const isFailed = allPages.length === 0 || totalElements === 0 || errors.some(e => e.startsWith('Fatal:'));

  // ── TAHAP 4: Send results to CI4 callback ──
  const payload = {
    scan_id: scanId,
    status: isFailed ? 'failed' : 'completed',
    error_message: errors.length > 0 ? errors.join('; ') : null,
    pages: allPages,
    toolbar_categories: [...toolbarCategories],
    total_pages: allPages.length,
    total_elements: totalElements,
    duration_ms: durationMs,
    errors: errors,
  };

  console.log(`[Scanner] Scan complete (${payload.status}): ${allPages.length} pages, ${payload.total_elements} elements in ${durationMs}ms`);

  if (callbackUrl) {
    try {
      await axios.post(callbackUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': internalToken || '',
        },
        timeout: 30000,
      });
      console.log(`[Scanner] Results successfully sent to callback: ${callbackUrl}`);
    } catch (cbErr) {
      console.error(`[Scanner] Callback failed: ${cbErr.message}`);
    }
  }

  return payload;
}


/**
 * Scan the navbar/sidebar menu structure.
 * Returns array of { parent, children: [{ text, href }] }
 */
async function scanMenuStructure(page) {
  return await page.evaluate(() => {
    const result = [];
    const seenParents = new Set();

    const candidateContainers = document.querySelectorAll(
      '.navbar, .navbar-nav, nav, header, .topbar, .main-header, .sidebar, .sidebar-menu, .menu, #sidebar, .navigation, [role="navigation"], .app-header'
    );

    candidateContainers.forEach(container => {
      const items = container.querySelectorAll(
        '.nav-item, .dropdown, li.dropdown, .menu-item, li:has(ul), li:has(.dropdown-menu), .mega-menu, div.dropdown'
      );

      items.forEach(item => {
        const toggle = item.querySelector(':scope > a, :scope > button, :scope > .nav-link, :scope > .dropdown-toggle, :scope > span, :scope > div > a');
        if (!toggle) return;

        const parentText = toggle.textContent.trim().replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ');
        if (!parentText || parentText.length < 2 || seenParents.has(parentText)) return;
        if (['profil', 'profile', 'logout', 'keluar', 'user', 'admin'].some(x => parentText.toLowerCase().includes(x))) return;

        const children = [];
        const seenChildText = new Set();

        item.querySelectorAll('a, button, [role="menuitem"]').forEach(sub => {
          if (sub === toggle) return;
          const text = sub.textContent.trim().replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ');
          const href = sub.getAttribute('href') || '';
          if (text && text.length > 1 && !seenChildText.has(text) && href !== '#' && !href.startsWith('javascript:')) {
            seenChildText.add(text);
            children.push({ text, href });
          }
        });

        if (children.length > 0) {
          seenParents.add(parentText);
          result.push({ parent: parentText, children });
        }
      });

      // Also support Bootstrap collapse / accordion menus in sidebar (e.g. Aspal, Database, Dashboard)
      container.querySelectorAll('[data-bs-toggle="collapse"], [data-toggle="collapse"]').forEach(toggle => {
        const parentText = toggle.textContent.trim().replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ');
        if (!parentText || parentText.length < 2 || seenParents.has(parentText)) return;
        if (['profil', 'profile', 'logout', 'keluar', 'user', 'admin'].some(x => parentText.toLowerCase().includes(x))) return;

        const targetSel = toggle.getAttribute('data-bs-target') || toggle.getAttribute('data-target') || toggle.getAttribute('href');
        let collapseContainer = null;
        if (targetSel && targetSel.startsWith('#') && targetSel.length > 1) {
          try { collapseContainer = document.querySelector(targetSel); } catch {}
        }
        if (!collapseContainer && toggle.nextElementSibling) {
          collapseContainer = toggle.nextElementSibling;
        }
        if (!collapseContainer) return;

        const children = [];
        const seenChildText = new Set();
        collapseContainer.querySelectorAll('a[href]').forEach(sub => {
          const text = sub.textContent.trim().replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ');
          const href = sub.getAttribute('href') || '';
          if (text && text.length > 1 && !seenChildText.has(text) && href !== '#' && !href.startsWith('javascript:')) {
            seenChildText.add(text);
            children.push({ text, href });
          }
        });

        if (children.length > 0) {
          seenParents.add(parentText);
          result.push({ parent: parentText, children });
        }
      });
    });

    return result;
  });
}


/**
 * Get the page heading title.
 */
async function getPageTitle(page) {
  return await page.evaluate(() => {
    const h = document.querySelector('.content-header h1, .content-header h2, .page-title, h1, h2, h3, h4, h5');
    return h ? h.textContent.trim().replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ') : null;
  });
}


/**
 * Normalize a page URL for comparison.
 */
function normalizePageUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/\/$/, '').toLowerCase();
  } catch {
    return (url || '').replace(/\/$/, '').toLowerCase();
  }
}


/**
 * Scan ONLY the module dashboard content sub-toolbar (quickLinksToggle*).
 * Does NOT scan global sidebar/navbar menus to prevent cross-module prefix pollution (e.g. "Aset > Aspal > ...").
 */
async function scanModuleToolbar(page) {
  const scannerCfg = appProfile.get('scanner', {}) || {};
  const toggleSel = scannerCfg.moduleToolbarToggleSelector || '[id^="quickLinksToggle"]';
  return await page.evaluate((sel) => {
    const groups = [];
    const seenCategories = new Set();

    const dropdownToggles = document.querySelectorAll(sel);

    dropdownToggles.forEach(toggle => {
      if (toggle.closest('.sidebar, [id="sidebar"], aside, .main-sidebar, .navbar, header')) return;

      const rawText = toggle.textContent.trim().replace(/\s+/g, ' ');
      if (!rawText || rawText.length < 2) return;
      if (['profil', 'profile', 'logout', 'keluar'].some(x => rawText.toLowerCase().includes(x))) return;

      const category = rawText
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');

      if (seenCategories.has(category)) return;
      seenCategories.add(category);

      const dropdownParent = toggle.closest('.dropdown');
      if (!dropdownParent) return;

      const menu = dropdownParent.querySelector('.dropdown-menu');
      if (!menu) return;

      const children = [];
      const seenHrefs = new Set();

      menu.querySelectorAll('a, .dropdown-item').forEach(item => {
        const text = item.textContent.trim().replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ');
        const href = item.getAttribute('href') || '';

        if (!text || text.length < 2) return;
        if (!href || href === '#' || href.startsWith('javascript:')) return;

        const absoluteHref = href.startsWith('http') ? href : new URL(href, window.location.origin).href;

        if (!seenHrefs.has(absoluteHref)) {
          seenHrefs.add(absoluteHref);
          children.push({ text, href: absoluteHref });
        }
      });

      if (children.length > 0) {
        groups.push({ category, children });
      }
    });

    return groups;
  }, toggleSel);
}

module.exports = { scanEjatra };
