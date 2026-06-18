const { app, BrowserWindow, Menu, Tray, Notification, dialog, ipcMain, nativeImage, safeStorage, screen, shell } = require("electron");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const log = require("electron-log");
const { autoUpdater } = require("electron-updater");

const APP_NAME = "Rest Stop";

if (!app.isPackaged) {
  const devDataPath = path.join(__dirname, "..", ".dev-data");
  fs.mkdirSync(devDataPath, { recursive: true });
  app.setPath("userData", devDataPath);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    if (isBackgroundLaunchCommand(commandLine)) return;
    if (app.isReady()) showMainWindow();
    else app.whenReady().then(showMainWindow);
  });
}

let mainWindow;
let tray;
let currentTaskbarStatus = "paused";
let isQuitting = false;
let updateReadyToInstall = false;
let updateInstallTimer = null;
let updaterConfigured = false;
let updateStatus = {
  status: app.isPackaged ? "idle" : "unavailable",
  version: null,
  percent: null,
  pendingInstall: false,
  message: app.isPackaged ? "No update is pending." : "Update status is available in the installed app.",
  checkedAt: new Date().toISOString()
};
let activeRestoreRunCount = 0;
const BACKGROUND_LAUNCH_ARG = "--reststop-background";
const activeBackupRuns = new Map();
let cachedRestic = null;
let cachedRclone = null;
const CACHE_TTL_MS = 5 * 60 * 1000;
const NETWORK_RETRY_MS = 2 * 60 * 1000;
const MAX_NETWORK_RETRY_MS = 60 * 60 * 1000;
const RESTIC_REPOSITORY_TIMEOUT_MS = 10 * 60 * 1000;
const BACKUP_STALL_TIMEOUT_MS = 20 * 60 * 1000;
const AUTH_RETRY_DELAY_MS = 5 * 1000;
const RCLONE_CONFIG_PASSWORD_KEY = "encryptedRcloneConfigPassword";
const FAILURE_NOTIFICATION_HISTORY_FILE = "failure-notifications.json";
const NOTIFICATION_LOG_FILE = "notifications.json";
const BASE_RCLONE_RESTIC_ARGS = [
  "serve restic",
  "--stdio",
  "--fast-list",
  "--b2-hard-delete",
  "--checkers 4",
  "--transfers 4",
  "--low-level-retries 10",
  "--retries 5",
  "--retries-sleep 10s",
  "--timeout 5m",
  "--contimeout 30s",
  "--buffer-size 32M",
  "--expect-continue-timeout 5s"
];
const RCLONE_BACKEND_EXTRAS_HIGH_PERF = {
  drive: [
    "--drive-use-trash=false",
    "--max-connections 12",
    "--tpslimit 10",
    "--tpslimit-burst 12",
    "--drive-pacer-min-sleep 200ms",
    "--drive-pacer-burst 16",
    "--drive-chunk-size 64M",
    "--drive-stop-on-upload-limit",
    "--drive-acknowledge-abuse",
    "--transfers 8"
  ],
  onedrive: [
    "--checkers 3",
    "--transfers 3",
    "--max-connections 6",
    "--tpslimit 6",
    "--tpslimit-burst 10",
    "--onedrive-chunk-size 10M"
  ],
  dropbox: [
    "--checkers 8",
    "--transfers 8",
    "--max-connections 12",
    "--tpslimit 8",
    "--tpslimit-burst 12",
    "--dropbox-batch-mode sync",
    "--dropbox-batch-size 8",
    "--dropbox-batch-timeout 1s"
  ],
  box: [
    "--checkers 4",
    "--transfers 4",
    "--max-connections 8",
    "--tpslimit 6",
    "--tpslimit-burst 8",
    "--box-upload-cutoff 50M",
    "--box-commit-retries 100"
  ],
  pcloud: [
    "--checkers 4",
    "--transfers 4",
    "--max-connections 6",
    "--tpslimit 6",
    "--tpslimit-burst 8"
  ],
  yandex: [
    "--checkers 4",
    "--transfers 4",
    "--max-connections 6",
    "--tpslimit 6",
    "--tpslimit-burst 8",
    "--yandex-hard-delete"
  ],
  mega: [
    "--checkers 2",
    "--transfers 2",
    "--max-connections 4",
    "--tpslimit 4",
    "--tpslimit-burst 4",
    "--mega-use-https",
    "--mega-hard-delete"
  ],
  b2: [
    "--checkers 4",
    "--transfers 4",
    "--max-connections 8",
    "--b2-hard-delete",
    "--b2-upload-concurrency 4",
    "--b2-chunk-size 96M"
  ],
  s3: [
    "--checkers 4",
    "--transfers 4",
    "--max-connections 8",
    "--s3-upload-concurrency 4",
    "--s3-chunk-size 16M"
  ],
  smb: [
    "--checkers 2",
    "--transfers 2",
    "--max-connections 4",
    "--smb-idle-timeout 5m"
  ]
};
const RCLONE_BACKEND_EXTRAS_STANDARD = {
  drive: [
    "--drive-use-trash=false",
    "--max-connections 8",
    "--tpslimit 8",
    "--tpslimit-burst 12",
    "--drive-pacer-min-sleep 200ms",
    "--drive-pacer-burst 16",
    "--drive-chunk-size 16M",
    "--drive-stop-on-upload-limit"
  ],
  onedrive: [
    "--checkers 3",
    "--transfers 3",
    "--max-connections 6",
    "--tpslimit 6",
    "--tpslimit-burst 10"
  ],
  dropbox: [
    "--checkers 4",
    "--transfers 4",
    "--max-connections 8",
    "--tpslimit 6",
    "--tpslimit-burst 8",
    "--dropbox-batch-mode sync",
    "--dropbox-batch-size 4",
    "--dropbox-batch-timeout 1s"
  ],
  box: [
    "--checkers 3",
    "--transfers 3",
    "--max-connections 6",
    "--tpslimit 4",
    "--tpslimit-burst 6",
    "--box-upload-cutoff 50M",
    "--box-commit-retries 100"
  ],
  pcloud: [
    "--checkers 3",
    "--transfers 3",
    "--max-connections 4",
    "--tpslimit 4",
    "--tpslimit-burst 6"
  ],
  yandex: [
    "--checkers 3",
    "--transfers 3",
    "--max-connections 4",
    "--tpslimit 4",
    "--tpslimit-burst 6",
    "--yandex-hard-delete"
  ],
  mega: [
    "--checkers 2",
    "--transfers 2",
    "--max-connections 4",
    "--tpslimit 4",
    "--tpslimit-burst 4",
    "--mega-use-https",
    "--mega-hard-delete"
  ],
  b2: [
    "--checkers 3",
    "--transfers 3",
    "--max-connections 6",
    "--b2-hard-delete",
    "--b2-upload-concurrency 2",
    "--b2-chunk-size 96M"
  ],
  s3: [
    "--checkers 3",
    "--transfers 3",
    "--max-connections 6",
    "--s3-upload-concurrency 2",
    "--s3-chunk-size 16M"
  ],
  smb: [
    "--checkers 2",
    "--transfers 2",
    "--max-connections 4",
    "--smb-idle-timeout 5m"
  ]
};
const rcloneDirectoryCache = new Map();
const restoreSnapshotCache = new Map();
const restoreFileTreeCache = new Map();
const knownRepositories = new Set();

const DEFAULT_EXCLUDES = [
  "**/venv/",
  "**/env/",
  "**/.venv/",
  "**/virtualenv/",
  "**/__pycache__/",
  "*.pyc",
  "*.pyo",
  "**/node_modules/",
  "**/.npm/",
  "**/.yarn/",
  "**/.pnpm-store/",
  "**/vendor/",
  "**/target/",
  "**/build/",
  "**/dist/",
  "**/.gradle/",
  "**/.m2/",
  "**/.bundle/",
  "**/bin/Debug/",
  "**/bin/Release/",
  "**/obj/",
  "**/.next/",
  "**/.nuxt/",
  "**/.cache/",
  "**/.pytest_cache/",
  "**/.tox/",
  "**/.eggs/",
  "*.egg-info/",
  "**/.vscode/",
  "**/.idea/"
];

const OLD_DEFAULT_DATA_EXCLUDES = ["*.*parquet", "*.*csv", "*.*duckdb"];
const OLD_DEFAULT_EXCLUDE_MARKERS = [
  ...OLD_DEFAULT_DATA_EXCLUDES,
  "**/venv/",
  "**/node_modules/",
  "**/.cache/",
  "**/.vscode/",
  "**/.idea/"
];

const rcloneBackends = {
  drive: {
    label: "Google Drive",
    auth: "oauth",
    config: ["scope", "drive"]
  },
  onedrive: { label: "OneDrive", auth: "oauth", config: ["drive_type", "personal"] },
  dropbox: { label: "Dropbox", auth: "oauth", config: [] },
  box: { label: "Box", auth: "oauth", config: [] },
  pcloud: { label: "pCloud", auth: "oauth", config: [] },
  yandex: { label: "Yandex Disk", auth: "oauth", config: [] },
  mega: {
    label: "MEGA",
    auth: "fields",
    fields: [
      { key: "user", configKey: "user", label: "MEGA email", required: true },
      { key: "pass", configKey: "pass", label: "MEGA password", required: true, password: true },
      { key: "2fa", configKey: "2fa", label: "2FA code", required: false }
    ]
  },
  b2: {
    label: "Backblaze B2",
    auth: "fields",
    fields: [
      { key: "account", configKey: "account", label: "Application key ID", required: true },
      { key: "key", configKey: "key", label: "Application key", required: true, password: true },
      { key: "endpoint", configKey: "endpoint", label: "Endpoint", required: false }
    ]
  },
  s3: {
    label: "S3",
    auth: "fields",
    config: ["env_auth", "false"],
    fields: [
      { key: "provider", configKey: "provider", label: "Provider", required: true },
      { key: "access_key_id", configKey: "access_key_id", label: "Access key ID", required: true },
      { key: "secret_access_key", configKey: "secret_access_key", label: "Secret access key", required: true, password: true },
      { key: "region", configKey: "region", label: "Region", required: false },
      { key: "endpoint", configKey: "endpoint", label: "Endpoint", required: false }
    ]
  },
  smb: {
    label: "SMB / CIFS",
    auth: "fields",
    fields: [
      { key: "host", configKey: "host", label: "Host", required: true },
      { key: "user", configKey: "user", label: "Username", required: false },
      { key: "pass", configKey: "pass", label: "Password", required: false, password: true },
      { key: "domain", configKey: "domain", label: "Domain", required: false }
    ]
  }
};

function createWindow(options = {}) {
  const appIcon = resolveAppIconPath();
  const shouldShow = options.show ?? !isBackgroundLaunch();

  mainWindow = new BrowserWindow({
    width: 640,
    height: 720,
    minWidth: 500,
    minHeight: 560,
    title: "Rest Stop",
    ...(appIcon ? { icon: appIcon } : {}),
    frame: false,
    transparent: false,
    hasShadow: true,
    show: shouldShow,
    skipTaskbar: false,
    autoHideMenuBar: true,
    backgroundColor: "#fbfaf7",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  updateTaskbarStatus("paused");
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

if (gotSingleInstanceLock) {
  app.whenReady().then(() => {
    app.setName(APP_NAME);
    Menu.setApplicationMenu(null);
    if (process.platform === "win32") app.setAppUserModelId("com.reststop.app");
    configureAutoLaunch();
    const dockIcon = resolveAppIconPath(["png", "icns"]);
    if (process.platform === "darwin" && dockIcon) app.dock.setIcon(dockIcon);
    registerIpc();
    createTray();
    createWindow();
    configureAutoUpdater();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow({ show: true });
    });
  });
}

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (isQuitting && process.platform !== "darwin") app.quit();
});

function resolveAppIconPath(preferredExtensions) {
  const extensions = preferredExtensions ?? (
    process.platform === "win32"
      ? ["ico", "png"]
      : process.platform === "darwin"
        ? ["icns", "png"]
        : ["png", "ico"]
  );
  const appRoot = path.join(__dirname, "..");
  const directories = [
    path.join(appRoot, "public", "app-icon"),
    path.join(appRoot, "dist", "app-icon"),
    path.join(process.resourcesPath ?? "", "app-icon")
  ];

  for (const directory of directories) {
    for (const extension of extensions) {
      const iconPath = path.join(directory, `icon.${extension}`);
      if (fs.existsSync(iconPath)) return iconPath;
    }
  }

  return null;
}

function configureAutoLaunch() {
  if (!app.isPackaged || (process.platform !== "win32" && process.platform !== "darwin")) return;
  const settings = {
    openAtLogin: true
  };
  if (process.platform === "win32") {
    settings.path = process.execPath;
    settings.args = [BACKGROUND_LAUNCH_ARG];
  }
  if (process.platform === "darwin") {
    settings.openAsHidden = true;
  }
  app.setLoginItemSettings(settings);
}

