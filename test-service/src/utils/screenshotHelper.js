const fs = require('fs');
const path = require('path');

/**
 * Capture failure screenshot and DOM snapshot
 * @param {Object} page - Playwright page object
 * @param {string} runId - Test run ID
 * @param {number} stepNo - Step number
 * @param {string} screenshotDir - Directory to save screenshots
 * @returns {Promise<Object>} - Paths to saved files
 */
async function captureFailure(page, runId, stepNo, screenshotDir) {
  const filename = `${runId}_step_${stepNo}.png`;

  // Main service dir
  const dir = path.resolve(screenshotDir || './screenshots');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Public upload dir for CI4
  const publicDir = path.resolve(__dirname, '../../../public/uploads/screenshots');
  if (!fs.existsSync(publicDir)) {
    try {
      fs.mkdirSync(publicDir, { recursive: true });
    } catch (e) {}
  }

  const screenshotPath = path.join(dir, filename);
  const publicScreenshotPath = path.join(publicDir, filename);
  
  let domSnapshot = '';
  
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // Also write copy to public uploads
    try {
      if (fs.existsSync(publicDir)) {
        fs.copyFileSync(screenshotPath, publicScreenshotPath);
      }
    } catch (e) {}
    
    // Capture DOM snapshot
    domSnapshot = await page.evaluate(() => {
      const html = document.body ? document.body.outerHTML : '';
      return html.length > 8000 ? html.substring(0, 8000) + '... (truncated)' : html;
    });
  } catch (error) {
    console.error('Failed to capture failure screenshot/dom:', error);
  }
  
  return {
    screenshotPath: filename,
    domSnapshot
  };
}

module.exports = {
  captureFailure
};
