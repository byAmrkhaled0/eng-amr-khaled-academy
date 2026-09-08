@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-deployment.ps1" %*
if errorlevel 1 (
  echo Site check failed.
  pause
  exit /b 1
)
echo Site check completed successfully.
pause