function configureAutoUpdater() {
  if (!app.isPackaged) {
    setUpdateStatus({
      status: "unavailable",
      version: null,
      percent: null,
      pendingInstall: false,
      message: "Update status is available in the installed app."
    });
    return;
  }
  if (!updaterConfigured) {
    autoUpdater.logger = log;
    log.transports.file.level = "info";
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on("checking-for-update", () => {
      setUpdateStatus({
        status: "checking",
        percent: null,
        pendingInstall: false,
        message: "Checking for updates..."
      });
    });
    autoUpdater.on("update-available", (info) => {
      setUpdateStatus({
        status: "available",
        version: updateInfoVersion(info),
        percent: 0,
        pendingInstall: false,
        message: updateInfoVersion(info)
          ? `Upgrade to version ${updateInfoVersion(info)} is available.`
          : "An update is available."
      });
    });
    autoUpdater.on("download-progress", (progress) => {
      const percent = clampPercent(progress?.percent);
      setUpdateStatus({
        status: "downloading",
        percent,
        pendingInstall: false,
        message: percent === null ? "Downloading update..." : `Downloading update: ${Math.round(percent)}%.`
      });
    });
    autoUpdater.on("update-downloaded", (info) => {
      updateReadyToInstall = true;
      setUpdateStatus({
        status: "downloaded",
        version: updateInfoVersion(info) ?? updateStatus.version,
        percent: 100,
        pendingInstall: true,
        message: backupOrRestoreIsActive()
          ? "Update downloaded. Installation is pending until backups and restores finish."
          : "Update downloaded. Installation is pending."
      });
      installPendingUpdateWhenIdle();
    });
    autoUpdater.on("update-not-available", () => {
      setUpdateStatus({
        status: "idle",
        version: null,
        percent: null,
        pendingInstall: false,
        message: "No update is pending."
      });
    });
    autoUpdater.on("error", (error) => {
      log.error("Auto-update failed", error);
      setUpdateStatus({
        status: "error",
        percent: null,
        pendingInstall: updateReadyToInstall,
        message: error instanceof Error ? error.message : "Unable to check for updates."
      });
    });
    updaterConfigured = true;
  }

  if (!getAutoUpdatesEnabled()) {
    stopAutoUpdateChecks();
    return;
  }

  startAutoUpdateChecks();
}

function startAutoUpdateChecks() {
  if (updateInstallTimer) return;
  autoUpdater.autoDownload = true;
  autoUpdater.checkForUpdatesAndNotify().catch((error) => {
    log.error("Auto-update check failed", error);
  });
  updateInstallTimer = setInterval(() => {
    if (updateReadyToInstall) installPendingUpdateWhenIdle();
    else autoUpdater.checkForUpdates().catch((error) => log.error("Auto-update check failed", error));
  }, 6 * 60 * 60 * 1000);
  if (typeof updateInstallTimer.unref === "function") updateInstallTimer.unref();
}

function stopAutoUpdateChecks() {
  if (updateInstallTimer) {
    clearInterval(updateInstallTimer);
    updateInstallTimer = null;
  }
  autoUpdater.autoDownload = false;
  updateReadyToInstall = false;
  setUpdateStatus({
    status: "disabled",
    version: null,
    percent: null,
    pendingInstall: false,
    message: "Automatic updates are turned off."
  });
}

function installPendingUpdateWhenIdle() {
  if (!getAutoUpdatesEnabled() || !updateReadyToInstall) return;
  if (backupOrRestoreIsActive()) {
    setUpdateStatus({
      status: "downloaded",
      percent: 100,
      pendingInstall: true,
      message: "Update downloaded. Installation is pending until backups and restores finish."
    });
    return;
  }
  setUpdateStatus({
    status: "installing",
    percent: 100,
    pendingInstall: true,
    message: "Installing update..."
  });
  updateReadyToInstall = false;
  isQuitting = true;
  autoUpdater.quitAndInstall(false, true);
}

function getUpdateStatus() {
  return {
    ...updateStatus,
    enabled: getAutoUpdatesEnabled(),
    pendingInstall: Boolean(updateStatus.pendingInstall || updateReadyToInstall)
  };
}

async function checkForUpdatesNow() {
  if (!app.isPackaged) {
    configureAutoUpdater();
    return getUpdateStatus();
  }

  if (!updaterConfigured) configureAutoUpdater();
  if (updateReadyToInstall) {
    installPendingUpdateWhenIdle();
    return getUpdateStatus();
  }

  setUpdateStatus({
    status: "checking",
    percent: null,
    pendingInstall: false,
    message: "Checking for updates..."
  });

  try {
    autoUpdater.autoDownload = getAutoUpdatesEnabled();
    await autoUpdater.checkForUpdates();
  } catch (error) {
    log.error("Manual update check failed", error);
    setUpdateStatus({
      status: "error",
      percent: null,
      pendingInstall: updateReadyToInstall,
      message: error instanceof Error ? error.message : "Unable to check for updates."
    });
  }

  return getUpdateStatus();
}

function setUpdateStatus(nextStatus) {
  updateStatus = {
    ...updateStatus,
    ...nextStatus,
    checkedAt: new Date().toISOString()
  };
}

function updateInfoVersion(info) {
  const version = String(info?.version ?? "").trim();
  return version || null;
}

function clampPercent(value) {
  const percent = Number(value);
  return Number.isFinite(percent) ? Math.max(0, Math.min(percent, 100)) : null;
}

function backupOrRestoreIsActive() {
  return activeRestoreRunCount > 0 || [...activeBackupRuns.values()].some((state) => state?.running);
}

function isBackgroundLaunch() {
  if (isBackgroundLaunchCommand(process.argv)) return true;
  if (process.platform !== "darwin") return false;
  return Boolean(app.getLoginItemSettings().wasOpenedAsHidden);
}

function isBackgroundLaunchCommand(commandLine) {
  return Array.isArray(commandLine) && commandLine.includes(BACKGROUND_LAUNCH_ARG);
}

function registerIpc() {
  ipcMain.handle("restic:ensure", ensureRestic);
  ipcMain.handle("rclone:ensure", ensureRclone);
  ipcMain.handle("profiles:list", () => listProfiles().map(sanitizeProfileForRenderer));
  ipcMain.handle("profiles:save", (_event, profile) => saveProfile(profile));
  ipcMain.handle("profiles:delete", (_event, options) => deleteProfile(options));
  ipcMain.handle("profiles:set-schedule-paused", (_event, options) => setProfileSchedulePaused(options));
  ipcMain.handle("backup:get-stored-password", (_event, profileId) => getStoredPassword(profileId));
  ipcMain.handle("backup:save-password", (_event, profileId, password) => savePasswordToStore(profileId, password));
  ipcMain.handle("dialog:backup-sources", chooseBackupSources);
  ipcMain.handle("dialog:directory", chooseDirectory);
  ipcMain.handle("fs:home", () => os.homedir());
  ipcMain.handle("fs:roots", listRoots);
  ipcMain.handle("fs:list", (_event, dirPath) => listDirectory(dirPath));
  ipcMain.handle("shell:open-external", (_event, url) => shell.openExternal(url));
  ipcMain.handle("backup:analyze-location", (_event, targetPath) => analyzeBackupLocation(targetPath));
  ipcMain.handle("backup:get-status", getBackupStatus);
  ipcMain.handle("backup:start", (_event, profile, password) => startBackup(profile, password));
  ipcMain.handle("backup:stop", (_event, profileId) => stopBackup(profileId));
  ipcMain.handle("rclone:connect-account", (_event, options) => connectRcloneAccount(options));
  ipcMain.handle("rclone:setup-repository", (_event, options) => setupRcloneRepository(options));
  ipcMain.handle("rclone:list-directory", (_event, options) => listRcloneDirectory(options));
  ipcMain.handle("rclone:create-directory", (_event, options) => createRcloneDirectory(options));
  ipcMain.handle("restore:list-snapshots", (_event, options) => listRestoreSnapshots(options));
  ipcMain.handle("restore:list-files", (_event, options) => listRestoreFiles(options));
  ipcMain.handle("restore:start", (_event, options) => startRestore(options));
  ipcMain.handle("settings:get", () => readSettings());
  ipcMain.handle("settings:save-backup-defaults", (_event, settings) => saveBackupDefaults(settings));
  ipcMain.handle("settings:get-high-performance", () => getHighPerformanceEnabled());
  ipcMain.handle("settings:set-high-performance", (_event, enabled) => setHighPerformanceEnabled(enabled));
  ipcMain.handle("updates:get-auto-enabled", () => getAutoUpdatesEnabled());
  ipcMain.handle("updates:set-auto-enabled", (_event, enabled) => setAutoUpdatesEnabled(enabled));
  ipcMain.handle("updates:get-status", getUpdateStatus);
  ipcMain.handle("updates:check-now", checkForUpdatesNow);
  ipcMain.handle("config:export", exportConfig);
  ipcMain.handle("config:restore", restoreConfig);
  ipcMain.handle("config:export-backup", (_event, profileId) => exportBackupConfig(profileId));
  ipcMain.handle("config:load-backup", loadBackupConfig);
  ipcMain.handle("notifications:list", listNotificationLog);
  ipcMain.handle("taskbar:set-status", (_event, status) => updateTaskbarStatus(status));
  ipcMain.handle("window:minimize", (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
  ipcMain.handle("window:toggle-maximize", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  ipcMain.handle("window:close", (event) => BrowserWindow.fromWebContents(event.sender)?.close());
}

function createTray() {
  if (tray) return;
  tray = new Tray(createTrayStatusIcon(currentTaskbarStatus));
  tray.setToolTip(taskbarOverlayDescription(currentTaskbarStatus));
  tray.on("click", toggleMainWindow);
  tray.on("right-click", (_event, bounds) => {
    tray.popUpContextMenu(createTrayMenu(), trayMenuPosition(bounds));
  });
}

function createTrayMenu() {
  return Menu.buildFromTemplate([
    { label: "Open Rest Stop", click: showMainWindow },
    { type: "separator" },
    { label: "Quit", click: quitFromTray }
  ]);
}

function trayMenuPosition(bounds) {
  if (process.platform !== "win32") return undefined;
  const trayBounds = bounds ?? tray?.getBounds?.();
  if (!trayBounds) return undefined;

  const trayCenter = {
    x: Math.round(trayBounds.x + trayBounds.width / 2),
    y: Math.round(trayBounds.y + trayBounds.height / 2)
  };
  const workArea = screen.getDisplayNearestPoint(trayCenter).workArea;
  const right = workArea.x + workArea.width - 1;
  const bottom = workArea.y + workArea.height - 1;

  return {
    x: Math.max(workArea.x + 1, Math.min(trayCenter.x, right)),
    y: Math.max(workArea.y + 1, Math.min(trayCenter.y, bottom))
  };
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow({ show: true });
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function toggleMainWindow() {
  if (!mainWindow || !mainWindow.isVisible() || mainWindow.isMinimized()) {
    showMainWindow();
    return;
  }
  mainWindow.hide();
}

function quitFromTray() {
  isQuitting = true;
  app.quit();
}

function updateTaskbarStatus(status) {
  const taskbarStatus = ["running", "failed", "paused"].includes(status) ? status : "paused";
  currentTaskbarStatus = taskbarStatus;
  const description = taskbarOverlayDescription(taskbarStatus);
  if (process.platform === "win32" && mainWindow) {
    mainWindow.setOverlayIcon(createTaskbarOverlayIcon(taskbarStatus), description);
  }
  if (tray) {
    tray.setImage(createTrayStatusIcon(taskbarStatus));
    tray.setToolTip(description);
  }
}

function taskbarOverlayDescription(status) {
  if (status === "running") return "Backup or restore running";
  if (status === "failed") return "Backup or restore failed";
  return "No backup or restore running";
}

function createTaskbarOverlayIcon(status) {
  return nativeImage.createFromBuffer(encodePng(16, 16, createStatusBadgePixels(status, 16, 7.5, 7.5, 7.2)));
}

function createTrayStatusIcon(status) {
  const imageSize = process.platform === "win32" ? 32 : 22;
  const pixels = createBaseIconPixels(imageSize);
  drawStatusBadge(pixels, imageSize, status, imageSize - 9, imageSize - 9, 8);
  return nativeImage.createFromBuffer(encodePng(imageSize, imageSize, pixels));
}

function createBaseIconPixels(imageSize) {
  const iconPath = resolveAppIconPath(["png", "ico", "icns"]);
  if (iconPath) {
    const image = nativeImage.createFromPath(iconPath);
    if (!image.isEmpty()) {
      const resized = image.resize({ width: imageSize, height: imageSize, quality: "best" });
      const bitmap = resized.toBitmap();
      if (bitmap.length >= imageSize * imageSize * 4) return bitmapToRgba(bitmap, imageSize);
    }
  }

  const pixels = Buffer.alloc(imageSize * imageSize * 4);
  drawCircle(pixels, imageSize, imageSize / 2 - 0.5, imageSize / 2 - 0.5, imageSize / 2 - 1, 36, 98, 82, 255);
  fillRect(pixels, imageSize, Math.round(imageSize * 0.28), Math.round(imageSize * 0.34), Math.round(imageSize * 0.44), Math.round(imageSize * 0.32), 255, 255, 255, 255);
  fillRect(pixels, imageSize, Math.round(imageSize * 0.35), Math.round(imageSize * 0.25), Math.round(imageSize * 0.30), Math.round(imageSize * 0.12), 255, 255, 255, 255);
  return pixels;
}

function bitmapToRgba(bitmap, imageSize) {
  const pixels = Buffer.alloc(imageSize * imageSize * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = bitmap[index + 2];
    pixels[index + 1] = bitmap[index + 1];
    pixels[index + 2] = bitmap[index];
    pixels[index + 3] = bitmap[index + 3];
  }
  return pixels;
}

function createStatusBadgePixels(status, imageSize, centerX, centerY, radius) {
  const pixels = Buffer.alloc(imageSize * imageSize * 4);
  drawStatusBadge(pixels, imageSize, status, centerX, centerY, radius);
  return pixels;
}

function drawStatusBadge(pixels, imageSize, status, centerX, centerY, radius) {
  const colors = {
    paused: { red: 97, green: 105, blue: 98 },
    running: { red: 34, green: 139, blue: 68 },
    failed: { red: 210, green: 49, blue: 45 }
  };
  const color = colors[status] ?? colors.paused;
  drawCircle(pixels, imageSize, centerX, centerY, radius + 1, 255, 255, 255, 255);
  drawCircle(pixels, imageSize, centerX, centerY, radius, color.red, color.green, color.blue, 255);

  const scale = radius / 7.2;
  const point = (x, y) => [centerX + (x - 7.5) * scale, centerY + (y - 7.5) * scale];

  if (status === "running") {
    drawTriangle(pixels, imageSize, [point(6, 4), point(6, 12), point(12, 8)], 255, 255, 255, 255);
  } else if (status === "failed") {
    drawLine(pixels, imageSize, ...point(5, 5), ...point(11, 11), Math.max(2, 2 * scale), 255, 255, 255, 255);
    drawLine(pixels, imageSize, ...point(11, 5), ...point(5, 11), Math.max(2, 2 * scale), 255, 255, 255, 255);
  } else {
    fillRect(pixels, imageSize, Math.round(point(5, 4)[0]), Math.round(point(5, 4)[1]), Math.max(2, Math.round(2 * scale)), Math.max(5, Math.round(8 * scale)), 255, 255, 255, 255);
    fillRect(pixels, imageSize, Math.round(point(9, 4)[0]), Math.round(point(9, 4)[1]), Math.max(2, Math.round(2 * scale)), Math.max(5, Math.round(8 * scale)), 255, 255, 255, 255);
  }
}

function drawCircle(pixels, size, centerX, centerY, radius, red, green, blue, alpha) {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY);
      if (distance <= radius) setPixel(pixels, size, x, y, red, green, blue, alpha);
    }
  }
}

function drawTriangle(pixels, size, points, red, green, blue, alpha) {
  const [a, b, c] = points;
  const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
  const maxX = Math.min(size - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
  const maxY = Math.min(size - 1, Math.ceil(Math.max(a[1], b[1], c[1])));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (pointInTriangle(x + 0.5, y + 0.5, a, b, c)) setPixel(pixels, size, x, y, red, green, blue, alpha);
    }
  }
}

