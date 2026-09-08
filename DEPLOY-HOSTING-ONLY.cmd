@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-hosting-only.ps1"
if errorlevel 1 (
  echo Hosting deployment failed.
  pause
  exit /b 1
)
echo Hosting-only deployment completed successfully.
pause
