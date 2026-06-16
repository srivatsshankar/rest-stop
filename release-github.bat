@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

where git.exe >nul 2>nul
if errorlevel 1 (
  echo git was not found. Install Git, then run this script again.
  exit /b 1
)

where gh.exe >nul 2>nul
if errorlevel 1 (
  echo GitHub CLI was not found. Install gh, then run this script again.
  exit /b 1
)

gh auth status >nul 2>nul
if errorlevel 1 (
  echo GitHub CLI is not authenticated. Run gh auth login, then run this script again.
  exit /b 1
)

for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "(Get-Content -Raw package.json | ConvertFrom-Json).version"`) do set "VERSION=%%V"
if not defined VERSION (
  echo Could not read version from package.json.
  exit /b 1
)

set "TAG=v%VERSION%"
set "NOTES_FILE=md\releases\%TAG%.md"
set "NOTES_GIT_FILE=md/releases/%TAG%.md"

if not exist "%NOTES_FILE%" (
  echo Release notes were not found at %NOTES_FILE%.
  echo Run release-prepare.bat first, then fill in the release notes.
  exit /b 1
)

for /f "usebackq delims=" %%B in (`git branch --show-current`) do set "BRANCH=%%B"
if not defined BRANCH (
  echo Could not determine the current Git branch.
  exit /b 1
)

for /f "usebackq delims=" %%S in (`git status --porcelain --untracked-files=all`) do (
  set "STATUS_LINE=%%S"
  set "STATUS_PATH=!STATUS_LINE:~3!"
  if /i not "!STATUS_PATH!"=="%NOTES_GIT_FILE%" (
    echo The working tree has uncommitted changes outside %NOTES_FILE%.
    echo Commit or stash them before publishing %TAG%.
    exit /b 1
  )
)

git rev-parse -q --verify "refs/tags/%TAG%" >nul 2>nul
if not errorlevel 1 (
  echo Replacing existing local tag %TAG%...
  git tag -d "%TAG%"
  if errorlevel 1 exit /b !ERRORLEVEL!
)

git ls-remote --exit-code --tags origin "%TAG%" >nul 2>nul
if not errorlevel 1 (
  set "REMOTE_TAG_EXISTS=1"
)

for /f "usebackq delims=" %%R in (`gh repo view --json nameWithOwner --jq ".nameWithOwner"`) do set "REPO=%%R"
if not defined REPO (
  echo Could not determine the GitHub repository.
  exit /b 1
)

gh release view "%TAG%" --repo "%REPO%" >nul 2>nul
if not errorlevel 1 (
  set "RELEASE_EXISTS=1"
)

echo Pushing %BRANCH% to origin...
git push origin "%BRANCH%"
if errorlevel 1 exit /b %ERRORLEVEL%

echo Creating release tag %TAG%...
git tag -a "%TAG%" -m "Release %VERSION%"
if errorlevel 1 exit /b %ERRORLEVEL%

if defined RELEASE_EXISTS (
  echo Replacing existing GitHub release %TAG%...
  gh release delete "%TAG%" --repo "%REPO%" --yes
  if errorlevel 1 exit /b %ERRORLEVEL%
)

echo Pushing release tag %TAG%...
if defined REMOTE_TAG_EXISTS (
  echo Replacing existing origin tag %TAG%...
  git push --force origin "%TAG%"
) else (
  git push origin "%TAG%"
)
if errorlevel 1 exit /b %ERRORLEVEL%

echo Release tag %TAG% has been pushed.
echo GitHub Actions will build the Windows .exe, .exe.blockmap, .msi, and latest.yml files, create the release as a draft, attach the files, then publish it.
exit /b 0