function pointInTriangle(x, y, a, b, c) {
  const area = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  const d1 = area([x, y], a, b);
  const d2 = area([x, y], b, c);
  const d3 = area([x, y], c, a);
  return !(d1 < 0 || d2 < 0 || d3 < 0) || !(d1 > 0 || d2 > 0 || d3 > 0);
}

function drawLine(pixels, size, startX, startY, endX, endY, width, red, green, blue, alpha) {
  const radius = width / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (distanceToLine(x + 0.5, y + 0.5, startX, startY, endX, endY) <= radius) {
        setPixel(pixels, size, x, y, red, green, blue, alpha);
      }
    }
  }
}

function distanceToLine(x, y, startX, startY, endX, endY) {
  const dx = endX - startX;
  const dy = endY - startY;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(x - startX, y - startY);
  const amount = Math.max(0, Math.min(1, ((x - startX) * dx + (y - startY) * dy) / lengthSquared));
  return Math.hypot(x - (startX + amount * dx), y - (startY + amount * dy));
}

function fillRect(pixels, size, left, top, width, height, red, green, blue, alpha) {
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      setPixel(pixels, size, x, y, red, green, blue, alpha);
    }
  }
}

function setPixel(pixels, size, x, y, red, green, blue, alpha) {
  const index = (y * size + x) * 4;
  pixels[index] = red;
  pixels[index + 1] = green;
  pixels[index + 2] = blue;
  pixels[index + 3] = alpha;
}

function encodePng(width, height, pixels) {
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    scanlines[rowOffset] = 0;
    pixels.copy(scanlines, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  const chunks = [
    pngChunk("IHDR", createPngHeader(width, height)),
    pngChunk("IDAT", zlib.deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0))
  ];
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]);
}

function createPngHeader(width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return header;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

async function ensureRestic() {
  const existing = await findRestic();
  if (existing) return existing;

  if (process.platform !== "win32") {
    return {
      installed: false,
      message: "Automatic restic install is currently implemented for Windows. Install restic and check again."
    };
  }

  try {
    const installedPath = await installResticForWindows();
    const version = await getResticVersion(installedPath);
    cachedRestic = { installed: true, path: installedPath, version };
    return cachedRestic;
  } catch (error) {
    return { installed: false, message: error instanceof Error ? error.message : String(error) };
  }
}

async function findRestic() {
  if (cachedRestic) return cachedRestic;
  const bundled = resticInstallPath();
  if (fs.existsSync(bundled)) {
    cachedRestic = { installed: true, path: bundled, version: await getResticVersion(bundled) };
    return cachedRestic;
  }

  try {
    const version = await getResticVersion("restic");
    cachedRestic = { installed: true, path: "restic", version };
    return cachedRestic;
  } catch {
    return null;
  }
}

async function findRclone() {
  if (cachedRclone) return cachedRclone;
  const bundled = rcloneInstallPath();
  if (fs.existsSync(bundled)) {
    cachedRclone = { installed: true, path: bundled, version: await getRcloneVersion(bundled) };
    return cachedRclone;
  }

  try {
    cachedRclone = { installed: true, path: "rclone", version: await getRcloneVersion("rclone") };
    return cachedRclone;
  } catch {
    return null;
  }
}

async function ensureRclone() {
  const existing = await findRclone();
  if (existing) return existing;

  if (process.platform !== "win32") {
    return {
      installed: false,
      message: "Automatic Rclone install is currently implemented for Windows. Install Rclone and check again."
    };
  }

  try {
    const installedPath = await installRcloneForWindows();
    const version = await getRcloneVersion(installedPath);
    cachedRclone = { installed: true, path: installedPath, version };
    return cachedRclone;
  } catch (error) {
    return { installed: false, message: error instanceof Error ? error.message : String(error) };
  }
}

async function setupRcloneRepository(options) {
  const repositoryPath = normalizeRcloneRepositoryPath(options?.repositoryPath);
  const password = String(options?.password ?? "");
  if (!password) {
    throw new Error("Backup initialization requires the Restic backup password from Details.");
  }

  const { backend, backendConfig, remoteName, rclone } = await configureRcloneRemote(options);
  const restic = await findRestic();
  if (!restic?.path) {
    throw new Error("Restic is not installed yet. Check Restic in Settings, then try connecting this backend again.");
  }

  const repository = {
    type: "rclone",
    target: `rclone:${remoteName}:${repositoryPath}`,
    rcloneBackend: backend,
    rcloneRemoteName: remoteName,
    rclonePath: repositoryPath
  };
  await ensureResticRepository(
    restic.path,
    repository,
    envWithRcloneConfigPassword(envWithToolDirectory({ ...process.env, RESTIC_PASSWORD: password }, rclone.path))
  );

  return {
    backend,
    backendLabel: backendConfig.label,
    remoteName,
    repositoryPath,
    target: repository.target,
    message: options?.replaceRemote
      ? "Rclone account updated and the backup repository is ready."
      : "Rclone connected and the backup repository is ready."
  };
}

async function connectRcloneAccount(options) {
  const backend = String(options?.backend ?? "");
  const backendConfig = rcloneBackends[backend];
  if (!backendConfig) throw new Error("Choose a supported Rclone backend.");
  const remoteName = sanitizeRcloneRemoteName(options?.remoteName);
  const rclone = await ensureRclone();
  if (!rclone.installed || !rclone.path) {
    throw new Error(rclone.message ?? "Rclone is not installed or is not available on PATH. Install Rclone, then try connecting this backend again.");
  }
  await ensureRcloneConfigEncrypted(rclone.path);
  if (!options?.replaceRemote && await rcloneRemoteExists(rclone.path, remoteName)) {
    return {
      backend,
      backendLabel: backendConfig.label,
      remoteName,
      message: `${backendConfig.label} account is already connected.`
    };
  }

  const configured = await configureRcloneRemote({ ...options, replaceRemote: true });
  clearCacheByPrefix(rcloneDirectoryCache, `rclone:${configured.remoteName}:`);
  return {
    backend: configured.backend,
    backendLabel: configured.backendConfig.label,
    remoteName: configured.remoteName,
    message: `${configured.backendConfig.label} account connected.`
  };
}

async function configureRcloneRemote(options) {
  const backend = String(options?.backend ?? "");
  const backendConfig = rcloneBackends[backend];
  if (!backendConfig) throw new Error("Choose a supported Rclone backend.");

  const remoteName = sanitizeRcloneRemoteName(options?.remoteName);
  const configValues = options?.config && typeof options.config === "object" ? options.config : {};
  const replaceRemote = Boolean(options?.replaceRemote);
  const rclone = await ensureRclone();
  if (!rclone.installed || !rclone.path) {
    throw new Error(rclone.message ?? "Rclone is not installed or is not available on PATH. Install Rclone, then try connecting this backend again.");
  }
  await ensureRcloneConfigEncrypted(rclone.path);

  const configArgs = [...(backendConfig.config ?? [])];
  let shouldObscure = false;
  for (const field of backendConfig.fields ?? []) {
    const value = String(configValues[field.key] ?? "").trim();
    if (field.required && !value) throw new Error(`Enter ${field.label}.`);
    if (!value) continue;
    configArgs.push(field.configKey, value);
    if (field.password) shouldObscure = true;
  }

  if (backendConfig.auth === "oauth") {
    const oauthClientValues = backend === "drive" ? googleDriveOAuthClientValues() : [];
    if (oauthClientValues.length) {
      configArgs.push("client_id", oauthClientValues[0], "client_secret", oauthClientValues[1]);
      shouldObscure = true;
    }
    let auth;
    try {
      auth = await runProcess(rclone.path, ["authorize", backend, ...oauthClientValues], rcloneProcessOptions({ timeoutMs: 5 * 60 * 1000 }));
    } catch (error) {
      throw friendlyRcloneAuthorizeError(error, backendConfig.label);
    }
    const token = extractJsonObject(`${auth.stdout}\n${auth.stderr}`);
    configArgs.push("token", token);
  }

  if (replaceRemote) {
    try {
      await runProcess(
        rclone.path,
        ["config", "update", remoteName, ...configArgs, "--non-interactive", ...(shouldObscure ? ["--obscure"] : [])],
        rcloneProcessOptions({ timeoutMs: 60 * 1000 })
      );
    } catch (error) {
      if (!/not found|doesn't exist|couldn't find|not in config/i.test(errorOutput(error))) throw error;
      await runProcess(
        rclone.path,
        ["config", "create", remoteName, backend, ...configArgs, "--non-interactive", ...(shouldObscure ? ["--obscure"] : [])],
        rcloneProcessOptions({ timeoutMs: 60 * 1000 })
      );
    }
  } else {
    await runProcess(
      rclone.path,
      ["config", "create", remoteName, backend, ...configArgs, "--non-interactive", ...(shouldObscure ? ["--obscure"] : [])],
      rcloneProcessOptions({ timeoutMs: 60 * 1000 })
    );
  }

  return {
    backend,
    backendConfig,
    remoteName,
    rclone
  };
}

function googleDriveOAuthClientValues() {
  const clientId = String(process.env.RESTSTOP_GOOGLE_DRIVE_CLIENT_ID ?? "").trim();
  const clientSecret = String(process.env.RESTSTOP_GOOGLE_DRIVE_CLIENT_SECRET ?? "").trim();
  return clientId && clientSecret ? [clientId, clientSecret] : [];
}

async function ensureRcloneConfigEncrypted(rclonePath) {
  try {
    await runProcess(rclonePath, ["config", "encryption", "check", "--ask-password=false"], rcloneProcessOptions({ timeoutMs: 30 * 1000 }));
    return;
  } catch (error) {
    const output = errorOutput(error);
    if (/incorrect password|invalid password|failed to decrypt|couldn't decrypt|bad password/i.test(output)) {
      throw new Error("The Rclone config is encrypted with a different password. Reconnect it outside Rest Stop or reset the Rclone config before continuing.");
    }
  }

  const password = rcloneConfigPassword();
  await runProcess(
    rclonePath,
    ["config", "encryption", "set"],
    rcloneProcessOptions({ input: `${password}\n${password}\n`, timeoutMs: 60 * 1000 })
  );
}

async function rcloneRemoteExists(rclonePath, remoteName) {
  try {
    await runProcess(rclonePath, ["config", "show", remoteName], rcloneProcessOptions({ timeoutMs: 10000 }));
    return true;
  } catch {
    return false;
  }
}

function sanitizeRcloneRemoteName(value) {
  const remoteName = String(value ?? "")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!remoteName) throw new Error("Enter a Rclone remote name.");
  return remoteName;
}

