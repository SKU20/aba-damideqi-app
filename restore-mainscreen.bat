@echo off
echo ========================================
echo Restoring MainScreen.js from Git
echo ========================================
echo.

cd /d "%~dp0"

echo Current directory: %CD%
echo.

echo Restoring frontend/src/screens/MainScreen.js...
git checkout frontend/src/screens/MainScreen.js

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo SUCCESS! MainScreen.js has been restored
    echo ========================================
    echo.
    echo Next steps:
    echo 1. Test the app to make sure it runs
    echo 2. Follow URGENT_FIX_MAINSCREEN.md to add profile picture support
    echo.
) else (
    echo.
    echo ========================================
    echo ERROR: Failed to restore file
    echo ========================================
    echo.
    echo Make sure you're in the project directory and git is available
    echo.
)

pause
