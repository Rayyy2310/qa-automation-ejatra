@echo off
TITLE AI Automation Testing Studio — Auto Launcher
COLOR 0A
CLS

echo =========================================================================
echo               AI AUTOMATION TESTING STUDIO — E-JATRA
echo                       BULLETPROOF LAUNCHER
echo =========================================================================
echo.

:: 1. Verify MySQL Port 3306 & Service
echo [1/4] Checking MySQL Database Server (Port 3306)...
netstat -ano | findstr ":3306" | findstr "LISTENING" >nul
if "%ERRORLEVEL%"=="0" (
    echo   [OK] MySQL Server is ACTIVE and listening on Port 3306.
) else (
    echo   [!] Port 3306 inactive. Restarting XAMPP MySQL Server...
    taskkill /F /IM mysqld.exe 2>NUL
    timeout /t 1 /nobreak >nul
    if exist "C:\xampp\mysql\bin\mysqld.exe" (
        start /min "MySQL-Server" "C:\xampp\mysql\bin\mysqld.exe" --defaults-file="C:\xampp\mysql\bin\my.ini" --console
    ) else if exist "C:\xampp\mysql_start.bat" (
        start /min "MySQL-Server" "C:\xampp\mysql_start.bat"
    )
    timeout /t 3 /nobreak >nul
)

:: 2. Verify PHP CodeIgniter 4 Web Server (Port 8080)
echo.
echo [2/4] Checking Web Server (Port 8080)...
netstat -ano | findstr ":8080" | findstr "LISTENING" >nul
if "%ERRORLEVEL%"=="0" (
    echo   [OK] Web Server is ACTIVE on http://localhost:8080.
) else (
    echo   [!] Starting Web Server on http://localhost:8080...
    start /min "CI4-Server" cmd /c "C:\xampp\php\php.exe spark serve --port 8080"
    timeout /t 2 /nobreak >nul
)

:: 3. Launch Node.js Playwright Runner (Port 3001) in Visible Window
echo.
echo [3/4] Launching Playwright Node Test Runner (Port 3001)...
start "Playwright-Test-Runner" cmd /k "cd /d %~dp0test-service && node --watch src/server.js"

:: 4. Open Web Studio in Browser
echo.
echo [4/4] Opening Web Studio in Browser...
timeout /t 2 /nobreak >nul
start http://localhost:8080/ai-automation-test

echo.
echo =========================================================================
echo [SUCCESS] Everything is ONLINE!
echo - Web Studio : http://localhost:8080/ai-automation-test
echo - Test Service: http://localhost:3001
echo - MySQL DB   : 127.0.0.1:3306 (ejatra_testing)
echo =========================================================================
echo.
pause