function normalizeRcloneRepositoryPath(value) {
  const repositoryPath = String(value ?? "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!repositoryPath) throw new Error("Enter a remote backup folder.");
  return repositoryPath;
}

function normalizeRcloneDirectoryPath(value) {
  return String(value ?? "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

async function listRcloneDirectory(options) {
  const remoteName = sanitizeRcloneRemoteName(options?.remoteName);
  const directoryPath = normalizeRcloneDirectoryPath(options?.path);
  const cacheKey = `rclone:${remoteName}:${directoryPath}`;
  const cached = getCachedValue(rcloneDirectoryCache, cacheKey);
  if (cached) return cached;

  const rclone = await findRclone();
  if (!rclone?.path) throw new Error("Rclone is not installed.");

  let result;
  try {
    result = await runProcess(
      rclone.path,
      ["lsf", rcloneRemoteTarget(remoteName, directoryPath), "--dirs-only", "--format", "p"],
      rcloneProcessOptions({ timeoutMs: 60 * 1000 })
    );
  } catch (error) {
    throw friendlyRcloneRemoteError(error, remoteName);
  }
  const entries = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\/+$/g, ""))
    .filter(Boolean)
    .map((name) => ({
      name,
      path: joinRclonePath(directoryPath, name),
      type: "directory"
    }))
    .sort((first, second) => first.name.localeCompare(second.name));

  const listing = {
    path: directoryPath,
    parent: rcloneParentPath(directoryPath),
    entries
  };
  setCachedValue(rcloneDirectoryCache, cacheKey, listing);
  return listing;
}

async function createRcloneDirectory(options) {
  const remoteName = sanitizeRcloneRemoteName(options?.remoteName);
  const directoryPath = normalizeRcloneRepositoryPath(options?.path);
  const rclone = await findRclone();
  if (!rclone?.path) throw new Error("Rclone is not installed.");

  try {
    await runProcess(rclone.path, ["mkdir", rcloneRemoteTarget(remoteName, directoryPath)], rcloneProcessOptions({ timeoutMs: 60 * 1000 }));
  } catch (error) {
    throw friendlyRcloneRemoteError(error, remoteName);
  }
  clearCacheByPrefix(rcloneDirectoryCache, `rclone:${remoteName}:`);
  return listRcloneDirectory({ remoteName, path: directoryPath });
}

function friendlyRcloneRemoteError(error, remoteName) {
  if (isMissingRcloneRemoteError(error)) {
    return new Error(`The Rclone account "${remoteName}" is not connected on this computer. Reconnect the backend account, then try browsing again.`);
  }
  return error;
}

function friendlyRcloneAuthorizeError(error, backendLabel) {
  const output = sanitizeRcloneOutput(errorOutput(error));
  if (/context canceled|authorization canceled|access_denied|denied access|cancelled/i.test(output)) {
    return new Error(`${backendLabel} authorization was canceled before Rest Stop received permission. Try connecting again and finish the sign-in prompt in your browser.`);
  }
  return new Error(output || `${backendLabel} authorization did not complete. Try connecting again.`);
}

function sanitizeRcloneOutput(output) {
  return String(output ?? "")
    .replace(/https?:\/\/\S+/gi, "[authorization link hidden]")
    .replace(/\S*(code|state|session_crd|access_token|refresh_token|id_token|client_secret)=\S*/gi, "$1=[hidden]")
    .trim();
}

function isMissingRcloneRemoteError(error) {
  return /didn'?t find section in config file|not found in config|couldn'?t find remote|remote .* not found/i.test(errorOutput(error));
}

function rcloneRemoteTarget(remoteName, directoryPath) {
  return `${remoteName}:${directoryPath}`;
}

function joinRclonePath(parentPath, childName) {
  return [parentPath, childName].filter(Boolean).join("/");
}

function rcloneParentPath(directoryPath) {
  if (!directoryPath) return null;
  const parts = directoryPath.split("/").filter(Boolean);
  parts.pop();
  return parts.length ? parts.join("/") : "";
}

function extractJsonObject(output) {
  for (let start = output.indexOf("{"); start !== -1; start = output.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < output.length; index += 1) {
      const character = output[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === "\"") {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (character === "{") depth += 1;
      if (character === "}") depth -= 1;
      if (depth === 0) {
        const candidate = output.slice(start, index + 1);
        try {
          return JSON.stringify(JSON.parse(candidate));
        } catch {
          break;
        }
      }
    }
  }

  throw new Error("Rclone authorization completed, but no OAuth token was returned.");
}

function runProcess(binary, args, options = {}) {
  const { timeoutMs, onChild, input, ...spawnOptions } = options;
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(binary, args, { windowsHide: true, ...spawnOptions });
    if (typeof onChild === "function") onChild(child);
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = timeoutMs ? setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`${binary} timed out.`));
    }, timeoutMs) : null;

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    if (input !== undefined) {
      child.stdin.on("error", () => {});
      child.stdin.end(input);
    }
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const error = new Error((stderr || stdout || `${binary} exited with ${code}`).trim());
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

function envWithToolDirectory(env, executablePath) {
  const directory = path.dirname(String(executablePath ?? ""));
  if (!directory || directory === ".") return env;

  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const existingPath = env[pathKey] ?? "";
  return {
    ...env,
    [pathKey]: existingPath ? `${directory}${path.delimiter}${existingPath}` : directory
  };
}

function resticInstallPath() {
  return path.join(app.getPath("userData"), "bin", process.platform === "win32" ? "restic.exe" : "restic");
}

function rcloneInstallPath() {
  return path.join(app.getPath("userData"), "bin", process.platform === "win32" ? "rclone.exe" : "rclone");
}

function getResticVersion(binary) {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(binary, ["version"], { windowsHide: true });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(output.trim());
      else reject(new Error(output.trim() || `restic exited with ${code}`));
    });
  });
}

async function getRcloneVersion(binary) {
  const result = await runProcess(binary, ["version"], { timeoutMs: 15000 });
  return result.stdout.split(/\r?\n/)[0]?.trim() || result.stdout.trim();
}

async function installResticForWindows() {
  const release = await fetchJson("https://api.github.com/repos/restic/restic/releases/latest");
  const asset = release.assets.find((item) => /windows_amd64\.zip$/i.test(item.name));
  if (!asset) throw new Error("Could not find a Windows restic release asset.");

  const binDir = path.dirname(resticInstallPath());
  const downloadDir = path.join(app.getPath("temp"), "reststop-restic-install");
  const zipPath = path.join(downloadDir, asset.name);
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(downloadDir, { recursive: true });

  await downloadFile(asset.browser_download_url, zipPath);
  await expandZip(zipPath, downloadDir);

  const extracted = findResticExecutable(downloadDir);
  if (!extracted) throw new Error("Downloaded restic archive did not contain a restic executable.");
  fs.copyFileSync(extracted, resticInstallPath());
  return resticInstallPath();
}

