@echo off
title Building Empire of the Soil (.exe)
cd /d "%~dp0"
echo.
echo  ==============================================
echo     EMPIRE OF THE SOIL  -  Windows .exe builder
echo  ==============================================
echo.
where npm >nul 2>nul
if errorlevel 1 (
  echo  Node.js is not installed.
  echo  1. Download the LTS version from https://nodejs.org
  echo  2. Install it with the default options
  echo  3. Double-click this file again
  echo.
  start https://nodejs.org
  pause
  exit /b 1
)
echo  [1/2] Installing build tools (first time only, takes a few minutes)...
call npm install
if errorlevel 1 goto :error
echo.
echo  [2/2] Packaging the game into a single .exe ...
call npm run build
if errorlevel 1 goto :error
echo.
echo  Done!  Your game is:  dist\EmpireOfTheSoil.exe
echo  You can copy that one file anywhere and double-click it to play.
explorer dist
pause
exit /b 0
:error
echo.
echo  Something went wrong - read the messages above.
echo  Tip: make sure you are connected to the internet for the first build.
pause
exit /b 1
