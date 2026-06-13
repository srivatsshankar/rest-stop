<p align="center">
  <img src="public/app-icon/icon.png" alt="Rest Stop application icon" width="112" height="112">
</p>

# Rest Stop

Simple restic backups.

[![Tests](https://github.com/srivatsshankar/rest-stop/actions/workflows/tests.yml/badge.svg)](https://github.com/srivatsshankar/rest-stop/actions/workflows/tests.yml)
[![Downloads](https://img.shields.io/github/downloads/srivatsshankar/rest-stop/total?label=downloads)](https://github.com/srivatsshankar/rest-stop/releases)

<p align="center">
  <img src="docs/app-preview.png" alt="Rest Stop application preview">
</p>

Rest Stop is a lightweight desktop app for creating, managing, and restoring restic backups without using the command line.

## Features

- Create restic backup profiles with clear step-by-step setup.
- Restore from saved profiles or manual backup locations.
- Choose local folders, SMB paths, SFTP, REST, and Rclone-backed repositories.
- Store and reuse backup passwords through Electron secure storage.
- Run backups on demand or by saved recurring schedules.
- Keep scheduled backups running from the system tray after the window is closed.
- Start automatically when the installed app launches at login.
- Show backup and restore activity in the taskbar and system tray.
- Surface backup and restore failures with persistent error details.
- Generate Windows and macOS app icon formats from a single PNG source.
- Build a Windows NSIS installer that supports updating existing installs.
- Check GitHub Releases for updates, download them automatically, and install them when no backup or restore is active.

## Downloads

Download the installer that applies to your system from the [Rest Stop releases page](https://github.com/srivatsshankar/rest-stop/releases).

## Development

### Local Setup

Install dependencies:

```bash
npm install
```

Run the app in development:

```bash
npm run dev
```

Run tests:

```bash
npm test
```

Build the installer:

```bash
npm run dist
```

### App Icon

Drop a square PNG at:

```text
public/app-icon/icon.png
```

Running `npm run dev`, `npm run build`, or `npm run dist` generates the native icon formats used by the app.

### Publishing Releases

Use the version in `package.json`, commit the release, then run:

```bat
release-github.bat
```

The script pushes a `vX.Y.Z` tag, which triggers GitHub Actions to publish the Windows installer and update metadata.
