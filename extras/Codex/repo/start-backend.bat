@echo off
title HTXpunk - Backend
cd /d "%~dp0backend"

echo Killing any leftover processes on port 8000...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":8000 " ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
timeout /t 1 /nobreak >nul

echo Starting backend API server...
uvicorn main:app --reload --host 0.0.0.0 --port 8000
