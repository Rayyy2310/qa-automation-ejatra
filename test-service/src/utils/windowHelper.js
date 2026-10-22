const { exec } = require('child_process');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});



/**
 * Bring Playwright Chromium window to foreground on Windows desktop
 * Uses native Win32 SwitchToThisWindow and ShowWindow to guarantee the window is
 * brought to the front and unminimized/maximized.
 */
function bringWindowToForeground() {
  if (process.platform !== 'win32') return;

  const psScript = `
    $code = @'
    using System;
    using System.Runtime.InteropServices;
    public class WinUtil {
        [DllImport("user32.dll")]
        public static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")]
        public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        [DllImport("user32.dll")]
        public static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);
    }
'@
    try {
      Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
    } catch {}

    $wshell = New-Object -ComObject WScript.Shell
    $procs = Get-Process chrome -ErrorAction SilentlyContinue | Where-Object {
      try {
        ($_.MainWindowHandle -ne 0) -and ($_.Path -like '*ms-playwright*' -or $_.MainModule.FileName -like '*ms-playwright*')
      } catch {
        $_.MainWindowHandle -ne 0
      }
    }

    foreach ($p in $procs) {
      try {
        [WinUtil]::ShowWindow($p.MainWindowHandle, 3) # 3 = SW_MAXIMIZE
        [WinUtil]::SetForegroundWindow($p.MainWindowHandle)
        [WinUtil]::SwitchToThisWindow($p.MainWindowHandle, $true)
        $wshell.AppActivate($p.Id)
      } catch {}
    }
  `.replace(/\r?\n/g, ' ');

  exec(`powershell -NoProfile -Command "${psScript}"`, (err) => {
    if (err) {
      logger.debug('Bring window to front notice:', err.message);
    } else {
      logger.info('Playwright window activated to foreground');
    }
  });
}

/**
 * Clean up orphaned Playwright Chromium processes on Windows.
 * Safely targets ONLY chrome.exe processes running from the ms-playwright directory.
 * Will NEVER touch the user's regular Google Chrome or Edge browser.
 * @returns {Promise<void>}
 */
function cleanupOrphanPlaywrightProcesses() {
  if (process.platform !== 'win32') return Promise.resolve();

  return new Promise((resolve) => {
    const cmd = `powershell -NoProfile -Command "Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { try { $_.Path -like '*ms-playwright*' } catch { $false } } | Stop-Process -Force -ErrorAction SilentlyContinue"`;
    exec(cmd, (err) => {
      if (err) {
        logger.debug('Cleanup orphan processes notice:', err.message);
      } else {
        logger.info('Cleaned up orphan Playwright Chromium processes');
      }
      resolve();
    });
  });
}

module.exports = {
  bringWindowToForeground,
  cleanupOrphanPlaywrightProcesses
};


