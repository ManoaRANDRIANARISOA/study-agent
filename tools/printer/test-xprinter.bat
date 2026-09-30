@echo off
title Study Agent - Test Impression Thermique Directe
color 0a
echo ==========================================================
echo   Study Agent - Test Impression ESC/POS Direct Spooler
echo ==========================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0test-xprinter.ps1"
echo.
pause
