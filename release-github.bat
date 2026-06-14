@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

where git.exe >nul 2>nul
if errorlevel 1 (
  echo git was not found. Install Git, then run this script again.
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Install Node.js, then run this script again.
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

for /f "usebackq delims=" %%B in (`git branch --show-current`) do set "BRANCH=%%B"
if not defined BRANCH (
  echo Could not determine the current Git branch.
  exit /b 1
)

for /f "usebackq delims=" %%S in (`git status --porcelain`) do (
  echo The working tree has uncommitted changes.
  echo Commit or stash them before publishing %TAG%.
  exit /b 1
)

git rev-parse -q --verify "refs/tags/%TAG%" >nul 2>nul
if not errorlevel 1 (
  echo Tag %TAG% already exists locally.
  exit /b 1
)

git ls-remote --exit-code --tags origin "%TAG%" >nul 2>nul
if not errorlevel 1 (
  echo Tag %TAG% already exists on origin.
  exit /b 1
)

for /f "usebackq delims=" %%R in (`gh repo view --json nameWithOwner --jq ".nameWithOwner"`) do set "REPO=%%R"
if not defined REPO (
  echo Could not determine the GitHub repository.
  exit /b 1
)

gh release view "%TAG%" --repo "%REPO%" >nul 2>nul
if not errorlevel 1 (
  echo Release %TAG% already exists on GitHub.
  exit /b 1
)

echo Running a local build check...
call npm.cmd run build
if errorlevel 1 exit /b %ERRORLEVEL%

echo Pushing %BRANCH% to origin...
git push origin "%BRANCH%"
if errorlevel 1 exit /b %ERRORLEVEL%

echo Creating release tag %TAG%...
git tag -a "%TAG%" -m "Release %VERSION%"
if errorlevel 1 exit /b %ERRORLEVEL%

echo Pushing release tag %TAG%...
git push origin "%TAG%"
if errorlevel 1 exit /b %ERRORLEVEL%

gh release view "%TAG%" --repo "%REPO%" >nul 2>nul
if errorlevel 1 (
  echo Creating GitHub release %TAG% with generated release notes...
  gh release create "%TAG%" --repo "%REPO%" --title "Rest Stop %VERSION%" --generate-notes --verify-tag
  if errorlevel 1 exit /b !ERRORLEVEL!
) else (
  echo Release %TAG% already exists on GitHub.
)

for /f "usebackq delims=" %%U in (`gh release view "%TAG%" --repo "%REPO%" --json url --jq ".url"`) do set "RELEASE_URL=%%U"

echo Release %TAG% has been created: %RELEASE_URL%
echo GitHub Actions will build and upload the Windows installer.
exit /b 0
