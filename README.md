# Rest Stop

Simple restic backups.

<p align="center">
  <img src="public/app-icon/icon.png" alt="Rest Stop application icon" width="112" height="112">
</p>

<p align="center">
  <a href="https://github.com/srivatsshankar/rest-stop/actions/workflows/tests.yml"><img src="https://github.com/srivatsshankar/rest-stop/actions/workflows/tests.yml/badge.svg" alt="Tests"></a>
  <a href="https://github.com/srivatsshankar/rest-stop/releases"><img src="https://img.shields.io/github/downloads/srivatsshankar/rest-stop/total?label=downloads" alt="Downloads"></a>
</p>

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


## Downloads

Download the installer that applies to your system from the [Rest Stop releases page](https://github.com/srivatsshankar/rest-stop/releases).

## Previews

### Backup Creation

Shows the guided flow for creating a new restic backup profile.

![Backup creation preview](docs/previews/backup-creation.png)

### Restoration Example

Shows the restore workflow for selecting a backup and restoring files.

![Restoration example preview](docs/previews/restoration-example.png)

### Settings Menu

Shows the application settings, including tool checks, appearance, and update preferences.

![Settings menu preview](docs/previews/settings-menu.png)

### Light Mode

Shows the application light mode.

![Light mode preview](docs/previews/light-mode.png)

### Collapsible Menu

Shows the collapsible menu providing details of each backup.

![Collapsible menu preview](docs/previews/dropdown.png)

### Taskbar

Shows the taskbar status indicator used to reflect idle, running, and failed backup or restore activity. The application is minimized to the taskbar.

<p align="center">
  <img src="docs/previews/taskbar.png" alt="Taskbar preview">
</p>

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
