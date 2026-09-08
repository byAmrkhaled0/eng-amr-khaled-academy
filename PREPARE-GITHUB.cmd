@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0prepare-github-folder.ps1" %*
if errorlevel 1 (
  echo GitHub folder preparation failed.
  pause
  exit /b 1
)
echo GitHub folder prepared locally. Nothing was pushed.
pause
