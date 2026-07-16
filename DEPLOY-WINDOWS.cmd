@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-production.ps1"
if errorlevel 1 (
  echo.
  echo Deployment stopped because one of the checks failed.
  pause
  exit /b 1
)
echo.
echo Deployment completed successfully.
pause