async function installRcloneForWindows() {
  const release = await fetchJson("https://api.github.com/repos/rclone/rclone/releases/latest");
  const asset = release.assets.find((item) => /windows-amd64\.zip$/i.test(item.name));
  if (!asset) throw new Error("Could not find a Windows Rclone release asset.");

  const binDir = path.dirname(rcloneInstallPath());
  const downloadDir = path.join(app.getPath("temp"), "reststop-rclone-install");
  const zipPath = path.join(downloadDir, asset.name);
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(downloadDir, { recursive: true });

  await downloadFile(asset.browser_download_url, zipPath);
  await expandZip(zipPath, downloadDir);

  const extracted = findRcloneExecutable(downloadDir);
  if (!extracted) throw new Error("Downloaded Rclone archive did not contain a Rclone executable.");
  fs.copyFileSync(extracted, rcloneInstallPath());
  return rcloneInstallPath();
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { "User-Agent": "Reststop" } }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        fetchJson(response.headers.location).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Request failed with status ${response.statusCode}`));
        return;
      }
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
  });
}

function downloadFile(url, targetPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(targetPath);
    const request = https.get(url, { headers: { "User-Agent": "Reststop" } }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlink(targetPath, () => {
          downloadFile(response.headers.location, targetPath).then(resolve, reject);
        });
        return;
      }
      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on("finish", () => file.close(resolve));
    });
    request.on("error", (error) => {
      file.close();
      reject(error);
    });
  });
}

function expandZip(zipPath, targetDir) {
  return new Promise((resolve, reject) => {
    const command = `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${targetDir.replace(/'/g, "''")}' -Force`;
    const child = childProcess.spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], { windowsHide: true });
    let output = "";
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(output.trim() || `Failed to extract restic archive (${code}).`));
    });
  });
}

function findResticExecutable(startDir) {
  const entries = fs.readdirSync(startDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(startDir, entry.name);
    const lowerName = entry.name.toLowerCase();
    if (entry.isFile() && lowerName.startsWith("restic") && lowerName.endsWith(".exe")) return fullPath;
    if (entry.isDirectory()) {
      const found = findResticExecutable(fullPath);
      if (found) return found;
    }
  }
  return null;
}

function findRcloneExecutable(startDir) {
  const entries = fs.readdirSync(startDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(startDir, entry.name);
    const lowerName = entry.name.toLowerCase();
    if (entry.isFile() && lowerName.startsWith("rclone") && lowerName.endsWith(".exe")) return fullPath;
    if (entry.isDirectory()) {
      const found = findRcloneExecutable(fullPath);
      if (found) return found;
    }
  }
  return null;
}

function configPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function legacyProfilesPath() {
  return path.join(app.getPath("userData"), "profiles.json");
}

function legacySettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function defaultConfig() {
  return {
    version: 1,
    settings: {
      defaultExcludes: DEFAULT_EXCLUDES
    },
    profiles: []
  };
}

function normalizeConfig(config) {
  const settings = config && typeof config.settings === "object" && !Array.isArray(config.settings) ? config.settings : {};
  return {
    version: 1,
    [RCLONE_CONFIG_PASSWORD_KEY]: typeof config?.[RCLONE_CONFIG_PASSWORD_KEY] === "string" ? config[RCLONE_CONFIG_PASSWORD_KEY] : undefined,
    settings: normalizeSettings(settings),
    profiles: Array.isArray(config?.profiles) ? config.profiles.map(normalizeStoredProfile) : []
  };
}

function rcloneConfigPassword() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("System credential storage is unavailable, so Rclone credentials cannot be stored securely.");
  }

  const config = readConfig();
  const encryptedPassword = config[RCLONE_CONFIG_PASSWORD_KEY];
  if (encryptedPassword) {
    try {
      return safeStorage.decryptString(Buffer.from(encryptedPassword, "base64"));
    } catch {
      throw new Error("The stored Rclone credential key could not be read. Reconnect the Rclone account before using it.");
    }
  }

  const password = crypto.randomBytes(48).toString("base64url");
  writeConfig({
    ...config,
    [RCLONE_CONFIG_PASSWORD_KEY]: safeStorage.encryptString(password).toString("base64")
  });
  return password;
}

function envWithRcloneConfigPassword(env = process.env) {
  return {
    ...env,
    RCLONE_CONFIG_PASS: rcloneConfigPassword(),
    RCLONE_ASK_PASSWORD: "false"
  };
}

function rcloneProcessOptions(options = {}) {
  return {
    ...options,
    env: envWithRcloneConfigPassword(options.env ?? process.env)
  };
}

function normalizeSettings(settings) {
  const defaultExcludes = normalizeDefaultExcludePatterns(settings.defaultExcludes);
  return {
    ...settings,
    defaultExcludes,
    highPerformance: settings.highPerformance !== false
  };
}

function normalizeDefaultExcludePatterns(value) {
  if (value === undefined) return DEFAULT_EXCLUDES;
  const patterns = normalizeExcludePatterns(value)
    .map((pattern) => {
      if (pattern === "**/*.pyc") return "*.pyc";
      if (pattern === "**/*.pyo") return "*.pyo";
      if (pattern === "**/*.egg-info/") return "*.egg-info/";
      return pattern;
    });
  const looksLikeOldDefaults = OLD_DEFAULT_EXCLUDE_MARKERS.every((pattern) => patterns.includes(pattern));
  return looksLikeOldDefaults
    ? patterns.filter((pattern) => !OLD_DEFAULT_DATA_EXCLUDES.includes(pattern))
    : patterns;
}

function normalizeStoredProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return profile;
  return {
    ...profile,
    excludes: normalizeExcludePatterns(profile.excludes),
    pendingBackupStartedAt: typeof profile.pendingBackupStartedAt === "string" ? profile.pendingBackupStartedAt : undefined
  };
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function failureNotificationHistoryPath() {
  return path.join(app.getPath("userData"), FAILURE_NOTIFICATION_HISTORY_FILE);
}

function notificationLogPath() {
  return path.join(app.getPath("userData"), NOTIFICATION_LOG_FILE);
}

function todayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function readFailureNotificationHistory() {
  const history = readJsonFile(failureNotificationHistoryPath(), {});
  return history && typeof history === "object" && !Array.isArray(history) ? history : {};
}

function writeFailureNotificationHistory(history) {
  fs.mkdirSync(path.dirname(failureNotificationHistoryPath()), { recursive: true });
  fs.writeFileSync(failureNotificationHistoryPath(), JSON.stringify(history, null, 2));
}

function readNotificationLog() {
  const logItems = readJsonFile(notificationLogPath(), []);
  return Array.isArray(logItems)
    ? logItems
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: String(item.id ?? crypto.randomUUID()),
        key: String(item.key ?? ""),
        title: String(item.title ?? "Notification"),
        body: String(item.body ?? ""),
        createdAt: String(item.createdAt ?? new Date().toISOString())
      }))
    : [];
}

function writeNotificationLog(logItems) {
  fs.mkdirSync(path.dirname(notificationLogPath()), { recursive: true });
  fs.writeFileSync(notificationLogPath(), JSON.stringify(logItems, null, 2));
}

function appendNotificationLog(item) {
  const logItems = readNotificationLog();
  writeNotificationLog([
    {
      id: crypto.randomUUID(),
      key: String(item.key ?? ""),
      title: String(item.title ?? "Notification"),
      body: String(item.body ?? ""),
      createdAt: new Date().toISOString()
    },
    ...logItems
  ]);
}

function listNotificationLog() {
  return readNotificationLog().sort((first, second) => second.createdAt.localeCompare(first.createdAt));
}

function shouldShowFailureNotification(key) {
  const today = todayKey();
  const history = readFailureNotificationHistory();
  if (history[key] === today) return false;

  const pruned = Object.fromEntries(Object.entries(history).filter(([, date]) => date === today));
  pruned[key] = today;
  writeFailureNotificationHistory(pruned);
  return true;
}

function showFailureNotificationOnce(key, title, body) {
  try {
    if (typeof Notification.isSupported !== "function" || !Notification.isSupported() || !shouldShowFailureNotification(key)) return;
    const notificationBody = String(body ?? "").slice(0, 180);
    new Notification({
      title,
      body: notificationBody
    }).show();
    appendNotificationLog({ key, title, body: notificationBody });
  } catch (error) {
    log.warn("Failure notification could not be shown", error);
  }
}

function notifyBackupFailure(profile, error) {
  const profileId = String(profile?.id ?? "");
  if (!profileId) return;
  const name = String(profile?.name ?? "").trim() || "Backup";
  showFailureNotificationOnce(
    `backup:${profileId}`,
    `Backup failed: ${name}`,
    formatBackupFailureMessage(profile, error) || "The backup could not finish."
  );
}

function formatBackupFailureMessage(profile, error) {
  const output = errorOutput(error).trim();
  if (profile?.repository?.type === "rclone") return friendlyRcloneBackupError(profile, output);
  return output || "The backup failed, but restic did not return details.";
}

function friendlyRcloneBackupError(profile, output) {
  const backendLabel = rcloneBackendLabel(profile?.repository?.rcloneBackend);
  if (isRcloneAuthorizationFailure(output)) {
    return `${backendLabel} authorization did not complete. Reconnect ${backendLabel} in this backup, then run the backup again.`;
  }
  if (isMissingRcloneRemoteError(output)) {
    return `The ${backendLabel} account is not connected on this computer. Reconnect ${backendLabel} in this backup, then run the backup again.`;
  }
  return sanitizeRcloneOutput(output) || "The backup failed, but rclone did not return details.";
}

async function retryOnTransientAuth(fn, profile) {
  try {
    return await fn();
  } catch (error) {
    if (profile?.repository?.type !== "rclone" || !isTransientAuthError(error)) throw error;
    log.warn("Transient auth error detected, retrying once after delay", errorOutput(error).slice(0, 200));
    await new Promise((resolve) => setTimeout(resolve, AUTH_RETRY_DELAY_MS));
    return fn();
  }
}

function rcloneBackendLabel(backend) {
  return rcloneBackends[String(backend ?? "")]?.label ?? "Rclone";
}

function isRcloneAuthorizationFailure(output) {
  const text = String(output ?? "");
  if (/access_denied|denied access|invalid_grant|invalid_client|unauthorized_client|refresh token|failed to configure token/i.test(text)) return true;
  const hasAuthContext = /authorization|authorize|oauth|accounts\.google\.com|localhost:\d+\/auth|session_crd=/i.test(text);
  return hasAuthContext && /context canceled|cancelled|canceled|failed to authorize/i.test(text);
}

function notifyRestoreFailure(options, error) {
  let repository;
  try {
    repository = normalizeRestoreRepository(options?.repository);
  } catch {
    repository = {
      type: String(options?.repository?.type ?? ""),
      target: String(options?.repository?.target ?? "")
    };
  }
  const snapshotId = String(options?.snapshotId ?? "").trim();
  const target = String(options?.target ?? "").trim();
  const paths = Array.isArray(options?.paths) ? options.paths.map(String).sort() : [];
  const fingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify({ repository, snapshotId, target, paths }))
    .digest("hex")
    .slice(0, 16);
  showFailureNotificationOnce(
    `restore:${fingerprint}`,
    "Restore failed",
    `Restore to ${target || "the selected location"} could not finish. ${errorOutput(error).trim() || ""}`.trim()
  );
}

function readConfig() {
  if (fs.existsSync(configPath())) return normalizeConfig(readJsonFile(configPath(), defaultConfig()));

  const migrated = normalizeConfig({
    settings: readJsonFile(legacySettingsPath(), {}),
    profiles: readJsonFile(legacyProfilesPath(), [])
  });
  if (Object.keys(migrated.settings).length > 0 || migrated.profiles.length > 0) writeConfig(migrated);
  return migrated;
}

function writeConfig(config) {
  const normalized = normalizeConfig(config);
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(normalized, null, 2));
  return normalized;
}

function readSettings() {
  return readConfig().settings;
}

function writeSettings(settings) {
  const config = readConfig();
  writeConfig({
    ...config,
    settings
  });
}

function saveBackupDefaults(settings) {
  const nextSettings = {
    ...readSettings(),
    defaultExcludes: normalizeExcludePatterns(settings?.defaultExcludes)
  };
  writeSettings(nextSettings);
  return readSettings();
}

function getHighPerformanceEnabled() {
  return readSettings().highPerformance !== false;
}

function setHighPerformanceEnabled(enabled) {
  const highPerformance = Boolean(enabled);
  writeSettings({
    ...readSettings(),
    highPerformance
  });
  return highPerformance;
}

function getAutoUpdatesEnabled() {
  return readSettings().autoUpdatesEnabled !== false;
}

function setAutoUpdatesEnabled(enabled) {
  const autoUpdatesEnabled = Boolean(enabled);
  writeSettings({
    ...readSettings(),
    autoUpdatesEnabled
  });
  if (autoUpdatesEnabled) configureAutoUpdater();
  else stopAutoUpdateChecks();
  return autoUpdatesEnabled;
}

async function exportConfig() {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save Rest Stop config",
    defaultPath: "config.json",
    filters: [{ name: "JSON", extensions: ["json"] }]
  });
  if (result.canceled || !result.filePath) return { cancelled: true };

  fs.writeFileSync(result.filePath, JSON.stringify(readConfig(), null, 2));
  return { cancelled: false, path: result.filePath };
}

async function exportBackupConfig(profileId) {
  const profile = listProfiles().find((item) => item.id === String(profileId));
  if (!profile) throw new Error("Choose a saved backup to download.");

  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save backup config",
    defaultPath: `${safeConfigFilename(profile.name || "backup")}.backup.json`,
    filters: [{ name: "JSON", extensions: ["json"] }]
  });
  if (result.canceled || !result.filePath) return { cancelled: true };

  fs.writeFileSync(result.filePath, JSON.stringify({
    version: 1,
    type: "reststop-backup",
    profiles: [stripProfileSecrets(profile)]
  }, null, 2));
  return { cancelled: false, path: result.filePath };
}

async function restoreConfig() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Restore Rest Stop config",
    properties: ["openFile"],
    filters: [{ name: "JSON", extensions: ["json"] }]
  });
  if (result.canceled || !result.filePaths[0]) return { cancelled: true };

  const restored = normalizeConfig(JSON.parse(fs.readFileSync(result.filePaths[0], "utf8")));
  const profilesPendingReview = restored.profiles.map((profile) => ({
    ...profile,
    schedulePaused: true,
    reviewRequired: true
  }));
  writeConfig({
    ...restored,
    profiles: profilesPendingReview
  });
  if (restored.settings.autoUpdatesEnabled === false) stopAutoUpdateChecks();
  else configureAutoUpdater();

  return {
    cancelled: false,
    path: result.filePaths[0],
    settings: restored.settings,
    profiles: profilesPendingReview.map(sanitizeProfileForRenderer)
  };
}

async function loadBackupConfig() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Load existing backup",
    properties: ["openFile"],
    filters: [
      { name: "Backup JSON", extensions: ["json"] },
      { name: "All files", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePaths[0]) return { cancelled: true };

  const filePath = result.filePaths[0];
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const profile = backupProfileFromConfig(raw, filePath);
  const config = readConfig();
  const loadedProfile = prepareLoadedProfile(profile, config.profiles);
  const profiles = [...config.profiles, loadedProfile];
  writeConfig({
    ...config,
    profiles
  });

  return {
    cancelled: false,
    path: filePath,
    profile: sanitizeProfileForRenderer(loadedProfile),
    profiles: profiles.map(sanitizeProfileForRenderer)
  };
}

function backupProfileFromConfig(config, filePath) {
  const profiles = Array.isArray(config?.profiles) ? config.profiles : null;
  const profile = profiles?.length === 1 ? profiles[0] : looksLikeProfile(config) ? config : null;
  const normalized = profile ? normalizeStoredProfile(profile) : looksLikeResticRepositoryConfig(config) ? backupProfileFromResticConfig(config, filePath) : null;
  if (!looksLikeProfile(normalized)) throw new Error("Choose a Rest Stop backup JSON or a local restic repository config file.");
  return normalized;
}

function looksLikeProfile(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && value.repository && Array.isArray(value.sources));
}

function looksLikeResticRepositoryConfig(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof value.id === "string" && typeof value.version === "number");
}

function backupProfileFromResticConfig(_config, filePath) {
  const repositoryPath = path.dirname(filePath);
  const repositoryName = path.basename(repositoryPath) || "Existing backup";
  return {
    id: crypto.randomUUID(),
    name: repositoryName,
    description: "Loaded from an existing restic repository config.",
    encryptionEnabled: true,
    passwordSet: false,
    repository: {
      type: "local",
      target: repositoryPath
    },
    sources: [],
    excludes: DEFAULT_EXCLUDES,
    schedule: { mode: "manual", every: 1, unit: "hours" },
    schedulePaused: true,
    retention: {
      mode: "years",
      years: 1,
      snapshots: 30,
      latest: 30,
      hourly: 0,
      daily: 7,
      weekly: 4,
      monthly: 12,
      yearly: 3
    },
    createdAt: new Date().toISOString()
  };
}

function prepareLoadedProfile(profile, existingProfiles) {
  const now = new Date().toISOString();
  const existingIds = new Set(existingProfiles.map((item) => item.id).filter(Boolean));
  const existingNames = new Set(existingProfiles.map((item) => backupNameKey(item.name)).filter(Boolean));
  const name = uniqueBackupName(String(profile.name ?? "").trim() || "Loaded backup", existingNames);
  const profileId = String(profile.id ?? "");
  const id = profileId && !existingIds.has(profileId) ? profileId : crypto.randomUUID();

  return {
    ...profile,
    id,
    name,
    encryptedPassword: undefined,
    password: undefined,
    passwordConfirm: undefined,
    currentPassword: undefined,
    passwordSet: false,
    schedulePaused: true,
    reviewRequired: true,
    pendingBackupStartedAt: undefined,
    createdAt: profile.createdAt ?? now
  };
}

function uniqueBackupName(name, existingNames) {
  const baseName = name || "Loaded backup";
  if (!existingNames.has(backupNameKey(baseName))) return baseName;

  let index = 2;
  while (existingNames.has(backupNameKey(`${baseName} ${index}`))) index += 1;
  return `${baseName} ${index}`;
}

function stripProfileSecrets(profile) {
  const { encryptedPassword, password, passwordConfirm, currentPassword, ...rest } = profile;
  return {
    ...rest,
    passwordSet: false
  };
}

function safeConfigFilename(name) {
  const filename = String(name ?? "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return filename || "backup";
}

function sanitizeProfileForRenderer(profile) {
  const { encryptedPassword, password, passwordConfirm, currentPassword, ...rest } = profile;
  return {
    ...rest,
    excludes: normalizeExcludeText(rest.excludes)
  };
}

function getStoredPassword(profileId) {
  if (!safeStorage.isEncryptionAvailable()) return null;
  const profiles = listProfiles();
  const profile = profiles.find((p) => p.id === String(profileId));
  if (!profile?.encryptedPassword) return null;
  try {
    return safeStorage.decryptString(Buffer.from(profile.encryptedPassword, "base64"));
  } catch {
    return null;
  }
}

function savePasswordToStore(profileId, password) {
  if (!safeStorage.isEncryptionAvailable() || !password) return;
  const profiles = listProfiles();
  const index = profiles.findIndex((p) => p.id === String(profileId));
  if (index < 0) return;
  try {
    profiles[index] = {
      ...profiles[index],
      encryptedPassword: safeStorage.encryptString(String(password)).toString("base64")
    };
    writeProfiles(profiles);
  } catch { /* non-fatal */ }
}

function listProfiles() {
  return readConfig().profiles;
}

function writeProfiles(profiles) {
  const config = readConfig();
  writeConfig({
    ...config,
    profiles
  });
}

function backupNameKey(name) {
  return String(name ?? "").trim().toLowerCase();
}

function saveProfile(profile) {
  const profiles = listProfiles();
  const existingIndex = profiles.findIndex((item) => item.id && item.id === profile.id);
  const existing = existingIndex >= 0 ? profiles[existingIndex] : null;
  const nextPassword = String(profile.password ?? "");
  const passwordConfirm = String(profile.passwordConfirm ?? "");
  const currentPassword = String(profile.currentPassword ?? "");
  const restoringProfile = Boolean(existing?.reviewRequired);

  const nextNameKey = backupNameKey(profile.name);
  if (nextNameKey && profiles.some((item) => item.id !== existing?.id && backupNameKey(item.name) === nextNameKey)) {
    throw new Error("A backup with this name already exists. Choose a unique backup name.");
  }

  if (!existing && !nextPassword) throw new Error("Enter and confirm the backup password.");
  if (nextPassword && nextPassword !== passwordConfirm) throw new Error("Backup passwords do not match.");
  if (existing && restoringProfile) {
    if (nextPassword) throw new Error("Enter the existing backup password to finish restoring this backup.");
    if (!currentPassword) throw new Error("Enter the backup password to finish restoring this backup.");
    if (currentPassword !== passwordConfirm) throw new Error("Backup passwords do not match.");
  } else if (existing && nextPassword) {
    verifyCurrentProfilePassword(existing, currentPassword);
  }

  let encryptedPassword = existing?.encryptedPassword;
  const passwordToStore = nextPassword || (restoringProfile ? currentPassword : "");
  if (passwordToStore && safeStorage.isEncryptionAvailable()) {
    try {
      encryptedPassword = safeStorage.encryptString(passwordToStore).toString("base64");
    } catch { /* non-fatal */ }
  }

  const saved = {
    ...profile,
    encryptionEnabled: true,
    id: existing?.id ?? crypto.randomUUID(),
    passwordSet: Boolean(passwordToStore) || Boolean(existing?.passwordSet),
    password: undefined,
    passwordConfirm: undefined,
    currentPassword: undefined,
    encryptedPassword,
    excludes: normalizeExcludePatterns(profile.excludes),
    schedulePaused: Boolean(profile.schedulePaused ?? existing?.schedulePaused),
    reviewRequired: false,
    lastBackupStartedAt: existing?.lastBackupStartedAt,
    lastBackupCompletedAt: existing?.lastBackupCompletedAt,
    pendingBackupStartedAt: existing?.pendingBackupStartedAt,
    createdAt: existing?.createdAt ?? new Date().toISOString()
  };
  if (existingIndex >= 0) profiles[existingIndex] = saved;
  else profiles.push(saved);
  writeProfiles(profiles);
  return profiles.map(sanitizeProfileForRenderer);
}

function normalizeExcludePatterns(value) {
  const rawPatterns = Array.isArray(value)
    ? value
    : String(value ?? "").split(/\r?\n/);
  return rawPatterns
    .map((pattern) => String(pattern).trim())
    .filter((pattern) => pattern && pattern !== "*.");
}

function normalizeExcludeText(value) {
  return normalizeExcludePatterns(value).join("\n");
}

function verifyCurrentProfilePassword(existing, currentPassword) {
  if (!currentPassword) throw new Error("Enter the current backup password before changing it.");
  if (!existing?.passwordSet) return;
  if (!safeStorage.isEncryptionAvailable() || !existing.encryptedPassword) {
    throw new Error("The current backup password cannot be verified on this computer.");
  }
  const storedPassword = getStoredPassword(existing.id);
  if (storedPassword !== currentPassword) throw new Error("The current backup password is incorrect.");
}

async function deleteProfile(options) {
  const profileId = typeof options === "string" ? options : String(options?.profileId ?? "");
  const deleteRepository = typeof options === "object" && Boolean(options?.deleteRepository);
  if (!profileId) throw new Error("Choose a backup to delete.");
  if (activeBackupRuns.get(profileId)?.running) throw new Error("This backup is running. Wait for it to finish before deleting it.");

  const profiles = listProfiles();
  const index = profiles.findIndex((profile) => profile.id === profileId);
  if (index < 0) return profiles.map(sanitizeProfileForRenderer);

  const profile = profiles[index];
  if (deleteRepository) await deleteRepositoryForProfile(profile);

  profiles.splice(index, 1);
  clearBackupRetry(profileId);
  activeBackupRuns.delete(profileId);
  writeProfiles(profiles);
  return profiles.map(sanitizeProfileForRenderer);
}

function setProfileSchedulePaused(options) {
  const profileId = typeof options === "string" ? options : String(options?.profileId ?? "");
  const schedulePaused = typeof options === "object" && Boolean(options?.schedulePaused);
  if (!profileId) throw new Error("Choose a backup to pause.");

  const profiles = listProfiles();
  const index = profiles.findIndex((profile) => profile.id === profileId);
  if (index < 0) return profiles.map(sanitizeProfileForRenderer);
  if (!schedulePaused && profiles[index].reviewRequired) throw new Error("Review and save this backup before resuming it.");

  profiles[index] = {
    ...profiles[index],
    schedulePaused
  };
  writeProfiles(profiles);
  return profiles.map(sanitizeProfileForRenderer);
}

async function deleteRepositoryForProfile(profile) {
  const target = String(profile?.repository?.target ?? "").trim();
  if (!target) throw new Error("This backup does not have a repository location to delete.");

  if (profile.repository.type === "rclone") {
    const rclone = await findRclone();
    if (!rclone?.path) throw new Error("Rclone is not installed, so this remote repository cannot be deleted.");
    const rcloneTarget = rcloneTargetFromResticTarget(target);
    if (!rcloneTarget) throw new Error("This Rclone repository location could not be parsed.");
    try {
      await runProcess(rclone.path, ["purge", rcloneTarget], rcloneProcessOptions({ timeoutMs: 5 * 60 * 1000 }));
    } catch (error) {
      if (!/not found|directory not found|object not found/i.test(errorOutput(error))) throw error;
    }
    return;
  }

  if (profile.repository.type === "local") {
    deleteLocalRepository(target);
    return;
  }

  throw new Error("Repository deletion is only supported for local folders and Rclone backup locations.");
}

function rcloneTargetFromResticTarget(target) {
  const match = String(target ?? "").match(/^rclone:([^:]+):(.+)$/);
  return match ? `${match[1]}:${match[2]}` : null;
}

function resticRepositoryArgs(repositoryOrTarget) {
  const target = typeof repositoryOrTarget === "string" ? repositoryOrTarget : repositoryOrTarget?.target;
  const repositoryTarget = String(target ?? "").trim();
  const args = [];
  if (repositoryTarget.startsWith("rclone:")) {
    args.push("-o", `rclone.args=${rcloneResticArgs(repositoryOrTarget)}`);
    args.push("-o", "rclone.timeout=30m");
  }
  return [...args, "-r", repositoryTarget];
}

function rcloneResticArgs(repositoryOrTarget) {
  const backend = typeof repositoryOrTarget === "object" ? repositoryOrTarget?.rcloneBackend : null;
  const highPerf = getHighPerformanceEnabled();
  const backendExtras = highPerf ? RCLONE_BACKEND_EXTRAS_HIGH_PERF : RCLONE_BACKEND_EXTRAS_STANDARD;
  const extras = (backend && backendExtras[backend]) || [];
  const combined = [...BASE_RCLONE_RESTIC_ARGS, ...extras];
  const seen = new Map();
  for (let i = 0; i < combined.length; i++) {
    const flag = combined[i].match(/^--[^\s=]+/)?.[0];
    if (flag) seen.set(flag, i);
  }
  return combined.filter((entry, i) => {
    const flag = entry.match(/^--[^\s=]+/)?.[0];
    return !flag || seen.get(flag) === i;
  }).join(" ");
}

function deleteLocalRepository(target) {
  const resolved = path.resolve(String(target ?? ""));
  const root = path.parse(resolved).root;
  if (!path.isAbsolute(resolved) || resolved === root || resolved === path.resolve(os.homedir())) {
    throw new Error("This local repository path is too broad to delete automatically.");
  }
  if (!fs.existsSync(resolved)) return;
  if (!fs.lstatSync(resolved).isDirectory()) throw new Error("This local repository location is not a folder.");
  fs.rmSync(resolved, { recursive: true, force: true });
}

async function listRestoreSnapshots(options) {
  const repository = normalizeRestoreRepository(options?.repository);
  const password = String(options?.password ?? "");
  if (!password) throw new Error("Enter the backup password.");
  const cacheKey = restoreCacheKey(repository, "snapshots", password);
  const cached = getCachedValue(restoreSnapshotCache, cacheKey);
  if (cached) return cached;

  const restic = await findRestic();
  if (!restic?.path) throw new Error("Restic is not installed.");

  const env = await resticEnvironmentForRepository(repository, password);
  const result = await runProcess(restic.path, [...resticRepositoryArgs(repository), "snapshots", "--json"], {
    env,
    timeoutMs: RESTIC_REPOSITORY_TIMEOUT_MS
  });
  const snapshots = JSON.parse(result.stdout || "[]");
  const normalizedSnapshots = snapshots
    .map((snapshot) => ({
      id: String(snapshot.id ?? ""),
      shortId: String(snapshot.short_id ?? snapshot.id ?? "").slice(0, 8),
      time: String(snapshot.time ?? ""),
      hostname: String(snapshot.hostname ?? ""),
      paths: Array.isArray(snapshot.paths) ? snapshot.paths.map(String) : []
    }))
    .filter((snapshot) => snapshot.id)
    .sort((first, second) => second.time.localeCompare(first.time));
  setCachedValue(restoreSnapshotCache, cacheKey, normalizedSnapshots);
  return normalizedSnapshots;
}

async function listRestoreFiles(options) {
  const repository = normalizeRestoreRepository(options?.repository);
  const password = String(options?.password ?? "");
  const snapshotId = String(options?.snapshotId ?? "").trim();
  const browsePath = normalizeResticBrowsePath(options?.path);
  if (!password) throw new Error("Enter the backup password.");
  if (!snapshotId) throw new Error("Choose a backup date.");

  const nodes = await restoreSnapshotNodes(repository, password, snapshotId);
  return {
    path: browsePath,
    parent: parentResticPath(browsePath),
    entries: resticChildEntries(nodes, browsePath)
  };
}

async function restoreSnapshotNodes(repository, password, snapshotId) {
  const cacheKey = restoreCacheKey(repository, `files:${snapshotId}`, password);
  const cached = getCachedValue(restoreFileTreeCache, cacheKey);
  if (cached) return cached;

  const restic = await findRestic();
  if (!restic?.path) throw new Error("Restic is not installed.");

  const env = await resticEnvironmentForRepository(repository, password);
  const args = [...resticRepositoryArgs(repository), "ls", snapshotId, "--json"];
  const result = await runProcess(restic.path, args, {
    env,
    timeoutMs: RESTIC_REPOSITORY_TIMEOUT_MS
  });
  const nodes = parseResticJsonLines(result.stdout)
    .filter((item) => !item.struct_type || item.struct_type === "node")
    .map((item) => ({
      ...item,
      path: normalizeResticBrowsePath(item.path)
    }))
    .filter((item) => item.path);
  setCachedValue(restoreFileTreeCache, cacheKey, nodes);
  return nodes;
}

async function startRestore(options) {
  activeRestoreRunCount += 1;
  try {
    return await runRestore(options);
  } catch (error) {
    notifyRestoreFailure(options, error);
    throw error;
  } finally {
    activeRestoreRunCount = Math.max(0, activeRestoreRunCount - 1);
    installPendingUpdateWhenIdle();
  }
}

async function runRestore(options) {
  const repository = normalizeRestoreRepository(options?.repository);
  const password = String(options?.password ?? "");
  const snapshotId = String(options?.snapshotId ?? "").trim();
  const restoreTarget = String(options?.target ?? "").trim();
  const selectedPaths = Array.isArray(options?.paths) ? options.paths.map((item) => String(item).trim()).filter(Boolean) : [];
  const overwrite = Boolean(options?.overwrite);
  if (!password) throw new Error("Enter the backup password.");
  if (!snapshotId) throw new Error("Choose a backup date.");
  if (selectedPaths.length === 0) throw new Error("Choose files or folders to restore.");
  if (!restoreTarget) throw new Error("Choose a restore location.");

  fs.mkdirSync(restoreTarget, { recursive: true });
  const restic = await findRestic();
  if (!restic?.path) throw new Error("Restic is not installed.");

  const env = await resticEnvironmentForRepository(repository, password);
  const overwriteMode = overwrite ? "always" : "never";
  const restoreSelections = restoreSelectors(snapshotId, selectedPaths);
  for (const restoreSelection of restoreSelections) {
    const args = [
      ...resticRepositoryArgs(repository),
      "restore",
      restoreSelection.snapshot,
      "--target",
      restoreTarget,
      "--overwrite",
      overwriteMode,
      ...restoreSelection.includes.flatMap((pathName) => ["--include", pathName])
    ];
    await runProcess(restic.path, args, { env, timeoutMs: 60 * 60 * 1000 });
  }
  return {
    message: overwrite
      ? `Restore completed to ${restoreTarget}. Existing files were replaced where needed.`
      : `Restore completed to ${restoreTarget}. Files that already existed were skipped.`
  };
}

function normalizeRestoreRepository(repository) {
  const type = String(repository?.type ?? "");
  const target = String(repository?.target ?? "").trim();
  if (!["local", "sftp", "rest", "rclone"].includes(type)) throw new Error("Choose a supported backup location.");
  if (!target) throw new Error("Choose a backup location.");
  return {
    type,
    target,
    rcloneBackend: repository?.rcloneBackend,
    rcloneRemoteName: repository?.rcloneRemoteName,
    rclonePath: repository?.rclonePath
  };
}

async function resticEnvironmentForRepository(repository, password) {
  let env = { ...process.env, RESTIC_PASSWORD: password };
  if (repository.type === "rclone") {
    const rclone = await findRclone();
    if (!rclone?.path) throw new Error("Rclone is not installed.");
    env = envWithRcloneConfigPassword(envWithToolDirectory(env, rclone.path));
  }
  return env;
}

function normalizeResticBrowsePath(value) {
  const normalized = String(value ?? "").trim().replace(/\\/g, "/").replace(/\/+$/g, "");
  return normalized === "/" ? "" : normalized;
}

function restoreSelectors(snapshotId, selectedPaths) {
  const normalizedPaths = uniqueRestorePaths(selectedPaths);
  const groups = new Map();
  for (const pathName of normalizedPaths) {
    const root = parentResticPath(pathName) ?? "";
    const includes = groups.get(root) ?? [];
    includes.push(relativeRestoreInclude(root, pathName));
    groups.set(root, includes);
  }
  return [...groups.entries()].map(([root, includes]) => ({
    snapshot: root ? `${snapshotId}:${root}` : snapshotId,
    includes
  }));
}

function uniqueRestorePaths(paths) {
  const normalized = [...new Set(paths.map(normalizeResticBrowsePath).filter(Boolean))]
    .sort((first, second) => first.localeCompare(second));
  return normalized.filter((pathName, index) => {
    const previous = normalized[index - 1];
    return !previous || !isResticPathInside(pathName, previous);
  });
}

function relativeRestoreInclude(root, pathName) {
  if (!root) return pathName.startsWith("/") ? pathName : `/${pathName}`;
  const relative = pathName === root ? "" : pathName.slice(root.length).replace(/^\/+/, "");
  return relative ? `/${relative}` : "/";
}

function isResticPathInside(pathName, parentPath) {
  const normalizedParent = parentPath.replace(/\/+$/g, "");
  return pathName === normalizedParent || pathName.startsWith(`${normalizedParent}/`);
}

function parentResticPath(browsePath) {
  if (!browsePath) return null;
  const trimmed = browsePath.replace(/\/+$/g, "");
  const index = trimmed.lastIndexOf("/");
  if (index <= 0) return "";
  return trimmed.slice(0, index);
}

function resticChildEntries(nodes, browsePath) {
  const children = new Map();
  for (const item of nodes) {
    if (item.struct_type && item.struct_type !== "node") continue;
    const nodePath = item.path;
    if (!nodePath || nodePath === browsePath) continue;
    const child = resticImmediateChild(nodePath, browsePath, item.type);
    if (!child) continue;
    const existing = children.get(child.path);
    children.set(child.path, {
      ...child,
      type: existing?.type === "directory" || child.type === "directory" ? "directory" : "file"
    });
  }
  return [...children.values()].sort((first, second) => {
    if (first.type !== second.type) return first.type === "directory" ? -1 : 1;
    return first.name.localeCompare(second.name);
  });
}

function resticImmediateChild(nodePath, browsePath, nodeType) {
  const prefix = browsePath ? `${browsePath}/` : "";
  if (prefix && !nodePath.startsWith(prefix)) return null;
  const relative = prefix ? nodePath.slice(prefix.length) : nodePath.replace(/^\/+/, "");
  if (!relative) return null;
  const [name, ...remaining] = relative.split("/").filter(Boolean);
  if (!name) return null;
  const pathPrefix = prefix
    ? prefix.replace(/\/+$/g, "")
    : nodePath.startsWith("/") ? "" : "";
  const childPath = prefix
    ? `${pathPrefix}/${name}`
    : nodePath.startsWith("/") ? `/${name}` : name;
  return {
    name,
    path: childPath,
    type: remaining.length > 0 || nodeType === "dir" ? "directory" : "file"
  };
}

function parseResticJsonLines(output) {
  return String(output ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function restoreCacheKey(repository, label, password) {
  return [
    "restore",
    repository.type,
    repository.target,
    label,
    crypto.createHash("sha256").update(String(password)).digest("hex")
  ].join(":");
}

function getCachedValue(cache, key) {
  const cached = cache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return cached.value;
}

function setCachedValue(cache, key, value) {
  cache.set(key, { createdAt: Date.now(), value });
  pruneCache(cache);
}

function clearCacheByPrefix(cache, prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

function pruneCache(cache) {
  const now = Date.now();
  for (const [key, cached] of cache.entries()) {
    if (now - cached.createdAt > CACHE_TTL_MS) cache.delete(key);
  }
  while (cache.size > 30) {
    const firstKey = cache.keys().next().value;
    if (!firstKey) break;
    cache.delete(firstKey);
  }
}

async function startBackup(profile, password) {
  const profileId = String(profile?.id ?? "");
  if (!profileId) throw new Error("Choose a saved backup before running it.");
  const existingRun = activeBackupRuns.get(profileId);
  if (existingRun?.running || existingRun?.waitingForNetwork) return getBackupStatus();
  if (profile.reviewRequired) throw new Error("Review and save this backup before running it.");
  if (!profile?.repository?.target) throw new Error("This backup does not have a repository location.");
  if (!Array.isArray(profile.sources) || profile.sources.length === 0) throw new Error("This backup does not have any sources selected.");
  let resolvedPassword = String(password ?? "");
  if (profile.passwordSet && !resolvedPassword) {
    resolvedPassword = getStoredPassword(profileId) ?? "";
  }
  if (profile.passwordSet && !resolvedPassword) throw new Error("Enter the backup password before running this backup.");

  markBackupPending(profileId);
  const networkLocation = await networkRepositoryLocation(profile.repository);
  if (networkLocation && !networkLocation.reachable) {
    scheduleNetworkBackupRetry(profile, resolvedPassword, networkLocation.message);
    return getBackupStatus();
  }

  const runState = {
    running: true,
    percentComplete: 0,
    bytesDone: null,
    totalBytes: null,
    estimatedSecondsRemaining: null,
    progressLabel: "Preparing backup...",
    startedAt: new Date().toISOString(),
    pid: null,
    child: null,
    stopRequested: false,
    stderr: ""
  };
  activeBackupRuns.set(profileId, runState);

  let restic;
  let env = { ...process.env, RESTIC_PASSWORD: resolvedPassword };
  let child;
  const trackResticChild = (nextChild) => {
    runState.child = nextChild;
    runState.pid = nextChild.pid ?? null;
    activeBackupRuns.set(profileId, runState);
    if (runState.stopRequested) terminateBackupRun(runState).catch(() => {});
  };
  try {
    restic = await findRestic();
    if (!restic?.path) throw new Error("Restic is not installed.");

    if (profile.repository.type === "rclone") {
      const rclone = await findRclone();
      if (rclone?.path) env = envWithRcloneConfigPassword(envWithToolDirectory(env, rclone.path));
    }

    await retryOnTransientAuth(() => ensureResticRepository(restic.path, profile.repository, env, trackResticChild), profile);
    if (runState.stopRequested) {
      activeBackupRuns.set(profileId, {
        ...runState,
        running: false,
        pid: null,
        child: null,
        percentComplete: null,
        progressLabel: "Backup stopped."
      });
      clearBackupPending(profileId);
      installPendingUpdateWhenIdle();
      return getBackupStatus();
    }

    runState.progressLabel = "Starting backup...";
    runState.pid = null;
    runState.child = null;
    const excludeArgs = normalizeExcludePatterns(profile.excludes).flatMap((pattern) => ["--exclude", pattern]);
    const resticBackupFlags = ["--retry-lock", "5m"];
    if (profile.repository.type === "rclone") resticBackupFlags.push("--pack-size", getHighPerformanceEnabled() ? "64" : "32");
    const args = ["--json", ...resticRepositoryArgs(profile.repository), "backup", ...resticBackupFlags, ...excludeArgs, ...profile.sources];
    child = childProcess.spawn(restic.path, args, { env, windowsHide: true });
    runState.pid = child.pid ?? null;
    runState.child = child;
    updateProfileBackupTimestamps(profileId, {
      lastBackupStartedAt: runState.startedAt,
      pendingBackupStartedAt: runState.startedAt
    });
  } catch (error) {
    if (shouldRetryBackupForNetwork(profile, error)) {
      scheduleNetworkBackupRetry(profile, resolvedPassword, error instanceof Error ? error.message : String(error));
      return getBackupStatus();
    }
    const failureMessage = formatBackupFailureMessage(profile, error);
    if (runState.stopRequested) clearBackupPending(profileId);
    activeBackupRuns.set(profileId, {
      ...runState,
      running: false,
      percentComplete: null,
      child: null,
      progressLabel: runState.stopRequested ? "Backup stopped." : failureMessage,
      errorDetails: runState.stopRequested ? null : backupErrorDetails(error, profile)
    });
    if (!runState.stopRequested) notifyBackupFailure(profile, error);
    installPendingUpdateWhenIdle();
    if (runState.stopRequested) return getBackupStatus();
    throw new Error(failureMessage);
  }

  let stdoutBuffer = "";
  runState.lastActivityAt = Date.now();
  const stallCheckInterval = setInterval(() => {
    if (!runState.running || runState.stopRequested) {
      clearInterval(stallCheckInterval);
      return;
    }
    if (Date.now() - runState.lastActivityAt > BACKUP_STALL_TIMEOUT_MS) {
      clearInterval(stallCheckInterval);
      runState.stalledKill = true;
      terminateBackupRun(runState).catch(() => {});
    }
  }, 60 * 1000);
  if (typeof stallCheckInterval.unref === "function") stallCheckInterval.unref();
  runState.stallTimer = stallCheckInterval;

  child.stdout.on("data", (chunk) => {
    runState.lastActivityAt = Date.now();
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) updateBackupProgressFromLine(profileId, line);
  });

  child.stderr.on("data", (chunk) => {
    runState.lastActivityAt = Date.now();
    const text = chunk.toString();
    runState.stderr = `${runState.stderr}${text}`.slice(-1000);
  });

  child.on("error", (error) => {
    if (runState.stallTimer) clearInterval(runState.stallTimer);
    if (shouldRetryBackupForNetwork(profile, error)) {
      scheduleNetworkBackupRetry(profile, resolvedPassword, error instanceof Error ? error.message : String(error), runState);
      return;
    }
    const failureMessage = formatBackupFailureMessage(profile, error);
    if (runState.stopRequested) clearBackupPending(profileId);
    activeBackupRuns.set(profileId, {
      ...runState,
      running: false,
      percentComplete: null,
      child: null,
      progressLabel: runState.stopRequested ? "Backup stopped." : failureMessage,
      errorDetails: runState.stopRequested ? null : backupErrorDetails(error, profile)
    });
    if (!runState.stopRequested) notifyBackupFailure(profile, error);
    installPendingUpdateWhenIdle();
  });

  child.on("close", (code) => {
    if (runState.stallTimer) clearInterval(runState.stallTimer);
    if (runState.failureHandled) return;
    if (stdoutBuffer.trim()) updateBackupProgressFromLine(profileId, stdoutBuffer);
    if (runState.stalledKill && !runState.stopRequested) {
      runState.stderr = `${runState.stderr}\nBackup timed out: no progress for 10 minutes.`.trim();
    }
    if (!runState.stopRequested && code === 0) {
      knownRepositories.add(profile.repository?.target);
      updateProfileBackupTimestamps(profileId, {
        lastBackupCompletedAt: new Date().toISOString(),
        pendingBackupStartedAt: undefined
      });
    } else if (runState.stopRequested) {
      clearBackupPending(profileId);
    }
    const rawFailureMessage = (runState.stderr.trim() || `Backup failed with exit code ${code}.`).trim();
    if (!runState.stopRequested && code !== 0 && shouldRetryBackupForNetwork(profile, rawFailureMessage)) {
      scheduleNetworkBackupRetry(profile, resolvedPassword, rawFailureMessage, runState);
      return;
    }
    const failureMessage = code === 0 ? "" : formatBackupFailureMessage(profile, rawFailureMessage);
    activeBackupRuns.set(profileId, {
      ...runState,
      running: false,
      child: null,
      percentComplete: runState.stopRequested ? null : code === 0 ? 100 : null,
      progressLabel: runState.stopRequested
        ? "Backup stopped."
        : code === 0
        ? "Backup completed."
        : failureMessage,
      errorDetails: runState.stopRequested || code === 0 ? null : backupErrorDetails(rawFailureMessage, profile)
    });
    if (!runState.stopRequested && code !== 0) notifyBackupFailure(profile, rawFailureMessage);
    installPendingUpdateWhenIdle();
  });

  return getBackupStatus();
}

function scheduleNetworkBackupRetry(profile, password, reason, currentState = {}) {
  const profileId = String(profile?.id ?? "");
  if (!profileId) return;
  clearBackupRetry(profileId);
  markBackupPending(profileId, currentState.startedAt);

  const retryDelayMs = nextBackupRetryDelayMs(currentState);
  const retryAt = new Date(Date.now() + retryDelayMs);
  const retryTimer = setTimeout(() => retryNetworkBackup(profileId), retryDelayMs);
  if (typeof retryTimer.unref === "function") retryTimer.unref();

  currentState.failureHandled = true;
  activeBackupRuns.set(profileId, {
    ...currentState,
    running: false,
    waitingForNetwork: true,
    percentComplete: null,
    child: null,
    pid: null,
    retryTimer,
    retryAt: retryAt.toISOString(),
    retryDelayMs,
    retryProfile: profile,
    retryPassword: password,
    retryReason: String(reason ?? ""),
    progressLabel: `Waiting for network location. Retrying at ${retryAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`,
    errorDetails: null
  });
  installPendingUpdateWhenIdle();
}

async function retryNetworkBackup(profileId) {
  const state = activeBackupRuns.get(profileId);
  if (!state?.waitingForNetwork) return;

  const profile = listProfiles().find((item) => item.id === profileId) ?? state.retryProfile;
  if (!profile) {
    activeBackupRuns.delete(profileId);
    return;
  }

  const networkLocation = await networkRepositoryLocation(profile.repository);
  if (networkLocation && !networkLocation.reachable) {
    scheduleNetworkBackupRetry(profile, state.retryPassword ?? "", networkLocation.message, state);
    return;
  }

  activeBackupRuns.delete(profileId);
  try {
    await startBackup(profile, state.retryPassword ?? "");
  } catch (error) {
    if (shouldRetryBackupForNetwork(profile, error)) {
      scheduleNetworkBackupRetry(profile, state.retryPassword ?? "", error instanceof Error ? error.message : String(error), state);
      return;
    }
    const failureMessage = formatBackupFailureMessage(profile, error);
    activeBackupRuns.set(profileId, {
      running: false,
      percentComplete: null,
      progressLabel: failureMessage,
      errorDetails: backupErrorDetails(error, profile),
      startedAt: new Date().toISOString(),
      pid: null,
      child: null,
      stopRequested: false,
      stderr: ""
    });
    notifyBackupFailure(profile, error);
    installPendingUpdateWhenIdle();
  }
}

function nextBackupRetryDelayMs(currentState = {}) {
  const previousDelayMs = Number(currentState.retryDelayMs ?? 0);
  if (!Number.isFinite(previousDelayMs) || previousDelayMs <= 0) return NETWORK_RETRY_MS;
  return Math.min(previousDelayMs * 2, MAX_NETWORK_RETRY_MS);
}

function clearBackupRetry(profileId) {
  const state = activeBackupRuns.get(String(profileId));
  if (state?.retryTimer) clearTimeout(state.retryTimer);
}

async function networkRepositoryLocation(repository) {
  if (repository?.type !== "local") return null;
  const analysis = await analyzeBackupLocation(repository.target);
  if (!analysis.isNetwork) return null;
  return {
    reachable: Boolean(analysis.reachable && analysis.writable),
    message: analysis.reachable
      ? analysis.writable
        ? "Network backup location detected."
        : "Network backup location is reachable but not writable."
      : "Network backup location is currently offline or unavailable."
  };
}

function shouldRetryBackupForNetwork(profile, error) {
  if (profile?.repository?.type === "local") {
    const target = String(profile.repository.target ?? "");
    if (isNetworkPath(target) && isNetworkError(error)) return true;
  }
  if (profile?.repository?.type === "rclone" || profile?.repository?.type === "sftp" || profile?.repository?.type === "rest") {
    return isNetworkError(error);
  }
  return false;
}

function isNetworkPath(target) {
  const normalized = String(target ?? "");
  if (/^\\\\[^\\]+\\[^\\]+/.test(normalized) || /^\/\/[^/]+\/[^/]+/.test(normalized)) return true;
  if (process.platform !== "win32") return false;
  const root = path.parse(normalized).root;
  const drive = root.slice(0, 2).toUpperCase();
  if (!/^[A-Z]:$/.test(drive)) return false;
  try {
    const result = childProcess.spawnSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      `(Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='${drive}'").DriveType`
    ], { encoding: "utf8", windowsHide: true, timeout: 10000 });
    return Number(result.stdout.trim()) === 4;
  } catch {
    return false;
  }
}

