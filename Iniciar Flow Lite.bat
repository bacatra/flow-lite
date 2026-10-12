@echo off
title Flow Lite - Voice Typing
cd /d "%~dp0"
if exist "dist\win-unpacked\Flow Lite.exe" (
  start "" "dist\win-unpacked\Flow Lite.exe"
) else (
  start "" npx electron .
)
exit
