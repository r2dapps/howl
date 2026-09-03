@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Howl

where python >nul 2>&1
if errorlevel 1 (
  echo Python was not found. Install Python 3, then run this again.
  echo Friends on phones should open the shared link instead.
  pause
  exit /b 1
)

if not exist "models\Llama-3.2-1B-Instruct-q4f16_1-MLC\resolve\main\mlc-chat-config.json" (
  echo Model folder is missing:
  echo   %cd%\models\Llama-3.2-1B-Instruct-q4f16_1-MLC
  echo The page can still download from HuggingFace if you are online.
  echo.
)

echo.
echo  Howl  (companion in the browser)
echo  http://127.0.0.1:5500
echo.
echo  Leave this window open. Press Ctrl+C to stop.
echo.

python serve.py
pause
