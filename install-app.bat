@echo off
setlocal

cd /d "%~dp0"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Install Node.js, then run this script again.
  exit /b 1
)

echo Installing project dependencies...
call npm.cmd install
if errorlevel 1 exit /b %ERRORLEVEL%

echo Building the Rest Stop installer...
call npm.cmd run dist
if errorlevel 1 exit /b %ERRORLEVEL%

set "INSTALLER="
for /f "delims=" %%F in ('dir /b /a-d /o-d "release\Rest-Stop-*-windows.exe" 2^>nul') do (
  set "INSTALLER=release\%%F"
  goto :found_installer
)

:found_installer
if not defined INSTALLER (
  echo No Rest Stop installer was found in the release folder.
  exit /b 1
)

echo Installer created:
echo %CD%\%INSTALLER%
exit /b 0
