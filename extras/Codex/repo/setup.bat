@echo off
setlocal enabledelayedexpansion
color 0A
title HTXpunk Productions - MV Generator Setup

echo.
echo  ==========================================
echo   HTXpunk Productions - MV Generator Setup
echo  ==========================================
echo.

set "PROJECT=C:\Users\booki\htxpunk-mv-generator"

REM ---- Check project folder exists ----
if not exist "%PROJECT%" (
    echo [ERROR] Project folder not found at %PROJECT%
    echo Please clone the repo first.
    pause
    exit /b 1
)

REM ---- Create .env if missing ----
if not exist "%PROJECT%\.env" (
    echo [INFO] Creating .env from .env.example...
    copy "%PROJECT%\.env.example" "%PROJECT%\.env"
    echo.
    echo [ACTION REQUIRED] Open %PROJECT%\.env and fill in:
    echo   GROQ_API_KEY=your_groq_key_here
    echo   HF_TOKEN=your_huggingface_read_token_here
    echo.
    echo Press any key after you've saved your API keys...
    pause
) else (
    echo [OK] .env file already exists.
)

REM ---- Check .env has real keys ----
findstr /i "GROQ_API_KEY=gsk_" "%PROJECT%\.env" >nul 2>&1
if errorlevel 1 (
    echo.
    echo [WARNING] GROQ_API_KEY doesn't look filled in yet.
    echo Open %PROJECT%\.env and make sure it has your real key.
    echo.
)

REM ---- Install Python requirements ----
echo.
echo [1/3] Installing Python requirements...
echo       (this may take a few minutes)
echo.
cd /d "%PROJECT%\backend"
pip install -r requirements.txt
if errorlevel 1 (
    echo [ERROR] pip install failed. Make sure Python is installed and in PATH.
    pause
    exit /b 1
)
echo [OK] Python requirements installed.

REM ---- Install Remotion npm packages ----
echo.
echo [2/3] Installing Remotion packages...
echo       (this may take a few minutes)
echo.
cd /d "%PROJECT%\remotion-composer"
call npm install
if errorlevel 1 (
    echo [ERROR] npm install failed in remotion-composer. Make sure Node.js is installed.
    pause
    exit /b 1
)
echo [OK] Remotion packages installed.

REM ---- Install Frontend npm packages ----
echo.
echo [3/3] Installing Frontend packages...
echo.
cd /d "%PROJECT%\frontend"
call npm install
if errorlevel 1 (
    echo [ERROR] npm install failed in frontend.
    pause
    exit /b 1
)
echo [OK] Frontend packages installed.

REM ---- Done ----
echo.
echo  ==========================================
echo   SETUP COMPLETE!
echo  ==========================================
echo.
echo  Next: open 2 separate PowerShell windows and run:
echo.
echo  [Terminal 1 - Backend]
echo    cd %PROJECT%\backend
echo    uvicorn main:app --reload --host 0.0.0.0 --port 8000
echo.
echo  [Terminal 2 - Frontend]
echo    cd %PROJECT%\frontend
echo    npm run dev
echo.
echo  That's it! No separate worker process needed.
echo  The pipeline runs automatically inside the backend.
echo.
echo  Then open: http://localhost:3000
echo.
pause
