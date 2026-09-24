@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-hosting-only.ps1"
exit /b 1
