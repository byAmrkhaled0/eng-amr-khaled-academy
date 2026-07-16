@echo off
setlocal
cd /d "%~dp0"
set "FUNCTIONS_DISCOVERY_TIMEOUT=120"
if exist ".deploy-success" del /q ".deploy-success"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-production.ps1" %*
set "DEPLOY_EXIT=%ERRORLEVEL%"
if not "%DEPLOY_EXIT%"=="0" goto failed
if not exist ".deploy-success" goto interrupted
echo.
echo Deployment V60.6.2 completed successfully.
del /q ".deploy-success" >nul 2>nul
pause
exit /b 0

:interrupted
echo.
echo Deployment did not produce a success marker. It was interrupted or stopped early.
echo Resume with: DEPLOY-WINDOWS.cmd -Resume
pause
exit /b 1

:failed
echo.
echo Deployment stopped because a step failed. Exit code: %DEPLOY_EXIT%
echo Fix the reported cause, then run: DEPLOY-WINDOWS.cmd -Resume
pause
exit /b %DEPLOY_EXIT%