function isNetworkError(error) {
  return /network|offline|unavailable|timed?\s*out|timeout|connection|connect|reset|refused|unreachable|dns|getaddrinfo|resolve|lookup|no such host|unknown host|host not found|could not resolve|econn|etimedout|enotfound|eai_again|no route|i\/o timeout|context deadline|temporary failure|temporary error|transport|tls handshake|broken pipe|rate.?limit|too many requests|try again later|backend error|rclone:\s*5|HTTP 429|HTTP 500|HTTP 502|HTTP 503|HTTP 504|userRateLimitExceeded|dailyLimitExceeded|storageQuotaExceeded|uploadRateLimitExceeded|quota/i.test(errorOutput(error));
}

function isTransientAuthError(error) {
  const output = errorOutput(error);
  return /invalid_grant/i.test(output) && !/revoked|consent_required|account_not_found/i.test(output);
}

function markBackupPending(profileId, startedAt = new Date().toISOString()) {
  const profiles = listProfiles();
  const index = profiles.findIndex((profile) => profile.id === String(profileId));
  if (index < 0 || profiles[index].pendingBackupStartedAt) return;
  profiles[index] = {
    ...profiles[index],
    pendingBackupStartedAt: startedAt
  };
  writeProfiles(profiles);
}

function clearBackupPending(profileId) {
  updateProfileBackupTimestamps(profileId, { pendingBackupStartedAt: undefined });
}

