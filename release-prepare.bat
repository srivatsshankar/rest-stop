@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

where git.exe >nul 2>nul
if errorlevel 1 (
  echo git was not found. Install Git, then run this script again.
  exit /b 1
)

where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo PowerShell was not found. Install PowerShell, then run this script again.
  exit /b 1
)

for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "(Get-Content -Raw package.json | ConvertFrom-Json).version"`) do set "VERSION=%%V"
if not defined VERSION (
  echo Could not read version from package.json.
  exit /b 1
)

set "TAG=v%VERSION%"
set "NOTES_DIR=md\releases"
set "NOTES_FILE=%NOTES_DIR%\%TAG%.md"
set "NOTES_GIT_FILE=md/releases/%TAG%.md"

for /f "usebackq delims=" %%S in (`git status --porcelain --untracked-files=all`) do (
  set "STATUS_LINE=%%S"
  set "STATUS_PATH=!STATUS_LINE:~3!"
  if /i not "!STATUS_PATH!"=="%NOTES_GIT_FILE%" (
    echo The working tree has uncommitted changes outside %NOTES_FILE%.
    echo Commit or stash them before preparing %TAG%.
    exit /b 1
  )
)

if not exist "%NOTES_DIR%" mkdir "%NOTES_DIR%"

if not exist "%NOTES_FILE%" (
  >"%NOTES_FILE%" echo # Rest Stop %VERSION%
  >>"%NOTES_FILE%" echo.
  >>"%NOTES_FILE%" echo ## Features
  >>"%NOTES_FILE%" echo - 
  >>"%NOTES_FILE%" echo.
  >>"%NOTES_FILE%" echo ## Fixes
  >>"%NOTES_FILE%" echo - 
  >>"%NOTES_FILE%" echo.
  >>"%NOTES_FILE%" echo ## Maintenance
  >>"%NOTES_FILE%" echo - 
) else (
  echo Release notes already exist at %NOTES_FILE%; leaving them unchanged.
)

git rev-parse -q --verify "refs/tags/%TAG%" >nul 2>nul
if not errorlevel 1 (
  echo Replacing existing local tag %TAG%...
  git tag -d "%TAG%"
  if errorlevel 1 exit /b !ERRORLEVEL!
)

echo Creating local release tag %TAG%...
git tag -a "%TAG%" -m "Release %VERSION%"
if errorlevel 1 exit /b %ERRORLEVEL%

echo Prepared %TAG%.
echo Edit %NOTES_FILE%, then run release-github.bat to publish.
exit /b 0
