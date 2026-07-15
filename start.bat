@echo off
cd /d "%~dp0"

:: Load VERCEL_TOKEN from server\.env
for /f "usebackq tokens=1,* delims==" %%a in ("server\.env") do (
  if /i "%%a"=="VERCEL_TOKEN" set "VERCEL_TOKEN=%%b"
)

echo Starting LendPro services...

:: Restore PM2 processes (servers + tunnel)
pm2 resurrect >nul 2>&1

:: Save current process list so PM2 knows what to restore
pm2 save -f >nul 2>&1

:: Ensure startup shortcut points to this batch file
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if not exist "%STARTUP%\LendPro.lnk" (
  powershell -Command "$WS = New-Object -ComObject WScript.Shell; $SC = $WS.CreateShortcut('%STARTUP%\LendPro.lnk'); $SC.TargetPath = '%~f0'; $SC.WorkingDirectory = '%~dp0'; $SC.Save()"
  echo Added to Windows startup.
)

echo Done. Run "pm2 status" to check services.
