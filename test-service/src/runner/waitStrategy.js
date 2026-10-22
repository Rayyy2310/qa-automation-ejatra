/**
 * Ultra-Fast & Responsive Wait Strategy for Playwright
 */

/**
 * Cek apakah elemen benar-benar aktif. Playwright `isEnabled()` tidak mencakup
 * link/tombol Bootstrap yang dinonaktifkan lewat class `.disabled`, jadi dicek manual.
 * @param {import('@playwright/test').Locator} loc
 * @returns {Promise<boolean>}
 */
async function isReallyEnabled(loc) {
  try {
    return await loc.evaluate((el) => {
      if (el.disabled === true) return false;
      if (el.getAttribute('aria-disabled') === 'true') return false;
      if (el.classList && el.classList.contains('disabled')) return false;
      if (el.closest('fieldset[disabled]')) return false;
      return true;
    }, null, { timeout: 1000 });
  } catch (e) {
    return false;
  }
}

/**
 * Apply wait before condition with fast fallback.
 * @param {import('@playwright/test').Page} page
 * @param {Object|null} waitConfig - Wait configuration from step (e.g. step.wait_before)
 * @param {import('@playwright/test').Locator|null} [locator=null] - Optional locator for visibility checks
 */
async function applyWaitCondition(page, waitConfig, locator = null) {
  if (!waitConfig || waitConfig.type === 'none') return;
  const timeout = Math.min(waitConfig.timeout_ms || 4000, 4000);
  
  switch (waitConfig.type) {
    case 'visible': {
      if (locator) {
        if (locator.__alreadyResolved) return;
        try {
          const count = await locator.count().catch(() => 0);
          if (count > 0) {
            for (let i = 0; i < count; i++) {
              if (await locator.nth(i).isVisible().catch(() => false)) {
                return; // Element is already visible!
              }
            }
            await locator.first().waitFor({ state: 'visible', timeout: Math.min(timeout, 2500) });
          }
        } catch (e) {}
      }
      break;
    }
    case 'attached':
      if (locator) {
        if (locator.__alreadyResolved) return;
        await locator.first().waitFor({ state: 'attached', timeout: Math.min(timeout, 2000) }).catch(() => {});
      }
      break;
    case 'enabled':
      if (locator) {
        // Batas khusus 'enabled': default 4 dtk, maksimal 15 dtk bila diminta eksplisit
        // (alur bersyarat seperti "isi customer dulu baru tombol aktif" sering butuh AJAX > 2 dtk).
        const enabledTimeout = waitConfig.timeout_ms ? Math.min(waitConfig.timeout_ms, 15000) : 4000;
        const target = locator.first();
        const exists = (await locator.count().catch(() => 0)) > 0;
        if (exists) {
          await target.waitFor({ state: 'visible', timeout: Math.min(enabledTimeout, 4000) }).catch(() => {});
          const deadline = Date.now() + enabledTimeout;
          let enabled = await isReallyEnabled(target);
          while (!enabled && Date.now() < deadline) {
            await page.waitForTimeout(150);
            enabled = await isReallyEnabled(target);
          }
          if (!enabled) {
            throw new Error(
              `PRECONDITION_NOT_MET: elemen masih disabled setelah menunggu ${enabledTimeout}ms ` +
              `(prasyarat di step sebelumnya mungkin belum terpenuhi)`
            );
          }
        }
      }
      break;

    case 'hidden':
      if (locator) {
        await locator.first().waitFor({ state: 'hidden', timeout: Math.min(timeout, 5000) }).catch(() => {});
      }
      break;

    case 'modal': {
      if (page) {
        const modalEl = page.locator('.modal.show:visible, .swal2-popup:visible, [role="dialog"]:visible').first();
        await modalEl.waitFor({ state: 'visible', timeout: Math.min(timeout, 5000) }).catch(() => {});
      }
      break;
    }

    case 'text': {
      if (page && waitConfig.text) {
        await page.locator(`text="${waitConfig.text}"`).first().waitFor({ state: 'visible', timeout: Math.min(timeout, 5000) }).catch(() => {});
      }
      break;
    }

    case 'network_idle':
      try {
        await page.waitForLoadState('networkidle', { timeout: Math.min(timeout, 2000) });
      } catch (e) {
        await page.waitForLoadState('domcontentloaded', { timeout: 800 }).catch(() => {});
      }
      break;
    case 'url_change':
      if (waitConfig.url_pattern) {
        await page.waitForURL(new RegExp(waitConfig.url_pattern), { timeout }).catch(() => {});
      }
      break;
    case 'response':
      break;
  }
}

/**
 * Apply post action wait condition with high-speed settling
 */
async function applyPostActionWait(page, postWaitConfig) {
  if (!postWaitConfig || postWaitConfig.type === 'none') return;
  const timeout = Math.min(postWaitConfig.timeout_ms || 3000, 3000);
  
  switch (postWaitConfig.type) {
    case 'network_idle':
      try {
        await page.waitForLoadState('networkidle', { timeout: Math.min(timeout, 2000) });
      } catch (e) {
        await page.waitForLoadState('domcontentloaded', { timeout: 600 }).catch(() => {});
      }
      break;
    case 'dom_stable':
      await page.waitForTimeout(200);
      break;
    case 'toast_visible':
      await page.locator('[class*="toast"], [class*="alert"], [class*="notification"], [role="alert"], .swal2-popup')
        .first().waitFor({ state: 'visible', timeout: Math.min(timeout, 3000) }).catch(() => {});
      break;
  }
}

module.exports = {
  applyWaitCondition,
  applyPostActionWait
};