function updateProfileBackupTimestamps(profileId, timestamps) {
  const profiles = listProfiles();
  const index = profiles.findIndex((profile) => profile.id === String(profileId));
  if (index < 0) return;
  profiles[index] = {
    ...profiles[index],
    ...timestamps
  };
  writeProfiles(profiles);
}

async function stopBackup(profileId) {
  const id = String(profileId ?? "");
  if (!id) throw new Error("Choose a backup to stop.");

  const runState = activeBackupRuns.get(id);
  if (runState?.waitingForNetwork) {
    clearBackupRetry(id);
    clearBackupPending(id);
    activeBackupRuns.set(id, {
      ...runState,
      running: false,
      waitingForNetwork: false,
      percentComplete: null,
      progressLabel: "Backup retry cancelled.",
      errorDetails: null,
      retryTimer: null
    });
    installPendingUpdateWhenIdle();
    return getBackupStatus();
  }
  if (runState?.running) {
    runState.stopRequested = true;
    runState.progressLabel = "Stopping backup...";
    clearBackupPending(id);
    activeBackupRuns.set(id, runState);
    await terminateBackupRun(runState);
    return getBackupStatus();
  }

  const profile = listProfiles().find((item) => item.id === id);
  const target = profile?.repository?.target;
  if (target) {
    const processInfo = (await listResticBackupProcesses())
      .find((item) => commandMatchesRepository(item.commandLine, target));
    if (processInfo?.pid) {
      await terminateProcessTree(processInfo.pid);
      clearBackupPending(id);
      activeBackupRuns.set(id, {
        running: false,
        percentComplete: null,
        progressLabel: "Backup stopped.",
        errorDetails: null,
        startedAt: new Date().toISOString(),
        pid: null,
        child: null,
        stopRequested: true,
        stderr: ""
      });
      installPendingUpdateWhenIdle();
    }
  }

  return getBackupStatus();
}

