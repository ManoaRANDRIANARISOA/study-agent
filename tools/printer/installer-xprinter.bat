@echo off
title Study Agent - Assistant Imprimante Thermique
color 0b
echo ==========================================================
echo   Study Agent - Installation / Test Imprimante Thermique
echo ==========================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer-xprinter.ps1"
echo.
pause
