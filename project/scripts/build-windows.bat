@echo off
REM =========================================
REM  Al-Siraj Clinic - Windows Build Script
REM =========================================
setlocal enabledelayedexpansion

echo.
echo ==========================================================
echo   Building Dr. Wesen Abdulaziz Eye Clinic Desktop App (.exe)
echo ==========================================================
echo.

REM ---- Step 1: Build React frontend ----
echo [1/4] Building React frontend...
cd /d "%~dp0..\frontend"
if not exist node_modules (
    echo   Installing frontend dependencies...
    call yarn install || goto :error
)

REM Build with empty backend URL so it uses relative paths (same origin)
set REACT_APP_BACKEND_URL=
call yarn build || goto :error
echo   Frontend built successfully.

REM ---- Step 2: Install Python dependencies ----
echo.
echo [2/4] Installing Python dependencies...
cd /d "%~dp0..\backend"
pip install -r requirements.txt || goto :error
pip install pyinstaller || goto :error

REM ---- Step 3: Clean previous builds ----
echo.
echo [3/4] Cleaning previous builds...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist

REM ---- Step 4: Compile with PyInstaller ----
echo.
echo [4/4] Compiling to executable...
pyinstaller app.spec --clean --noconfirm || goto :error

REM ---- Copy .env.example to dist ----
copy .env.example dist\DrWesenClinic\.env >nul 2>&1

echo.
echo ==========================================================
echo   BUILD SUCCESSFUL!
echo ==========================================================
echo.
echo   Output folder: %~dp0..\backend\dist\DrWesenClinic\
echo   Run: DrWesenClinic.exe
echo.
echo   To distribute:
echo     1. Zip the entire "DrWesenClinic" folder
echo     2. Send to secretary/doctor computers
echo     3. They extract and run DrWesenClinic.exe
echo.
echo   IMPORTANT: Edit .env inside DrWesenClinic folder to
echo              change CLINIC_PIN before distributing!
echo.
pause
exit /b 0

:error
echo.
echo ==========================================================
echo   BUILD FAILED! See errors above.
echo ==========================================================
pause
exit /b 1