async function terminateBackupRun(runState) {
  if (runState.pid) {
    await terminateProcessTree(runState.pid);
    return;
  }
  if (runState.child && !runState.child.killed) runState.child.kill();
}

async function terminateProcessTree(pid) {
  const processId = Number(pid);
  if (!Number.isFinite(processId) || processId <= 0) return;

  if (process.platform === "win32") {
    try {
      await runProcess("taskkill.exe", ["/PID", String(processId), "/T", "/F"], { timeoutMs: 10000 });
    } catch {
      // The process may already have exited between status refresh and stop.
    }
    return;
  }

  try {
    process.kill(processId, "SIGTERM");
  } catch {
    // The process may already have exited between status refresh and stop.
  }
}

async function ensureResticRepository(resticPath, repositoryTarget, env, onChild) {
  const target = typeof repositoryTarget === "string" ? repositoryTarget : repositoryTarget?.target;
  if (target && knownRepositories.has(target)) return;

  if (await canOpenResticRepository(resticPath, repositoryTarget, env, onChild)) {
    if (target) knownRepositories.add(target);
    return;
  }

  try {
    await runProcess(resticPath, [...resticRepositoryArgs(repositoryTarget), "init"], {
      env,
      onChild,
      timeoutMs: RESTIC_REPOSITORY_TIMEOUT_MS
    });
    if (target) knownRepositories.add(target);
  } catch (error) {
    if (!isExistingResticRepositoryError(error)) throw error;
    if (target) knownRepositories.add(target);
  }
}

async function canOpenResticRepository(resticPath, repositoryTarget, env, onChild) {
  try {
    await runProcess(resticPath, [...resticRepositoryArgs(repositoryTarget), "snapshots", "--json"], {
      env,
      onChild,
      timeoutMs: RESTIC_REPOSITORY_TIMEOUT_MS
    });
    return true;
  } catch (error) {
    if (isMissingResticRepositoryError(error)) return false;
    if (isWrongResticPasswordError(error)) {
      throw new Error("This backup location already contains a restic repository, but the password did not unlock it.");
    }
    throw error;
  }
}

function isExistingResticRepositoryError(error) {
  return /already initialized|config file already exists/i.test(errorOutput(error));
}

function isMissingResticRepositoryError(error) {
  return /config file does not exist|is there a repository at|repository does not exist/i.test(errorOutput(error));
}

function isWrongResticPasswordError(error) {
  return /wrong password|no key found|unable to open config file/i.test(errorOutput(error));
}

function errorOutput(error) {
  return [
    error?.message,
    error?.stderr,
    error?.stdout,
    String(error ?? "")
  ].filter(Boolean).join("\n");
}

function updateBackupProgressFromLine(profileId, line) {
  const trimmed = String(line ?? "").trim();
  if (!trimmed) return;
  try {
    const message = JSON.parse(trimmed);
    if (message.message_type !== "status") return;

    const percentDone = typeof message.percent_done === "number" ? message.percent_done : null;
    const percent = percentDone !== null ? Math.round(percentDone * 100) : null;
    const filesDone = Number(message.files_done ?? 0);
    const totalFiles = Number(message.total_files ?? 0);
    const bytesDone = positiveNumberOrNull(message.bytes_done);
    const totalBytes = positiveNumberOrNull(message.total_bytes);
    const estimatedSecondsRemaining = estimateBackupSecondsRemaining(activeBackupRuns.get(profileId), message, percentDone, bytesDone, totalBytes);
    const progressLabel = totalFiles > 0
      ? `${filesDone} of ${totalFiles} files processed.`
      : "Backup is running.";

    activeBackupRuns.set(profileId, {
      ...(activeBackupRuns.get(profileId) ?? {}),
      running: true,
      percentComplete: percent,
      bytesDone,
      totalBytes,
      estimatedSecondsRemaining,
      progressLabel
    });
  } catch {
    // Restic can emit non-JSON warnings alongside JSON status.
  }
}

function positiveNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function estimateBackupSecondsRemaining(runState, message, percentDone, bytesDone, totalBytes) {
  const resticEstimate = positiveNumberOrNull(message.seconds_remaining);
  if (resticEstimate !== null) return resticEstimate;

  const elapsedFromStart = runState?.startedAt
    ? positiveNumberOrNull((Date.now() - Date.parse(runState.startedAt)) / 1000)
    : null;
  const elapsed = positiveNumberOrNull(message.seconds_elapsed)
    ?? elapsedFromStart;
  if (elapsed === null || elapsed < 5) return null;

  if (bytesDone !== null && totalBytes !== null && bytesDone < totalBytes) {
    const bytesPerSecond = bytesDone / elapsed;
    return bytesPerSecond > 0 ? (totalBytes - bytesDone) / bytesPerSecond : null;
  }

  if (percentDone !== null && percentDone > 0 && percentDone < 1) {
    return elapsed * ((1 - percentDone) / percentDone);
  }

  return null;
}

async function analyzeBackupLocation(targetPath) {
  const target = String(targetPath ?? "").trim();
  if (!target) {
    return {
      target,
      isNetwork: false,
      reachable: false,
      writable: false,
      message: "Choose a backup location."
    };
  }

  const isUnc = /^\\\\[^\\]+\\[^\\]+/.test(target) || /^\/\/[^/]+\/[^/]+/.test(target);
  const root = path.parse(target).root;
  const driveType = await getWindowsDriveType(root);
  const isNetwork = isUnc || driveType === 4;
  const reachable = fs.existsSync(target);
  let writable = false;

  if (reachable) {
    try {
      fs.accessSync(target, fs.constants.W_OK);
      writable = true;
    } catch {
      writable = false;
    }
  }

  return {
    target,
    root,
    driveType,
    isNetwork,
    reachable,
    writable,
    message: reachable
      ? isNetwork
        ? "Network backup location detected."
        : "Local backup location is reachable."
      : isNetwork
        ? "Network backup location is currently offline or unavailable."
        : "Backup location is currently unavailable."
  };
}

async function getBackupStatus() {
  const processes = await listResticBackupProcesses();
  const profiles = listProfiles();
  const observedProfileIds = profiles
    .filter((profile) => processes.some((processInfo) => commandMatchesRepository(processInfo.commandLine, profile?.repository?.target)))
    .map((profile) => profile.id);
  const activeEntries = [...activeBackupRuns.entries()];
  const runningEntries = activeEntries.filter(([, state]) => state.running);
  const waitingEntries = activeEntries.filter(([, state]) => state.waitingForNetwork);
  const latestEntry = runningEntries[0] ?? waitingEntries[0] ?? activeEntries[activeEntries.length - 1] ?? null;
  const latestProfileId = latestEntry?.[0] ?? null;
  const latestState = latestEntry?.[1] ?? null;
  const activeProfileIds = runningEntries.map(([profileId]) => profileId);
  const running = processes.length > 0 || runningEntries.length > 0;

  return {
    running,
    processCount: Math.max(processes.length, runningEntries.length),
    profileIds: [...new Set([...observedProfileIds, ...activeProfileIds, ...waitingEntries.map(([profileId]) => profileId), ...(latestProfileId ? [latestProfileId] : [])])],
    percentComplete: Number.isFinite(latestState?.percentComplete) ? latestState.percentComplete : null,
    bytesDone: Number.isFinite(latestState?.bytesDone) ? latestState.bytesDone : null,
    totalBytes: Number.isFinite(latestState?.totalBytes) ? latestState.totalBytes : null,
    estimatedSecondsRemaining: Number.isFinite(latestState?.estimatedSecondsRemaining) ? latestState.estimatedSecondsRemaining : null,
    progressLabel: latestState?.progressLabel ?? (processes.length > 0
      ? "Restic is running. Percent complete is unavailable for externally launched backups."
      : "No backup is running."),
    errorDetails: latestState?.errorDetails ?? null,
    checkedAt: new Date().toISOString()
  };
}

function backupErrorDetails(error, profile) {
  const message = formatBackupFailureMessage(profile, error);
  return {
    title: "Backup failed",
    message,
    occurredAt: new Date().toISOString()
  };
}

async function listResticBackupProcesses() {
  if (process.platform === "win32") {
    try {
      const result = await runProcess("powershell.exe", [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process -Filter \"Name = 'restic.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"
      ], { timeoutMs: 10000 });
      const parsed = parsePowerShellJson(result.stdout);
      return parsed
        .map((item) => ({ pid: Number(item.ProcessId), commandLine: String(item.CommandLine ?? "") }))
        .filter((item) => isResticBackupCommand(item.commandLine));
    } catch {
      return [];
    }
  }

  try {
    const result = await runProcess("ps", ["-axo", "pid=,command="], { timeoutMs: 10000 });
    return result.stdout
      .split(/\r?\n/)
      .map((line) => {
        const match = line.trim().match(/^(\d+)\s+(.+)$/);
        return match ? { pid: Number(match[1]), commandLine: match[2] } : null;
      })
      .filter((item) => item && isResticBackupCommand(item.commandLine));
  } catch {
    return [];
  }
}

function parsePowerShellJson(output) {
  const trimmed = String(output ?? "").trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function isResticBackupCommand(commandLine) {
  const command = String(commandLine ?? "");
  return /(^|[\\/\s"])restic(?:\.exe)?(["\s]|$)/i.test(command) && /(^|\s)backup(\s|$)/i.test(command);
}

function commandMatchesRepository(commandLine, repositoryTarget) {
  const target = String(repositoryTarget ?? "").trim();
  if (!target) return false;

  const command = String(commandLine ?? "").toLowerCase();
  const normalizedTarget = target.toLowerCase();
  return command.includes(normalizedTarget)
    || command.includes(normalizedTarget.replace(/\\/g, "/"))
    || command.includes(normalizedTarget.replace(/\//g, "\\"));
}

async function getWindowsDriveType(root) {
  if (process.platform !== "win32") return null;
  const drive = String(root ?? "").slice(0, 2).toUpperCase();
  if (!/^[A-Z]:$/.test(drive)) return null;

  try {
    const result = await runProcess("powershell.exe", [
      "-NoProfile",
      "-Command",
      `(Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='${drive}'").DriveType`
    ], { timeoutMs: 10000 });
    const parsed = Number(result.stdout.trim());
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function chooseBackupSources() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose files and folders",
    properties: ["openFile", "openDirectory", "multiSelections", "showHiddenFiles"]
  });
  return result.canceled ? [] : result.filePaths;
}

async function chooseDirectory() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose folder",
    properties: ["openDirectory", "createDirectory"]
  });
  return result.canceled ? null : result.filePaths[0] ?? null;
}

function listRoots() {
  if (process.platform !== "win32") return ["/"];
  const roots = [];
  for (let code = 65; code <= 90; code += 1) {
    const drive = `${String.fromCharCode(code)}:\\`;
    if (fs.existsSync(drive)) roots.push(drive);
  }
  return roots;
}

function listDirectory(dirPath) {
  const target = dirPath || os.homedir();
  const parent = path.dirname(target);
  const entries = fs.readdirSync(target, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("$RECYCLE.BIN"))
    .map((entry) => ({
      name: entry.name,
      path: path.join(target, entry.name),
      type: entry.isDirectory() ? "directory" : "file"
    }))
    .sort((first, second) => {
      if (first.type !== second.type) return first.type === "directory" ? -1 : 1;
      return first.name.localeCompare(second.name);
    });

  return {
    path: target,
    parent: parent === target ? null : parent,
    entries
  };
}
