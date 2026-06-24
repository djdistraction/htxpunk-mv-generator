@echo off
title HTXpunk - Frontend
cd /d "%~dp0frontend"

echo Killing any leftover processes on ports 3000 and 3001...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000 " ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3001 " ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
timeout /t 1 /nobreak >nul

echo Clearing Next.js cache...
if exist ".next" rmdir /s /q ".next"

echo Starting frontend dev server...
npm run dev
