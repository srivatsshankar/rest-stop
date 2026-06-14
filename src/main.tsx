import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faArrowDown,
  faArrowRight,
  faArrowUp,
  faBoxArchive,
  faCalendarDays,
  faCheck,
  faChevronDown,
  faChevronRight,
  faCloudArrowDown,
  faDatabase,
  faFile,
  faFolderOpen,
  faBell,
  faGear,
  faHouse,
  faKey,
  faListCheck,
  faDesktop,
  faMoon,
  faWindowMaximize,
  faWindowMinimize,
  faPause,
  faPlus,
  faPlay,
  faPen,
  faRepeat,
  faRotateRight,
  faShieldHalved,
  faStop,
  faSun,
  faTrashCan,
  faXmark
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import "./styles.css";

const APP_ICON_SRC = "app-icon/icon.png";

type RepositoryType = "local" | "sftp" | "rest" | "rclone";
type RcloneBackend = "drive" | "onedrive" | "dropbox" | "box" | "pcloud" | "yandex" | "mega" | "b2" | "s3" | "smb";
type LocationOption = "local" | "smb-folder" | "rest" | "sftp" | `rclone:${RcloneBackend}`;
type RcloneSetupStatus = "idle" | "working" | "success" | "error";
type BackupScheduleUnit = "minutes" | "hours" | "days" | "weeks" | "months" | "years";

type BackupSchedule = {
  mode: "manual" | "recurring";
  every: number;
  unit: BackupScheduleUnit;
  startAt?: string;
  dayOfWeek?: number;
};

type SchedulePreset = "on-demand" | "half-hour" | "one-hour" | "six-hours" | "twelve-hours" | "one-day" | "one-week" | "custom";

type AppView = "home" | "backup" | "restore" | "settings" | "notifications";

type RetentionBucket = "latest" | "hourly" | "daily" | "weekly" | "monthly" | "yearly";

type RetentionPolicy = {
  mode: "unlimited" | "years" | "snapshots";
  years: number;
  snapshots: number;
  latest: number;
  hourly: number;
  daily: number;
  weekly: number;
  monthly: number;
  yearly: number;
};

type BackupLocationAnalysis = {
  target: string;
  root?: string;
  driveType?: number | null;
  isNetwork: boolean;
  reachable: boolean;
  writable: boolean;
  message: string;
};

type BackupProfile = {
  id: string;
  name: string;
  description: string;
  encryptionEnabled: boolean;
  passwordSet: boolean;
  repository: {
    type: RepositoryType;
    target: string;
    rcloneBackend?: RcloneBackend;
    rcloneRemoteName?: string;
    rclonePath?: string;
  };
  sources: string[];
  excludes: string;
  schedule: BackupSchedule;
  schedulePaused?: boolean;
  reviewRequired?: boolean;
  retention: RetentionPolicy;
  lastBackupStartedAt?: string;
  lastBackupCompletedAt?: string;
  createdAt: string;
};

type DraftProfile = Omit<BackupProfile, "id" | "createdAt" | "passwordSet"> & {
  id?: string;
  currentPassword: string;
  password: string;
  passwordConfirm: string;
};

type ResticStatus = {
  installed: boolean;
  path?: string;
  version?: string;
  message?: string;
};

type ToolStatus = ResticStatus;

type ThemeMode = "light" | "dark" | "system";

type FileEntry = {
  name: string;
  path: string;
  type: "file" | "directory";
};

type DirectoryListing = {
  path: string;
  parent: string | null;
  entries: FileEntry[];
};

type RcloneSetupResult = {
  backend: RcloneBackend;
  backendLabel: string;
  remoteName: string;
  repositoryPath: string;
  target: string;
  message: string;
};

type RcloneAccountResult = {
  backend: RcloneBackend;
  backendLabel: string;
  remoteName: string;
  message: string;
};

type ResticSnapshot = {
  id: string;
  shortId: string;
  time: string;
  hostname: string;
  paths: string[];
};

type BackupRunStatus = {
  running: boolean;
  processCount: number;
  profileIds: string[];
  percentComplete: number | null;
  bytesDone?: number | null;
  totalBytes?: number | null;
  estimatedSecondsRemaining?: number | null;
  progressLabel: string;
  errorDetails: {
    title: string;
    message: string;
    occurredAt?: string;
  } | null;
  checkedAt: string;
};

type RestoreStartOptions = {
  repository: BackupProfile["repository"];
  password: string;
  snapshotId: string;
  paths: string[];
  target: string;
  overwrite: boolean;
};

type RestoreRun = {
  id: string;
  source: string;
  destination: string;
  fileCount: number;
  startedAt: string;
  status: "running" | "completed" | "error";
  message?: string;
};

type AppNotification = {
  id: string;
  key: string;
  title: string;
  body: string;
  createdAt: string;
};

type TaskbarStatus = "paused" | "running" | "failed";

type BackupVersionCount = {
  status: "loading" | "ready" | "error" | "pending";
  count?: number;
  message?: string;
};

type AppSettings = {
  autoUpdatesEnabled?: boolean;
  defaultExcludes: string[];
};

type ReststopBridge = {
  ensureRestic: () => Promise<ResticStatus>;
  ensureRclone: () => Promise<ToolStatus>;
  getProfiles: () => Promise<BackupProfile[]>;
  saveProfile: (profile: DraftProfile) => Promise<BackupProfile[]>;
  deleteProfile: (options: { profileId: string; deleteRepository: boolean }) => Promise<BackupProfile[]>;
  setProfileSchedulePaused: (options: { profileId: string; schedulePaused: boolean }) => Promise<BackupProfile[]>;
  chooseBackupSources: () => Promise<string[]>;
  chooseDirectory: () => Promise<string | null>;
  getHomeDirectory: () => Promise<string>;
  getRoots: () => Promise<string[]>;
  listDirectory: (dirPath: string) => Promise<DirectoryListing>;
  openExternal: (url: string) => Promise<void>;
  analyzeBackupLocation: (targetPath: string) => Promise<BackupLocationAnalysis>;
  getBackupStatus: () => Promise<BackupRunStatus>;
  startBackup: (profile: BackupProfile, password: string) => Promise<BackupRunStatus>;
  stopBackup: (profileId: string) => Promise<BackupRunStatus>;
  getStoredPassword: (profileId: string) => Promise<string | null>;
  savePassword: (profileId: string, password: string) => Promise<void>;
  connectRcloneAccount: (options: { backend: RcloneBackend; remoteName: string; config: Record<string, string>; replaceRemote?: boolean }) => Promise<RcloneAccountResult>;
  setupRcloneRepository: (options: { backend: RcloneBackend; remoteName: string; repositoryPath: string; password: string; config: Record<string, string>; replaceRemote?: boolean }) => Promise<RcloneSetupResult>;
  listRcloneDirectory: (options: { remoteName: string; path?: string }) => Promise<DirectoryListing>;
  createRcloneDirectory: (options: { remoteName: string; path: string }) => Promise<DirectoryListing>;
  listRestoreSnapshots: (options: { repository: BackupProfile["repository"]; password: string }) => Promise<ResticSnapshot[]>;
  listRestoreFiles: (options: { repository: BackupProfile["repository"]; password: string; snapshotId: string; path?: string }) => Promise<DirectoryListing>;
  startRestore: (options: RestoreStartOptions) => Promise<{ message: string }>;
  getSettings: () => Promise<AppSettings>;
  saveBackupDefaults: (settings: Pick<AppSettings, "defaultExcludes">) => Promise<AppSettings>;
  getAutoUpdatesEnabled: () => Promise<boolean>;
  setAutoUpdatesEnabled: (enabled: boolean) => Promise<boolean>;
  exportConfig: () => Promise<{ cancelled: boolean; path?: string }>;
  restoreConfig: () => Promise<{ cancelled: boolean; path?: string; profiles?: BackupProfile[]; settings?: AppSettings }>;
  listNotifications: () => Promise<AppNotification[]>;
  setTaskbarStatus: (status: TaskbarStatus) => Promise<void>;
  minimizeWindow: () => Promise<void>;
  toggleMaximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
};

declare global {
  interface Window {
    reststop?: ReststopBridge;
  }
}

const fallbackBridge: ReststopBridge = {
  ensureRestic: async () => ({ installed: false, message: "Run inside Electron to check restic." }),
  ensureRclone: async () => ({ installed: false, message: "Run inside Electron to check Rclone." }),
  getProfiles: async () => [],
  saveProfile: async () => [],
  deleteProfile: async () => [],
  setProfileSchedulePaused: async () => [],
  chooseBackupSources: async () => [],
  chooseDirectory: async () => null,
  getHomeDirectory: async () => "",
  getRoots: async () => [],
  listDirectory: async (dirPath) => ({ path: dirPath, parent: null, entries: [] }),
  openExternal: async () => undefined,
  analyzeBackupLocation: async (targetPath) => ({
    target: targetPath,
    isNetwork: false,
    reachable: false,
    writable: false,
    message: "Run inside Electron to analyze backup locations."
  }),
  getBackupStatus: async () => ({
    running: false,
    processCount: 0,
    profileIds: [],
    percentComplete: null,
    bytesDone: null,
    totalBytes: null,
    estimatedSecondsRemaining: null,
    progressLabel: "No backup is running.",
    errorDetails: null,
    checkedAt: new Date().toISOString()
  }),
  startBackup: async () => ({
    running: false,
    processCount: 0,
    profileIds: [],
    percentComplete: null,
    bytesDone: null,
    totalBytes: null,
    estimatedSecondsRemaining: null,
    progressLabel: "Run inside Electron to start backups.",
    errorDetails: null,
    checkedAt: new Date().toISOString()
  }),
  stopBackup: async () => ({
    running: false,
    processCount: 0,
    profileIds: [],
    percentComplete: null,
    bytesDone: null,
    totalBytes: null,
    estimatedSecondsRemaining: null,
    progressLabel: "Run inside Electron to stop backups.",
    errorDetails: null,
    checkedAt: new Date().toISOString()
  }),
  getStoredPassword: async () => null,
  savePassword: async () => undefined,
  connectRcloneAccount: async () => {
    throw new Error("Restart Rest Stop so the updated restore bridge is loaded.");
  },
  setupRcloneRepository: async () => {
    throw new Error("Run inside Electron to connect Rclone.");
  },
  listRcloneDirectory: async () => {
    throw new Error("Run inside Electron to browse Rclone folders.");
  },
  createRcloneDirectory: async () => {
    throw new Error("Run inside Electron to create Rclone folders.");
  },
  listRestoreSnapshots: async () => {
    throw new Error("Run inside Electron to read restore points.");
  },
  listRestoreFiles: async () => {
    throw new Error("Run inside Electron to browse backup files.");
  },
  startRestore: async () => {
    throw new Error("Run inside Electron to restore files.");
  },
  getSettings: async () => ({ defaultExcludes: defaultExcludePatterns }),
  saveBackupDefaults: async (settings) => ({ defaultExcludes: normalizeExcludePatterns(settings.defaultExcludes) }),
  getAutoUpdatesEnabled: async () => true,
  setAutoUpdatesEnabled: async (enabled) => enabled,
  exportConfig: async () => ({ cancelled: true }),
  restoreConfig: async () => ({ cancelled: true }),
  listNotifications: async () => [],
  setTaskbarStatus: async () => undefined,
  minimizeWindow: async () => undefined,
  toggleMaximizeWindow: async () => undefined,
  closeWindow: async () => undefined
};

const bridge: ReststopBridge = { ...fallbackBridge, ...(window.reststop ?? {}) };

const rcloneBackendOptions: { value: RcloneBackend; label: string; auth: "oauth" | "fields"; pathLabel: string }[] = [
  { value: "drive", label: "Google Drive", auth: "oauth", pathLabel: "Backup folder" },
  { value: "onedrive", label: "OneDrive", auth: "oauth", pathLabel: "Backup folder" },
  { value: "dropbox", label: "Dropbox", auth: "oauth", pathLabel: "Backup folder" },
  { value: "box", label: "Box", auth: "oauth", pathLabel: "Backup folder" },
  { value: "pcloud", label: "pCloud", auth: "oauth", pathLabel: "Backup folder" },
  { value: "yandex", label: "Yandex Disk", auth: "oauth", pathLabel: "Backup folder" },
  { value: "mega", label: "MEGA", auth: "fields", pathLabel: "Backup folder" },
  { value: "b2", label: "Backblaze B2", auth: "fields", pathLabel: "Bucket/folder" },
  { value: "s3", label: "S3", auth: "fields", pathLabel: "Bucket/folder" },
  { value: "smb", label: "SMB / CIFS", auth: "fields", pathLabel: "Share/folder" }
];

const locationOptions: { value: LocationOption; label: string }[] = [
  { value: "local", label: "Local folder" },
  { value: "smb-folder", label: "SMB network folder" },
  { value: "rest", label: "REST server" },
  { value: "sftp", label: "SFTP server" },
  ...rcloneBackendOptions.map((option) => ({ value: `rclone:${option.value}` as LocationOption, label: `${option.label} via Rclone` }))
];

const rcloneConfigFields: Record<RcloneBackend, { key: string; label: string; type?: "password"; placeholder?: string; required?: boolean }[]> = {
  drive: [],
  onedrive: [],
  dropbox: [],
  box: [],
  pcloud: [],
  yandex: [],
  mega: [
    { key: "user", label: "MEGA email", placeholder: "you@example.com", required: true },
    { key: "pass", label: "MEGA password", type: "password", required: true },
    { key: "2fa", label: "2FA code" }
  ],
  b2: [
    { key: "account", label: "Application key ID", required: true },
    { key: "key", label: "Application key", type: "password", required: true },
    { key: "endpoint", label: "Endpoint" }
  ],
  s3: [
    { key: "provider", label: "Provider", placeholder: "AWS", required: true },
    { key: "access_key_id", label: "Access key ID", required: true },
    { key: "secret_access_key", label: "Secret access key", type: "password", required: true },
    { key: "region", label: "Region", placeholder: "us-east-1" },
    { key: "endpoint", label: "Endpoint" }
  ],
  smb: [
    { key: "host", label: "Host", placeholder: "server.local", required: true },
    { key: "user", label: "Username" },
    { key: "pass", label: "Password", type: "password" },
    { key: "domain", label: "Domain", placeholder: "WORKGROUP" }
  ]
};

function slugifyBackupName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "reststop-backup";
}

function defaultRcloneRepositoryPath(name: string) {
  return `reststop/${slugifyBackupName(name)}`;
}

function defaultRcloneRemoteName(name: string) {
  return slugifyBackupName(name);
}

function getRcloneBackendLabel(backend?: RcloneBackend) {
  return rcloneBackendOptions.find((option) => option.value === backend)?.label ?? "Rclone";
}

function parseRcloneTarget(target: string) {
  const match = target.match(/^rclone:([^:]+):(.+)$/);
  return match ? { remoteName: match[1], path: match[2] } : null;
}

function formatRepositoryLocation(repository: BackupProfile["repository"]) {
  const target = repository.target.trim();
  if (!target) return "Choose a backup location.";

  if (repository.type === "rclone") {
    const parsed = parseRcloneTarget(target);
    const backupPath = repository.rclonePath || parsed?.path || target;
    const backendLabel = getRcloneBackendLabel(repository.rcloneBackend);
    return `${backendLabel}: /${backupPath.replace(/^\/+/, "")}`;
  }

  if (repository.type === "local") return `Local folder: ${target}`;
  if (repository.type === "rest") return `REST server: ${target}`;
  if (repository.type === "sftp") return `SFTP server: ${target}`;
  return target;
}

function formatProfileOption(profile: BackupProfile) {
  return `${profile.name} - ${formatRepositoryLocation(profile.repository)}`;
}

function formatSnapshotOption(snapshot: ResticSnapshot) {
  const time = snapshot.time ? new Date(snapshot.time) : null;
  const timeLabel = time && !Number.isNaN(time.getTime())
    ? time.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : snapshot.shortId || snapshot.id;
  const host = snapshot.hostname ? ` - ${snapshot.hostname}` : "";
  return `${timeLabel}${host}`;
}

function formatSnapshotSourcePaths(snapshot: ResticSnapshot | undefined) {
  if (!snapshot?.paths.length) return "No source paths reported.";
  return snapshot.paths.join(", ");
}

function repositoryFromLocation(location: LocationOption, target: string): BackupProfile["repository"] {
  if (location === "rest") return { type: "rest", target };
  if (location === "sftp") return { type: "sftp", target };
  return { type: "local", target };
}

function rcloneRepository(remoteName: string, backend: RcloneBackend, repositoryPath: string): BackupProfile["repository"] {
  const normalizedPath = repositoryPath.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  return {
    type: "rclone",
    target: `rclone:${remoteName}:${normalizedPath}`,
    rcloneBackend: backend,
    rcloneRemoteName: remoteName,
    rclonePath: normalizedPath
  };
}

function normalizeRemotePathInput(value: string) {
  return value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function joinRemotePath(parentPath: string, childName: string) {
  return [normalizeRemotePathInput(parentPath), normalizeRemotePathInput(childName)].filter(Boolean).join("/");
}

const defaultSchedule: BackupSchedule = { mode: "manual", every: 1, unit: "hours" };
const retentionCountOptions: { key: RetentionBucket; label: string }[] = [
  { key: "latest", label: "Latest" },
  { key: "hourly", label: "Hourly" },
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" }
];
const defaultRetention: RetentionPolicy = {
  mode: "years",
  years: 1,
  snapshots: 30,
  latest: 30,
  hourly: 0,
  daily: 7,
  weekly: 4,
  monthly: 12,
  yearly: 3
};
const defaultExcludePatterns = [
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
const defaultExcludeText = defaultExcludePatterns.join("\n");
const schedulePresetOptions: { value: SchedulePreset; label: string }[] = [
  { value: "on-demand", label: "Only when I run it" },
  { value: "half-hour", label: "Every half hour" },
  { value: "one-hour", label: "Every hour" },
  { value: "six-hours", label: "Every 6 hours" },
  { value: "twelve-hours", label: "Every 12 hours" },
  { value: "one-day", label: "Every day" },
  { value: "one-week", label: "Every week" },
  { value: "custom", label: "Manual recurring" }
];
const customScheduleUnits: BackupScheduleUnit[] = ["minutes", "hours", "days", "months", "years"];
const weekdayOptions = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const emptyDraft: DraftProfile = {
  name: "",
  description: "",
  encryptionEnabled: true,
  currentPassword: "",
  password: "",
  passwordConfirm: "",
  repository: { type: "local", target: "" },
  sources: [],
  excludes: defaultExcludeText,
  schedule: defaultSchedule,
  schedulePaused: false,
  retention: defaultRetention
};

function App() {
  const [profiles, setProfiles] = useState<BackupProfile[]>([]);
  const [restic, setRestic] = useState<ResticStatus>({ installed: false, message: "Checking restic..." });
  const [rclone, setRclone] = useState<ToolStatus>({ installed: false, message: "Checking Rclone..." });
  const [resticChecking, setResticChecking] = useState(true);
  const [rcloneChecking, setRcloneChecking] = useState(true);
  const [backupStatus, setBackupStatus] = useState<BackupRunStatus>({
    running: false,
    processCount: 0,
    profileIds: [],
    percentComplete: null,
    bytesDone: null,
    totalBytes: null,
    estimatedSecondsRemaining: null,
    progressLabel: "No backup is running.",
    errorDetails: null,
    checkedAt: new Date().toISOString()
  });
  const [view, setView] = useState<AppView>("home");
  const [viewHistory, setViewHistory] = useState<AppView[]>([]);
  const [editingProfile, setEditingProfile] = useState<BackupProfile | null>(null);
  const [expandedProfileId, setExpandedProfileId] = useState<string | null>(null);
  const [passwordPrompt, setPasswordPrompt] = useState<BackupProfile | null>(null);
  const [deletePromptOpen, setDeletePromptOpen] = useState(false);
  const [deleteProfileId, setDeleteProfileId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const [restoreRuns, setRestoreRuns] = useState<RestoreRun[]>([]);
  const [versionCounts, setVersionCounts] = useState<Record<string, BackupVersionCount>>({});
  const [globalSchedulePaused, setGlobalSchedulePaused] = useState(() => localStorage.getItem("reststop-global-schedule-paused") === "true");
  const [autoUpdatesEnabled, setAutoUpdatesEnabledState] = useState(true);
  const [defaultExcludes, setDefaultExcludes] = useState(defaultExcludeText);
  const [configMessage, setConfigMessage] = useState("");
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem("reststop-theme");
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  });
  const newMenuRef = useRef<HTMLDivElement>(null);
  const profilesRef = useRef<BackupProfile[]>([]);
  const backupStatusRef = useRef(backupStatus);
  const globalSchedulePausedRef = useRef(globalSchedulePaused);
  const passwordPromptRef = useRef<BackupProfile | null>(null);
  const scheduledRunInProgressRef = useRef(false);

  useEffect(() => {
    bridge.getProfiles().then(setProfiles);
    runResticCheck();
    runRcloneCheck();
    refreshBackupStatus();
    bridge.getSettings()
      .then((settings) => {
        setAutoUpdatesEnabledState(settings.autoUpdatesEnabled !== false);
        setDefaultExcludes(excludePatternsToText(settings.defaultExcludes));
      })
      .catch(() => {
        setAutoUpdatesEnabledState(true);
        setDefaultExcludes(defaultExcludeText);
      });
  }, []);

  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  useEffect(() => {
    backupStatusRef.current = backupStatus;
  }, [backupStatus]);

  useEffect(() => {
    globalSchedulePausedRef.current = globalSchedulePaused;
  }, [globalSchedulePaused]);

  useEffect(() => {
    passwordPromptRef.current = passwordPrompt;
  }, [passwordPrompt]);

  useEffect(() => {
    const interval = window.setInterval(refreshBackupStatus, 5000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(runDueScheduledBackup, 1000);
    const interval = window.setInterval(runDueScheduledBackup, 30000);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    for (const profile of profiles) {
      if (profile.reviewRequired) continue;
      if (!versionCounts[profile.id]) void loadBackupVersionCount(profile);
    }
  }, [profiles, versionCounts]);

  useEffect(() => {
    function closeMenuOnOutsideClick(event: MouseEvent) {
      if (!newMenuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }

    if (menuOpen) document.addEventListener("mousedown", closeMenuOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeMenuOnOutsideClick);
  }, [menuOpen]);

  useEffect(() => {
    if (view === "notifications") void loadNotifications();
  }, [view]);

  useEffect(() => {
    localStorage.setItem("reststop-global-schedule-paused", String(globalSchedulePaused));
  }, [globalSchedulePaused]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    function applyTheme() {
      const effectiveTheme = themeMode === "system" ? (media.matches ? "dark" : "light") : themeMode;
      document.documentElement.dataset.theme = effectiveTheme;
      localStorage.setItem("reststop-theme", themeMode);
    }

    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [themeMode]);

  useEffect(() => {
    bridge.setTaskbarStatus(taskbarStatusForActivity(backupStatus, restoreRuns)).catch(() => {});
  }, [backupStatus, restoreRuns]);

  const canGoBack = viewHistory.length > 0;
  const activeRestoreRuns = restoreRuns.filter((run) => run.status === "running");
  const restoreRunning = activeRestoreRuns.length > 0;
  const titleActivity = backupStatus.running && restoreRunning
    ? { label: `Backup and ${activeRestoreRuns.length === 1 ? "restore" : "restores"} running`, status: "combined" }
    : backupStatus.running
      ? { label: "Backups running", status: "running" }
    : restoreRunning
      ? { label: activeRestoreRuns.length === 1 ? "Restore running" : `${activeRestoreRuns.length} restores running`, status: "restore" }
    : view === "restore"
      ? { label: "Initializing restore", status: "initializing" }
      : { label: "No backups running", status: "idle" };

  function navigateTo(nextView: AppView) {
    if (nextView === view) return;
    setViewHistory((history) => [...history, view]);
    setView(nextView);
  }

  function navigateHome() {
    setEditingProfile(null);
    setViewHistory([]);
    setView("home");
  }

  function goBack() {
    if (view === "backup") setEditingProfile(null);
    setViewHistory((history) => {
      const previousView = history[history.length - 1];
      if (previousView) setView(previousView);
      return history.slice(0, -1);
    });
  }

  async function runResticCheck() {
    setResticChecking(true);
    setRestic((current) => ({ ...current, message: current.installed ? "Checking restic..." : "Checking for restic and installing it if needed..." }));
    try {
      setRestic(await bridge.ensureRestic());
    } finally {
      setResticChecking(false);
    }
  }

  async function runRcloneCheck() {
    setRcloneChecking(true);
    setRclone((current) => ({ ...current, message: current.installed ? "Checking Rclone..." : "Checking for Rclone and installing it if needed..." }));
    try {
      setRclone(await bridge.ensureRclone());
    } finally {
      setRcloneChecking(false);
    }
  }

  async function handleAutoUpdatesChange(enabled: boolean) {
    setAutoUpdatesEnabledState(enabled);
    try {
      setAutoUpdatesEnabledState(await bridge.setAutoUpdatesEnabled(enabled));
    } catch {
      setAutoUpdatesEnabledState((current) => !current);
    }
  }

  async function handleDefaultExcludesChange(value: string) {
    setDefaultExcludes(value);
    try {
      await bridge.saveBackupDefaults({ defaultExcludes: normalizeExcludePatterns(value) });
    } catch (error) {
      setConfigMessage(error instanceof Error ? error.message : "Unable to save backup defaults.");
    }
  }

  async function handleExportConfig() {
    setConfigMessage("");
    try {
      const result = await bridge.exportConfig();
      if (!result.cancelled) setConfigMessage(`Config saved to ${result.path}.`);
    } catch (error) {
      setConfigMessage(error instanceof Error ? error.message : "Unable to save the config file.");
    }
  }

  async function handleRestoreConfig() {
    setConfigMessage("");
    try {
      const result = await bridge.restoreConfig();
      if (result.cancelled) return;
      const restoredProfiles = result.profiles ?? [];
      setProfiles(restoredProfiles);
      setVersionCounts({});
      setExpandedProfileId(null);
      setAutoUpdatesEnabledState(result.settings?.autoUpdatesEnabled !== false);
      setDefaultExcludes(excludePatternsToText(result.settings?.defaultExcludes ?? defaultExcludePatterns));
      setConfigMessage(`Config restored from ${result.path}. Enter credentials for each restored backup before running it.`);
      if (restoredProfiles.length > 0) {
        setEditingProfile(restoredProfiles[0]);
        setExpandedProfileId(restoredProfiles[0].id);
        navigateTo("backup");
      }
    } catch (error) {
      setConfigMessage(error instanceof Error ? error.message : "Unable to restore the config file.");
    }
  }

  async function refreshBackupStatus() {
    try {
      setBackupStatus(await bridge.getBackupStatus());
    } catch {
      setBackupStatus((current) => ({
        ...current,
        running: false,
        processCount: 0,
        profileIds: [],
        percentComplete: null,
        progressLabel: "Backup status is unavailable.",
        errorDetails: null,
        checkedAt: new Date().toISOString()
      }));
    }
  }

  async function loadNotifications() {
    setNotificationsLoading(true);
    setNotificationsError("");
    try {
      setNotifications(await bridge.listNotifications());
    } catch (error) {
      setNotificationsError(error instanceof Error ? error.message : "Unable to load notifications.");
    } finally {
      setNotificationsLoading(false);
    }
  }

  async function loadBackupVersionCount(profile: BackupProfile, force = false) {
    if (!force) {
      const existing = versionCounts[profile.id];
      if (existing) return;
    }

    setVersionCounts((current) => ({
      ...current,
      [profile.id]: { status: "loading" }
    }));

    try {
      const password = await bridge.getStoredPassword(profile.id);
      if (!password) throw new Error("Password unavailable.");
      const snapshots = await bridge.listRestoreSnapshots({ repository: profile.repository, password });
      setVersionCounts((current) => ({
        ...current,
        [profile.id]: { status: "ready", count: snapshots.length }
      }));
    } catch (error) {
      setVersionCounts((current) => ({
        ...current,
        [profile.id]: {
          status: "error",
          message: error instanceof Error ? error.message : "Unable to count versions."
        }
      }));
    }
  }

  async function handleSave(profile: DraftProfile) {
    const previousProfileIds = new Set(profiles.map((item) => item.id));
    const isNewProfile = !profile.id || !previousProfileIds.has(profile.id);
    const wasReviewRequired = Boolean(profile.id && profiles.find((item) => item.id === profile.id)?.reviewRequired);
    const saved = await bridge.saveProfile(profile);
    const savedProfile = isNewProfile
      ? saved.find((item) => !previousProfileIds.has(item.id)) ?? saved[saved.length - 1]
      : saved.find((item) => item.id === profile.id);
    setProfiles(saved);
    setExpandedProfileId(savedProfile?.id ?? profile.id ?? saved[saved.length - 1]?.id ?? null);
    if (wasReviewRequired) {
      const nextReviewProfile = saved.find((item) => item.reviewRequired);
      if (nextReviewProfile) {
        setEditingProfile(nextReviewProfile);
        setExpandedProfileId(nextReviewProfile.id);
        await refreshBackupStatus();
        return;
      }
      setConfigMessage("All restored backup credentials have been saved.");
    }
    navigateHome();
    if (isNewProfile && savedProfile) {
      await executeBackupRun(savedProfile, profile.password, false);
      return;
    }
    await refreshBackupStatus();
  }

  async function handleDeleteProfile(profileId: string, deleteRepository: boolean) {
    const saved = await bridge.deleteProfile({ profileId, deleteRepository });
    setProfiles(saved);
    setExpandedProfileId((current) => current === profileId ? null : current);
    setEditingProfile((current) => current?.id === profileId ? null : current);
    setDeletePromptOpen(false);
    setDeleteProfileId(null);
    await refreshBackupStatus();
    navigateHome();
  }

  function openDeleteBackup(profile?: BackupProfile) {
    setDeleteProfileId(profile?.id ?? expandedProfileId ?? profiles[0]?.id ?? null);
    setDeletePromptOpen(true);
  }

  async function handlePauseProfile(profile: BackupProfile, schedulePaused: boolean) {
    try {
      const saved = await bridge.setProfileSchedulePaused({ profileId: profile.id, schedulePaused });
      setProfiles(saved);
    } catch (error) {
      setBackupStatus((current) => ({
        ...current,
      profileIds: [...new Set([...current.profileIds, profile.id])],
      percentComplete: null,
      progressLabel: error instanceof Error ? error.message : "Unable to update this backup schedule.",
        checkedAt: new Date().toISOString()
      }));
    }
  }

  async function handleStopBackup(profile: BackupProfile) {
    setExpandedProfileId(profile.id);
    setBackupStatus((current) => ({
      ...current,
      running: true,
      profileIds: [...new Set([...current.profileIds, profile.id])],
      percentComplete: current.profileIds.includes(profile.id) ? current.percentComplete : null,
      progressLabel: "Stopping backup...",
      errorDetails: null,
      checkedAt: new Date().toISOString()
    }));
    try {
      setBackupStatus(await bridge.stopBackup(profile.id));
    } catch (error) {
      setBackupStatus({
        running: false,
        processCount: 0,
        profileIds: [profile.id],
        percentComplete: null,
        progressLabel: error instanceof Error ? error.message : "Unable to stop this backup.",
        errorDetails: backupErrorDetails(error, "Unable to stop this backup."),
        checkedAt: new Date().toISOString()
      });
    }
  }

  function openCreateBackup() {
    setEditingProfile(null);
    navigateTo("backup");
  }

  function openEditBackup(profile: BackupProfile) {
    setEditingProfile(profile);
    setExpandedProfileId(profile.id);
    navigateTo("backup");
  }

  async function startBackup(profile: BackupProfile) {
    if (profile.passwordSet) {
      const stored = await bridge.getStoredPassword(profile.id);
      if (stored) {
        await executeBackupRun(profile, stored, false);
        return;
      }
      setPasswordPrompt(profile);
      return;
    }
    await executeBackupRun(profile, "", false);
  }

  async function runDueScheduledBackup() {
    if (scheduledRunInProgressRef.current || globalSchedulePausedRef.current || backupStatusRef.current.running || passwordPromptRef.current) return;
    const dueProfile = profilesRef.current
      .map(normalizeProfile)
      .find((profile) => isScheduledBackupDue(profile));
    if (!dueProfile) return;

    scheduledRunInProgressRef.current = true;
    try {
      await startBackup(dueProfile);
    } finally {
      scheduledRunInProgressRef.current = false;
    }
  }

  async function executeBackupRun(profile: BackupProfile, password: string, persistPassword: boolean) {
    setPasswordPrompt(null);
    setExpandedProfileId(profile.id);
    setBackupStatus((current) => ({
      ...current,
      running: true,
      profileIds: [profile.id],
      percentComplete: 0,
      bytesDone: null,
      totalBytes: null,
      estimatedSecondsRemaining: null,
      progressLabel: "Starting backup...",
      errorDetails: null,
      checkedAt: new Date().toISOString()
    }));
    try {
      const status = await bridge.startBackup(profile, password);
      if (persistPassword && password) bridge.savePassword(profile.id, password).catch(() => {});
      setVersionCounts((current) => {
        const { [profile.id]: _removed, ...remaining } = current;
        return remaining;
      });
      setBackupStatus(status);
      bridge.getProfiles().then(setProfiles).catch(() => {});
    } catch (error) {
      setBackupStatus({
        running: false,
        processCount: 0,
        profileIds: [profile.id],
        percentComplete: null,
        progressLabel: error instanceof Error ? error.message : "Unable to start this backup.",
        errorDetails: backupErrorDetails(error, "Unable to start this backup."),
        checkedAt: new Date().toISOString()
      });
    }
  }

  function startRestoreRun(options: RestoreStartOptions, details: { source: string; destination: string; fileCount: number }) {
    const id = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const run: RestoreRun = {
      id,
      source: details.source,
      destination: details.destination,
      fileCount: details.fileCount,
      startedAt: new Date().toISOString(),
      status: "running"
    };
    setRestoreRuns((current) => [run, ...current]);
    navigateHome();

    bridge.startRestore(options)
      .then((result) => {
        setRestoreRuns((current) => current.map((item) => item.id === id
          ? {
            ...item,
            status: "completed",
            message: result.message
          }
          : item
        ));
      })
      .catch((restoreError) => {
        setRestoreRuns((current) => current.map((item) => item.id === id
          ? {
            ...item,
            status: "error",
            message: restoreError instanceof Error ? restoreError.message : "Unable to restore these files."
          }
          : item
        ));
      });
  }

  return (
    <main className="app-window bg-paper text-ink">
      <header className="title-bar drag-region">
        <div className="no-drag justify-self-start">
          {canGoBack ? (
            <button className="title-back-button" onClick={goBack}>
              <FontAwesomeIcon icon={faArrowLeft} /> Back
            </button>
          ) : null}
        </div>
        <h1 className="title-heading">
          <img className="title-app-icon" src={APP_ICON_SRC} alt="" aria-hidden="true" />
          <span>Rest Stop</span>
          <span className={`title-activity ${titleActivity.status}`}>{titleActivity.label}</span>
        </h1>
        <div className="no-drag justify-self-end">
          <WindowControls />
        </div>
      </header>

      <div className="app-scroll">
        <div className="app-content">
          <div className="drag-region mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-normal">Rest Stop</h2>
              <p className="text-sm text-ink/65">Simple restic backups.</p>
            </div>

            <div className="top-menu-actions no-drag flex items-center gap-2">
              <div className="top-menu-action">
                <button
                  className={`new-menu-button tooltip-button ${globalSchedulePaused ? "active" : ""}`}
                  aria-label={globalSchedulePaused ? "Resume all schedules" : "Pause all schedules"}
                  aria-pressed={globalSchedulePaused}
                  data-tooltip={globalSchedulePaused ? "Resume all schedules" : "Pause all schedules"}
                  onClick={() => {
                    setGlobalSchedulePaused((paused) => !paused);
                    setMenuOpen(false);
                  }}
                >
                  <FontAwesomeIcon icon={globalSchedulePaused ? faPlay : faPause} />
                </button>
              </div>

              <div className="top-menu-action">
                <button
                  className="new-menu-button tooltip-button"
                  aria-label="Notifications"
                  aria-pressed={view === "notifications"}
                  data-tooltip="Notifications"
                  onClick={() => {
                    if (view === "notifications") goBack();
                    else navigateTo("notifications");
                    setMenuOpen(false);
                  }}
                >
                  <FontAwesomeIcon icon={faBell} />
                </button>
              </div>

              <div className="top-menu-action">
                <button
                  className="new-menu-button tooltip-button"
                  aria-label="Settings"
                  aria-pressed={view === "settings"}
                  data-tooltip="Settings"
                  onClick={() => {
                    if (view === "settings") goBack();
                    else navigateTo("settings");
                    setMenuOpen(false);
                  }}
                >
                  <FontAwesomeIcon icon={faGear} />
                </button>
              </div>

              <div className="top-menu-action" ref={newMenuRef}>
                <button
                  className="new-menu-button tooltip-button"
                  aria-label="New Backup/Restore"
                  aria-expanded={menuOpen}
                  data-tooltip="New Backup/Restore"
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  <FontAwesomeIcon icon={faPlus} />
                </button>
                {menuOpen ? (
                  <div className="dropdown-menu w-72 p-1">
                    <button className="menu-item" onClick={() => { openCreateBackup(); setMenuOpen(false); }}>
                      <FontAwesomeIcon icon={faBoxArchive} /> Create backup
                    </button>
                    <button className="menu-item" onClick={() => { navigateTo("restore"); setMenuOpen(false); }}>
                      <FontAwesomeIcon icon={faCloudArrowDown} /> Restore backup
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <ViewErrorBoundary key={view} view={view}>
            {view === "settings" ? (
              <SettingsView
                restic={restic}
                resticChecking={resticChecking}
                rclone={rclone}
                rcloneChecking={rcloneChecking}
                themeMode={themeMode}
                autoUpdatesEnabled={autoUpdatesEnabled}
                defaultExcludes={defaultExcludes}
                configMessage={configMessage}
                onCheckRestic={runResticCheck}
                onCheckRclone={runRcloneCheck}
                onThemeChange={setThemeMode}
                onAutoUpdatesChange={handleAutoUpdatesChange}
                onDefaultExcludesChange={handleDefaultExcludesChange}
                onExportConfig={handleExportConfig}
                onRestoreConfig={handleRestoreConfig}
              />
            ) : null}
            {view === "notifications" ? (
              <NotificationsView
                notifications={notifications}
                loading={notificationsLoading}
                error={notificationsError}
                onRefresh={loadNotifications}
              />
            ) : null}
            {view === "backup" ? (
              <BackupWizard
                key={editingProfile?.id ?? "new"}
                initialProfile={editingProfile}
                defaultExcludes={defaultExcludes}
                onCancel={goBack}
                onSave={handleSave}
              />
            ) : null}
            {view === "restore" ? <RestoreFlow profiles={profiles} onCancel={goBack} onStartRestore={startRestoreRun} /> : null}
            {view === "home" ? (
              <div className="grid gap-4">
                <RestoreActivityPanel
                  runs={restoreRuns}
                  onDismiss={(runId) => setRestoreRuns((current) => current.filter((run) => run.id !== runId))}
                />
                {profiles.length === 0 ? (
                  <EmptyState onCreate={openCreateBackup} onRestore={() => navigateTo("restore")} />
                ) : (
                  <BackupList
                    profiles={profiles}
                    backupStatus={backupStatus}
                    versionCounts={versionCounts}
                    globalSchedulePaused={globalSchedulePaused}
                    expandedProfileId={expandedProfileId}
                    onToggle={(profileId) => setExpandedProfileId((current) => current === profileId ? null : profileId)}
                    onEdit={openEditBackup}
                    onStart={startBackup}
                    onStop={handleStopBackup}
                    onPause={handlePauseProfile}
                    onDelete={openDeleteBackup}
                  />
                )}
              </div>
            ) : null}
          </ViewErrorBoundary>
        </div>
      </div>
      <footer className="app-footer drag-region">Rest Stop // {profiles.length} {profiles.length === 1 ? "backup" : "backups"}</footer>
      {passwordPrompt ? (
        <PasswordPromptModal
          profile={passwordPrompt}
          onConfirm={(password) => executeBackupRun(passwordPrompt, password, true)}
          onCancel={() => setPasswordPrompt(null)}
        />
      ) : null}
      {deletePromptOpen ? (
        <DeleteBackupModal
          profiles={profiles}
          initialProfileId={deleteProfileId}
          onConfirm={handleDeleteProfile}
          onCancel={() => {
            setDeletePromptOpen(false);
            setDeleteProfileId(null);
          }}
        />
      ) : null}
    </main>
  );
}

function taskbarStatusForActivity(backupStatus: BackupRunStatus, restoreRuns: RestoreRun[]): TaskbarStatus {
  if (backupNeedsAttention(backupStatus) || restoreRuns.some((run) => run.status === "error")) return "failed";
  if (backupStatus.running || restoreRuns.some((run) => run.status === "running")) return "running";
  return "paused";
}

function backupNeedsAttention(status: BackupRunStatus) {
  if (status.errorDetails) return true;
  if (status.running || status.profileIds.length === 0) return false;
  const message = status.progressLabel.trim();
  if (!message) return false;
  return !/^(No backup is running\.?|Backup completed\.?|Backup stopped\.?|Backup retry cancelled\.?)/i.test(message)
    && !/^Waiting for network location/i.test(message);
}

function backupErrorDetails(error: unknown, fallback: string): BackupRunStatus["errorDetails"] {
  return {
    title: "Backup failed",
    message: error instanceof Error ? error.message : fallback,
    occurredAt: new Date().toISOString()
  };
}

class ViewErrorBoundary extends React.Component<
  { children: React.ReactNode; view: AppView },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`Unable to render ${this.props.view} view`, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="view-error-panel">
        <p className="backup-error-eyebrow">View unavailable</p>
        <h2>{viewLabel(this.props.view)} could not be displayed</h2>
        <p>{this.state.error.message || "An unexpected rendering error occurred."}</p>
      </section>
    );
  }
}

function viewLabel(view: AppView) {
  if (view === "backup") return "Backup setup";
  if (view === "restore") return "Restore";
  if (view === "settings") return "Settings";
  if (view === "notifications") return "Notifications";
  return "Home";
}

function NotificationsView({
  notifications,
  loading,
  error,
  onRefresh
}: {
  notifications: AppNotification[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
}) {
  return (
    <section className="notifications-view rounded-md border border-ink/10 bg-white p-5 shadow-sm">
      <div className="notifications-view-header">
        <div>
          <h2 className="text-lg font-semibold">Notifications</h2>
          <p className="text-sm text-ink/65">Backup and restore alerts shown by Rest Stop.</p>
        </div>
        <button className="small-button" disabled={loading} type="button" onClick={onRefresh}>
          <FontAwesomeIcon className={loading ? "animate-spin" : ""} icon={faRotateRight} /> Refresh
        </button>
      </div>

      {error ? <p className="setup-status error">{error}</p> : null}
      {loading && notifications.length === 0 ? <p className="setup-status">Loading notifications...</p> : null}
      {!loading && notifications.length === 0 ? (
        <div className="notifications-empty">
          <FontAwesomeIcon icon={faBell} />
          <p>No notifications have been shown yet.</p>
        </div>
      ) : null}
      {notifications.length > 0 ? (
        <ul className="notification-log-list">
          {notifications.map((notification) => (
            <li key={notification.id}>
              <div>
                <p className="notification-log-title">{notification.title}</p>
                <time dateTime={notification.createdAt}>{formatNotificationTime(notification.createdAt)}</time>
              </div>
              {notification.body ? <p className="notification-log-body">{notification.body}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function SettingsView({
  restic,
  resticChecking,
  rclone,
  rcloneChecking,
  themeMode,
  autoUpdatesEnabled,
  defaultExcludes,
  configMessage,
  onCheckRestic,
  onCheckRclone,
  onThemeChange,
  onAutoUpdatesChange,
  onDefaultExcludesChange,
  onExportConfig,
  onRestoreConfig
}: {
  restic: ResticStatus;
  resticChecking: boolean;
  rclone: ToolStatus;
  rcloneChecking: boolean;
  themeMode: ThemeMode;
  autoUpdatesEnabled: boolean;
  defaultExcludes: string;
  configMessage: string;
  onCheckRestic: () => void;
  onCheckRclone: () => void;
  onThemeChange: (mode: ThemeMode) => void;
  onAutoUpdatesChange: (enabled: boolean) => void;
  onDefaultExcludesChange: (value: string) => void;
  onExportConfig: () => void;
  onRestoreConfig: () => void;
}) {
  return (
    <section className="settings-view rounded-md border border-ink/10 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <h2 className="text-2xl font-semibold">Settings</h2>
      </div>

      <section className="settings-section">
        <p className="settings-label">Restic</p>
        <div className="rounded-md border border-ink/10 bg-paper px-4 py-3">
          <div className="flex flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={`status-dot ${restic.installed ? "bg-pine" : "bg-brass"}`} />
              <p className="text-sm font-semibold">{resticChecking ? "Checking or installing restic" : restic.installed ? "restic is installed" : "restic is not installed"}</p>
            </div>
            <button className="small-button justify-center" disabled={resticChecking} onClick={onCheckRestic}>
              <FontAwesomeIcon className={resticChecking ? "animate-spin" : ""} icon={faRotateRight} /> Check again
            </button>
          </div>
        </div>
        <div className="mt-3 rounded-md border border-ink/10 bg-paper px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className={`status-dot ${rclone.installed ? "bg-pine" : "bg-brass"}`} />
              <p className="text-sm font-semibold">{rcloneChecking ? "Checking or installing Rclone" : rclone.installed ? "Rclone is installed" : "Rclone is not installed"}</p>
            </div>
            <button className="small-button justify-center" disabled={rcloneChecking} onClick={onCheckRclone}>
              <FontAwesomeIcon className={rcloneChecking ? "animate-spin" : ""} icon={faRotateRight} /> Check again
            </button>
          </div>
        </div>
      </section>

      <section className="settings-section updates-section">
        <p className="settings-label">Updates</p>
        <label className="settings-toggle">
          <span>Automatically Install Updates</span>
          <input
            checked={autoUpdatesEnabled}
            onChange={(event) => onAutoUpdatesChange(event.target.checked)}
            type="checkbox"
          />
          <span aria-hidden="true" className="settings-toggle-control" />
        </label>
      </section>

      <section className="settings-section appearance-section">
        <p className="settings-label">Appearance</p>
        <div className="theme-selector" role="group" aria-label="Appearance mode">
          <button className={themeMode === "light" ? "selected" : ""} onClick={() => onThemeChange("light")}>
            <FontAwesomeIcon icon={faSun} /> Light
          </button>
          <button className={themeMode === "dark" ? "selected" : ""} onClick={() => onThemeChange("dark")}>
            <FontAwesomeIcon icon={faMoon} /> Dark
          </button>
          <button className={themeMode === "system" ? "selected" : ""} onClick={() => onThemeChange("system")}>
            <FontAwesomeIcon icon={faDesktop} /> System
          </button>
        </div>
      </section>

      <section className="settings-section config-section">
        <p className="settings-label">Config</p>
        <div className="rounded-md border border-ink/10 bg-paper px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="status-dot bg-pine" />
              <p className="text-sm font-semibold">Configuration File</p>
            </div>
            <div className="config-actions">
              <button className="small-button justify-center" onClick={onExportConfig}>
                <FontAwesomeIcon icon={faArrowDown} /> Download
              </button>
              <button className="small-button justify-center" onClick={onRestoreConfig}>
                <FontAwesomeIcon icon={faArrowUp} /> Restore
              </button>
            </div>
          </div>
        </div>
        {configMessage ? <p className="setup-status">{configMessage}</p> : null}
      </section>

      <section className="settings-section backup-defaults-section">
        <p className="settings-label">Backup defaults</p>
        <ExclusionFilterEditor label="Default exclusions" value={defaultExcludes} onChange={onDefaultExcludesChange} />
      </section>
    </section>
  );
}

function WindowControls() {
  return (
    <div className="window-controls" aria-label="Window controls">
      <button aria-label="Minimize" onClick={() => bridge.minimizeWindow()}>
        <FontAwesomeIcon icon={faWindowMinimize} />
      </button>
      <button aria-label="Maximize" onClick={() => bridge.toggleMaximizeWindow()}>
        <FontAwesomeIcon icon={faWindowMaximize} />
      </button>
      <button className="close" aria-label="Close" onClick={() => bridge.closeWindow()}>
        <FontAwesomeIcon icon={faXmark} />
      </button>
    </div>
  );
}

function RestoreActivityPanel({ runs, onDismiss }: { runs: RestoreRun[]; onDismiss: (runId: string) => void }) {
  if (runs.length === 0) return null;
  const runningCount = runs.filter((run) => run.status === "running").length;
  const errorCount = runs.filter((run) => run.status === "error").length;
  const completedCount = runs.filter((run) => run.status === "completed").length;
  const heading = errorCount > 0
    ? "Restore attention needed"
    : runningCount > 0
      ? `${runningCount} ${runningCount === 1 ? "restore is" : "restores are"} running`
      : `${completedCount} ${completedCount === 1 ? "restore is" : "restores are"} complete`;
  const detail = errorCount > 0
    ? `${errorCount} restore ${errorCount === 1 ? "needs" : "need"} attention.`
    : runningCount > 0
      ? "You can continue using Rest Stop while restore jobs finish."
      : "Close this notice when you are done reviewing it.";
  const headerIcon = errorCount > 0 ? faCloudArrowDown : runningCount > 0 ? faRotateRight : faCheck;

  return (
    <section className="restore-activity-panel">
      <div className="restore-activity-header">
        <div>
          <h2>{heading}</h2>
          <p>{detail}</p>
        </div>
        <FontAwesomeIcon className={runningCount > 0 && errorCount === 0 ? "animate-spin" : ""} icon={headerIcon} />
      </div>
      <ul className="restore-activity-list">
        {runs.map((run) => (
          <li key={run.id} className={run.status}>
            <div>
              <p className="restore-activity-title">{run.status === "running" ? "Restore running" : run.status === "completed" ? "Restore complete" : "Restore failed"}</p>
              <p className="restore-activity-detail">{run.fileCount} {run.fileCount === 1 ? "item" : "items"} from {run.source}</p>
              <p className="restore-activity-detail">Destination: {run.destination}</p>
              {run.message ? <p className="restore-activity-message">{run.message}</p> : null}
            </div>
            {run.status !== "running" ? (
              <button className="small-button" onClick={() => onDismiss(run.id)}>Close</button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function EmptyState({ onCreate, onRestore }: { onCreate: () => void; onRestore: () => void }) {
  return (
    <section className="rounded-md border border-ink/10 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="grid h-14 w-14 min-w-14 place-items-center rounded-md bg-skyglass text-pine">
          <FontAwesomeIcon className="text-xl" icon={faDatabase} />
        </div>
        <div>
          <h2 className="text-2xl font-semibold">No backups yet</h2>
          <p className="mt-1 text-sm text-ink/65">Create your first backup profile or restore from an existing backup location.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3">
        <button className="primary-button justify-center" onClick={onCreate}>
          <FontAwesomeIcon icon={faBoxArchive} /> Create backup
        </button>
        <button className="secondary-button justify-center" onClick={onRestore}>
          <FontAwesomeIcon icon={faCloudArrowDown} /> Restore backup
        </button>
      </div>
    </section>
  );
}

function BackupList({
  profiles,
  backupStatus,
  versionCounts,
  globalSchedulePaused,
  expandedProfileId,
  onToggle,
  onEdit,
  onStart,
  onStop,
  onPause,
  onDelete
}: {
  profiles: BackupProfile[];
  backupStatus: BackupRunStatus;
  versionCounts: Record<string, BackupVersionCount>;
  globalSchedulePaused: boolean;
  expandedProfileId: string | null;
  onToggle: (profileId: string) => void;
  onEdit: (profile: BackupProfile) => void;
  onStart: (profile: BackupProfile) => void;
  onStop: (profile: BackupProfile) => void;
  onPause: (profile: BackupProfile, schedulePaused: boolean) => void;
  onDelete: (profile: BackupProfile) => void;
}) {
  return (
    <section className="backup-list">
      {profiles.map((rawProfile) => {
        const profile = normalizeProfile(rawProfile);
        const expanded = expandedProfileId === profile.id;
        const profileHasStatus = backupStatus.profileIds.includes(profile.id);
        const isProfileRunning = backupStatus.running && profileHasStatus;
        const isProfileWaiting = profileHasStatus && isBackupWaitingForNetwork(backupStatus);
        const isProfileActive = isProfileRunning || isProfileWaiting;
        const backupError = profileHasStatus ? backupStatus.errorDetails : null;
        const isProfileSchedulePaused = profile.schedule.mode === "recurring" && Boolean(profile.schedulePaused);
        const isSchedulePaused = profile.schedule.mode === "recurring" && (globalSchedulePaused || Boolean(profile.schedulePaused));
        const reviewRequired = Boolean(profile.reviewRequired);
        const versionCount: BackupVersionCount = reviewRequired ? { status: "pending" } : versionCounts[profile.id] ?? { status: "loading" };
        const statusLabel = isProfileRunning
          ? "Running"
          : backupError
            ? "Failed"
          : isProfileWaiting
            ? "Waiting for network"
          : reviewRequired
            ? "Review required"
          : backupStatus.running
            ? "Another backup is running"
            : globalSchedulePaused && profile.schedule.mode === "recurring"
              ? "Schedule paused globally"
              : isProfileSchedulePaused
                ? "Schedule paused"
                : "Idle";
        const pauseLabel = profile.schedulePaused ? "Resume schedule" : "Pause schedule";
        const frequencyLabel = isSchedulePaused ? `${formatSchedule(profile.schedule)} (paused)` : formatSchedule(profile.schedule);

        return (
          <article key={profile.id} className={`backup-card ${isProfileActive ? "running" : ""}`}>
            <BackupProgressLine status={backupStatus} active={isProfileActive} />
            <div className="backup-card-main">
              <button className="backup-card-summary" aria-expanded={expanded} onClick={() => onToggle(profile.id)}>
                <FontAwesomeIcon className="backup-expand-icon" icon={expanded ? faChevronDown : faChevronRight} />
                <span className="min-w-0">
                  <span className="backup-card-name">{profile.name}</span>
                  <span className="backup-card-next">{reviewRequired ? "Review this backup before running it" : `Next run: ${formatNextRun(profile, globalSchedulePaused)}`}</span>
                </span>
              </button>
              <div className="backup-card-actions">
                <BackupVersionIndicator versionCount={versionCount} />
                <button className="icon-button small tooltip-button danger-icon" aria-label={`Stop ${profile.name}`} data-tooltip={isProfileWaiting ? "Cancel retry" : "Stop backup"} disabled={!isProfileActive} onClick={() => onStop(profile)}>
                  <FontAwesomeIcon icon={faStop} />
                </button>
                <button className="icon-button small tooltip-button" aria-label={`Edit ${profile.name}`} data-tooltip="Edit backup" onClick={() => onEdit(profile)}>
                  <FontAwesomeIcon icon={faPen} />
                </button>
                <button className={`icon-button small tooltip-button ${profile.schedulePaused ? "active" : ""}`} aria-label={`${pauseLabel} for ${profile.name}`} aria-pressed={Boolean(profile.schedulePaused)} data-tooltip={reviewRequired ? "Review backup first" : pauseLabel} disabled={reviewRequired} onClick={() => onPause(profile, !profile.schedulePaused)}>
                  <FontAwesomeIcon icon={profile.schedulePaused ? faPlay : faPause} />
                </button>
                <button className="icon-button small tooltip-button" aria-label={`Run ${profile.name}`} data-tooltip={reviewRequired ? "Review backup first" : "Run backup"} disabled={isProfileActive || reviewRequired} onClick={() => onStart(profile)}>
                  <FontAwesomeIcon icon={faRepeat} />
                </button>
              </div>
            </div>

            {expanded ? (
              <div className="backup-card-details">
                <BackupDetailList
                  items={[
                    [faRotateRight, "Status", statusLabel],
                    [faCalendarDays, "Frequency", frequencyLabel],
                    [faFolderOpen, "Location", formatRepositoryLocation(profile.repository)],
                    [faListCheck, "Sources", `${profile.sources.length} selected`],
                    [faCalendarDays, "Retention", formatRetention(profile.retention)]
                  ]}
                />
                <BackupProgress status={backupStatus} isProfileRunning={profileHasStatus} />
                {backupError ? <BackupErrorDetails details={backupError} /> : null}
                {reviewRequired ? <BackupReviewNotice /> : null}
                <div className="backup-detail-actions">
                  <button className="danger-button justify-center" disabled={isProfileRunning} onClick={() => onDelete(profile)}>
                    <FontAwesomeIcon icon={faTrashCan} /> Delete
                  </button>
                  <button className="danger-button justify-center" disabled={!isProfileActive} onClick={() => onStop(profile)}>
                    <FontAwesomeIcon icon={faStop} /> {isProfileWaiting ? "Cancel retry" : "Stop"}
                  </button>
                  <button className="secondary-button justify-center" onClick={() => onEdit(profile)}>
                    <FontAwesomeIcon icon={faPen} /> Edit
                  </button>
                  <button className="secondary-button justify-center" disabled={reviewRequired} onClick={() => onPause(profile, !profile.schedulePaused)}>
                    <FontAwesomeIcon icon={profile.schedulePaused ? faPlay : faPause} /> {profile.schedulePaused ? "Resume" : "Pause"}
                  </button>
                  <button className="primary-button justify-center" disabled={isProfileActive || reviewRequired} onClick={() => onStart(profile)}>
                    <FontAwesomeIcon icon={faRepeat} /> Run
                  </button>
                </div>
              </div>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}

function BackupVersionIndicator({ versionCount }: { versionCount: BackupVersionCount }) {
  const label = versionCount.status === "ready"
    ? `${versionCount.count ?? 0} ${(versionCount.count ?? 0) === 1 ? "version" : "versions"}`
    : versionCount.status === "pending"
      ? "Review first"
    : versionCount.status === "error"
      ? "Versions unavailable"
      : "Counting...";

  return (
    <div className={`backup-version-indicator ${versionCount.status}`}>
      <span>{label}</span>
    </div>
  );
}

function BackupDetailList({ items }: { items: [IconDefinition, string, string][] }) {
  return (
    <dl className="backup-detail-list">
      {items.map(([icon, label, value]) => (
        <div key={label} className="backup-detail-row">
          <dt>
            <FontAwesomeIcon className="backup-detail-icon" icon={icon} />
            <span>{label}</span>
          </dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function BackupProgressLine({ status, active }: { status: BackupRunStatus; active: boolean }) {
  const percent = typeof status.percentComplete === "number" ? Math.max(0, Math.min(status.percentComplete, 100)) : null;
  return (
    <div className="backup-card-progress" aria-hidden={!active}>
      <div className={`backup-card-progress-fill ${active && percent === null ? "indeterminate" : ""}`} style={{ width: `${active ? percent ?? 0 : 0}%` }} />
    </div>
  );
}

function BackupProgress({ status, isProfileRunning }: { status: BackupRunStatus; isProfileRunning: boolean }) {
  const percent = status.running && typeof status.percentComplete === "number" ? Math.max(0, Math.min(status.percentComplete, 100)) : null;
  const isRelevant = isProfileRunning || (status.running && status.profileIds.length === 0);
  const hasProfileMessage = !status.running && isProfileRunning && status.progressLabel !== "No backup is running.";
  const isWaiting = isBackupWaitingForNetwork(status);
  const percentLabel = isWaiting ? "Waiting" : !status.running ? "No backup running" : percent === null ? "Unknown" : `${Math.round(percent)}%`;
  const percentLabelClass = `backup-progress-value ${status.running ? "running" : "idle"}`;
  const showDetails = status.running && isRelevant;
  const totalSizeLabel = showDetails && typeof status.totalBytes === "number" && status.totalBytes > 0
    ? formatBytes(status.totalBytes)
    : null;
  const timeRemainingLabel = showDetails && typeof status.estimatedSecondsRemaining === "number" && status.estimatedSecondsRemaining > 0
    ? formatDuration(status.estimatedSecondsRemaining)
    : null;
  const label = hasProfileMessage
    ? status.progressLabel
    : !status.running
      ? "No backup running"
    : isRelevant
      ? status.progressLabel
      : "A different backup is running.";

  return (
    <div className="backup-detail-row backup-progress-section">
      <dt>
        <FontAwesomeIcon className={`backup-detail-icon ${status.running ? "animate-spin" : ""}`} icon={faRotateRight} />
        <span>Progress</span>
      </dt>
      <dd>
        <div className="backup-progress-heading">
          <span>Backup progress</span>
          <span className={percentLabelClass}>{percentLabel}</span>
        </div>
        <div className="progress-track" aria-label="Backup progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} role="progressbar">
          <div className={`progress-fill ${status.running && percent === null ? "indeterminate" : ""}`} style={{ width: `${percent ?? 0}%` }} />
        </div>
        {(totalSizeLabel || timeRemainingLabel) ? (
          <div className="backup-progress-metadata">
            {totalSizeLabel ? (
              <span>
                <strong>Total size</strong>
                {totalSizeLabel}
              </span>
            ) : null}
            {timeRemainingLabel ? (
              <span>
                <strong>Time remaining</strong>
                {timeRemainingLabel}
              </span>
            ) : null}
          </div>
        ) : null}
        <p className="backup-progress-label">{label}</p>
      </dd>
    </div>
  );
}

function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.max(0, bytes);
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function formatDuration(seconds: number) {
  const roundedSeconds = Math.max(1, Math.round(seconds));
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const remainingSeconds = roundedSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `About ${hours} hr ${minutes} min` : `About ${hours} hr`;
  }
  if (minutes > 0) {
    return remainingSeconds >= 30 ? `About ${minutes + 1} min` : `About ${minutes} min`;
  }
  return `About ${remainingSeconds} sec`;
}

function BackupErrorDetails({ details }: { details: NonNullable<BackupRunStatus["errorDetails"]> }) {
  return (
    <section className="backup-error-details">
      <div>
        <p className="backup-error-eyebrow">What happened</p>
        <h3>{details.title}</h3>
      </div>
      <p>{details.message}</p>
      {details.occurredAt ? <time dateTime={details.occurredAt}>{new Date(details.occurredAt).toLocaleString()}</time> : null}
    </section>
  );
}

function BackupReviewNotice() {
  return (
    <section className="backup-review-notice">
      <p className="backup-error-eyebrow">Review required</p>
      <h3>Confirm this backup before running it</h3>
      <p>This backup was restored from a config file and has been paused. Edit and save it after checking the source folders, backup location, schedule, and retention settings.</p>
    </section>
  );
}

function isBackupWaitingForNetwork(status: BackupRunStatus) {
  return !status.running && /^Waiting for network location/i.test(status.progressLabel);
}

function formatNextRun(_profile: BackupProfile, globalSchedulePaused = false) {
  const profile = normalizeProfile(_profile);
  if (profile.schedule.mode === "manual") return "On demand";
  if (globalSchedulePaused) return "Paused globally";
  if (profile.schedulePaused) return "Paused";

  const nextRun = getNextRunDate(profile.createdAt, profile.schedule);
  if (!nextRun) return formatSchedule(profile.schedule);
  return `${nextRun.toLocaleDateString()} ${nextRun.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function formatSchedule(schedule: BackupSchedule) {
  if (schedule.mode === "manual") return "On demand";
  const cadence = schedule.unit === "weeks" && schedule.every === 1 && isValidWeekday(schedule.dayOfWeek)
    ? `Every week on ${weekdayOptions[schedule.dayOfWeek]}`
    : schedule.every === 1
      ? `Every ${schedule.unit.replace(/s$/, "")}`
      : `Every ${schedule.every} ${schedule.unit}`;
  const startLabel = scheduleStartLabel(schedule.startAt);
  return startLabel ? `${cadence}, starting ${startLabel}` : cadence;
}

function getNextRunDate(createdAt: string, schedule: BackupSchedule) {
  const start = getScheduleStartDate(createdAt, schedule);
  if (!start) return null;
  const now = new Date();
  const next = new Date(start);
  const fixedIntervalMs = scheduleFixedIntervalMs(schedule);
  if (fixedIntervalMs && next <= now) {
    const intervalsElapsed = Math.floor((now.getTime() - next.getTime()) / fixedIntervalMs) + 1;
    next.setTime(next.getTime() + intervalsElapsed * fixedIntervalMs);
    return next;
  }

  let guard = 0;
  while (next <= now && guard < 10000) {
    addScheduleInterval(next, schedule);
    guard += 1;
  }
  return next;
}

function isScheduledBackupDue(profile: BackupProfile, now = new Date()) {
  if (profile.schedule.mode !== "recurring" || profile.schedulePaused || profile.reviewRequired) return false;
  const dueRun = getLatestDueRunDate(profile.createdAt, profile.schedule, now);
  if (!dueRun) return false;
  const lastStarted = parseStoredDate(profile.lastBackupStartedAt);
  return !lastStarted || lastStarted.getTime() < dueRun.getTime();
}

function getLatestDueRunDate(createdAt: string, schedule: BackupSchedule, now = new Date()) {
  const start = getScheduleStartDate(createdAt, schedule);
  if (!start || start > now) return null;

  const fixedIntervalMs = scheduleFixedIntervalMs(schedule);
  if (fixedIntervalMs) {
    const intervalsElapsed = Math.floor((now.getTime() - start.getTime()) / fixedIntervalMs);
    return new Date(start.getTime() + intervalsElapsed * fixedIntervalMs);
  }

  let due = new Date(start);
  let next = new Date(start);
  let guard = 0;
  while (next <= now && guard < 10000) {
    due = new Date(next);
    addScheduleInterval(next, schedule);
    guard += 1;
  }
  return due;
}

function scheduleFixedIntervalMs(schedule: BackupSchedule) {
  const every = Math.max(1, schedule.every);
  if (schedule.unit === "minutes") return every * 60 * 1000;
  if (schedule.unit === "hours") return every * 60 * 60 * 1000;
  return null;
}

function getScheduleStartDate(createdAt: string, schedule: BackupSchedule) {
  const start = new Date(schedule.startAt ?? createdAt);
  if (Number.isNaN(start.getTime())) return null;
  if (schedule.unit !== "weeks" || !isValidWeekday(schedule.dayOfWeek)) return start;

  const weeklyStart = new Date(start);
  weeklyStart.setDate(weeklyStart.getDate() + ((schedule.dayOfWeek - weeklyStart.getDay() + 7) % 7));
  return weeklyStart;
}

function addScheduleInterval(date: Date, schedule: BackupSchedule) {
  const every = Math.max(1, schedule.every);
  if (schedule.unit === "minutes") date.setMinutes(date.getMinutes() + every);
  if (schedule.unit === "hours") date.setHours(date.getHours() + every);
  if (schedule.unit === "days") date.setDate(date.getDate() + every);
  if (schedule.unit === "weeks") date.setDate(date.getDate() + every * 7);
  if (schedule.unit === "months") date.setMonth(date.getMonth() + every);
  if (schedule.unit === "years") date.setFullYear(date.getFullYear() + every);
}

function parseStoredDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatRetention(retention: RetentionPolicy) {
  if (retention.mode === "unlimited") return "Keep all backups while storage is available.";
  if (retention.mode === "years") return `Keep backups for ${retention.years} ${retention.years === 1 ? "year" : "years"}.`;
  const activeCounts = retentionCountOptions
    .map((option) => ({
      count: retentionBucketCount(retention, option.key, option.key === "latest" ? retention.snapshots : 0),
      label: option.label.toLowerCase()
    }))
    .filter((option) => option.count > 0);
  if (activeCounts.length === 0) return "Keep no fixed backup counts.";
  return `Keep ${activeCounts.map((option) => `${option.count} ${option.label} ${option.count === 1 ? "backup" : "backups"}`).join(", ")}.`;
}

function schedulePresetFromSchedule(schedule: BackupSchedule): SchedulePreset {
  if (schedule.mode === "manual") return "on-demand";
  if (schedule.every === 30 && schedule.unit === "minutes") return "half-hour";
  if (schedule.every === 1 && schedule.unit === "hours") return "one-hour";
  if (schedule.every === 6 && schedule.unit === "hours") return "six-hours";
  if (schedule.every === 12 && schedule.unit === "hours") return "twelve-hours";
  if (schedule.every === 1 && schedule.unit === "days") return "one-day";
  if (schedule.every === 1 && schedule.unit === "weeks") return "one-week";
  return "custom";
}

function scheduleFromPreset(preset: SchedulePreset, current: BackupSchedule): BackupSchedule {
  const startAt = current.startAt ?? new Date().toISOString();
  if (preset === "on-demand") return { ...current, mode: "manual" };
  if (preset === "half-hour") return { mode: "recurring", every: 30, unit: "minutes", startAt };
  if (preset === "one-hour") return { mode: "recurring", every: 1, unit: "hours", startAt };
  if (preset === "six-hours") return { mode: "recurring", every: 6, unit: "hours", startAt };
  if (preset === "twelve-hours") return { mode: "recurring", every: 12, unit: "hours", startAt };
  if (preset === "one-day") return { mode: "recurring", every: 1, unit: "days", startAt };
  if (preset === "one-week") {
    return {
      mode: "recurring",
      every: 1,
      unit: "weeks",
      dayOfWeek: isValidWeekday(current.dayOfWeek) ? current.dayOfWeek : new Date(startAt).getDay(),
      startAt
    };
  }

  return {
    mode: "recurring",
    every: Math.max(1, Number(current.every || 1)),
    unit: current.unit === "weeks" ? "hours" : current.unit,
    startAt
  };
}

function scheduleStartInputValue(startAt: string | undefined) {
  const date = startAt ? new Date(startAt) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function dateTimeInputToIso(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function scheduleStartLabel(startAt: string | undefined) {
  if (!startAt) return "";
  const date = new Date(startAt);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function isValidWeekday(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 6;
}

function normalizeExcludePatterns(value: unknown) {
  const rawPatterns = Array.isArray(value)
    ? value
    : String(value ?? "").split(/\r?\n/);
  return rawPatterns
    .map((pattern) => String(pattern).trim())
    .filter((pattern) => pattern && pattern !== "*.");
}

function excludePatternsToText(value: unknown) {
  return normalizeExcludePatterns(value).join("\n");
}

function normalizeExcludeText(value: unknown) {
  return excludePatternsToText(value);
}

function normalizeProfile(profile: BackupProfile): BackupProfile {
  return {
    ...profile,
    excludes: normalizeExcludeText(profile.excludes),
    schedule: normalizeSchedule(profile.schedule),
    schedulePaused: Boolean(profile.schedulePaused),
    reviewRequired: Boolean(profile.reviewRequired),
    retention: normalizeRetention(profile.retention)
  };
}

function normalizeSchedule(schedule: BackupProfile["schedule"] | undefined): BackupSchedule {
  if (schedule?.mode === "manual" || schedule?.mode === "recurring") {
    const normalized: BackupSchedule = {
      mode: schedule.mode,
      every: Math.max(1, Number(schedule.every || 1)),
      unit: isScheduleUnit(schedule.unit) ? schedule.unit : "weeks"
    };
    const startAt = scheduleStartLabel(schedule.startAt) ? schedule.startAt : undefined;
    if (startAt) normalized.startAt = startAt;
    if (isValidWeekday(schedule.dayOfWeek)) normalized.dayOfWeek = schedule.dayOfWeek;
    return normalized;
  }
  return defaultSchedule;
}

function isScheduleUnit(unit: unknown): unit is BackupScheduleUnit {
  return unit === "minutes" || unit === "hours" || unit === "days" || unit === "weeks" || unit === "months" || unit === "years";
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : fallback;
}

function retentionBucketCount(retention: Partial<Record<RetentionBucket, number | string>>, key: RetentionBucket, fallback = 0) {
  const parsed = Number(retention[key] ?? fallback);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

function normalizeRetention(retention: BackupProfile["retention"] | Record<string, number | string> | undefined): RetentionPolicy {
  if (retention?.mode === "unlimited" || retention?.mode === "years" || retention?.mode === "snapshots") {
    const counts = retention as Partial<Record<RetentionBucket, number | string>> & { snapshots?: number | string };
    const latest = retentionBucketCount(counts, "latest", retentionBucketCount({ latest: counts.snapshots }, "latest", defaultRetention.latest));
    return {
      mode: retention.mode,
      years: positiveInteger(retention.years, defaultRetention.years),
      snapshots: latest,
      latest,
      hourly: retentionBucketCount(counts, "hourly", defaultRetention.hourly),
      daily: retentionBucketCount(counts, "daily", defaultRetention.daily),
      weekly: retentionBucketCount(counts, "weekly", defaultRetention.weekly),
      monthly: retentionBucketCount(counts, "monthly", defaultRetention.monthly),
      yearly: retentionBucketCount(counts, "yearly", defaultRetention.yearly)
    };
  }

  const legacy = retention as Record<string, number> | undefined;
  if (legacy && Number(legacy.yearly) > 0) {
    const latest = positiveInteger(legacy.last, defaultRetention.latest);
    return { ...defaultRetention, mode: "years", years: positiveInteger(legacy.yearly, defaultRetention.years), snapshots: latest, latest };
  }
  if (legacy && Number(legacy.last) > 0) {
    const latest = positiveInteger(legacy.last, defaultRetention.latest);
    return { ...defaultRetention, mode: "snapshots", years: 1, snapshots: latest, latest };
  }
  return defaultRetention;
}

function draftFromProfile(profile: BackupProfile | null, defaultExcludes = defaultExcludeText): DraftProfile {
  if (!profile) {
    return {
      ...emptyDraft,
      repository: { ...emptyDraft.repository },
      sources: [],
      excludes: normalizeExcludeText(defaultExcludes),
      schedule: { ...defaultSchedule },
      retention: { ...defaultRetention }
    };
  }
  const normalized = normalizeProfile(profile);
  const schedule = normalized.schedule.mode === "recurring"
    ? {
      ...normalized.schedule,
      startAt: normalized.schedule.startAt ?? normalized.createdAt,
      dayOfWeek: normalized.schedule.unit === "weeks" && normalized.schedule.every === 1
        ? normalized.schedule.dayOfWeek ?? new Date(normalized.schedule.startAt ?? normalized.createdAt).getDay()
        : normalized.schedule.dayOfWeek
    }
    : normalized.schedule;
  return {
    id: normalized.id,
    name: normalized.name,
    description: normalized.description,
    encryptionEnabled: true,
    currentPassword: "",
    password: "",
    passwordConfirm: "",
    repository: normalized.repository,
    sources: normalized.sources,
    excludes: normalized.excludes,
    schedule,
    schedulePaused: normalized.schedulePaused,
    retention: normalized.retention
  };
}

function locationOptionFromProfile(profile: BackupProfile | null): LocationOption {
  if (!profile) return "local";
  if (profile.repository.type === "rclone" && profile.repository.rcloneBackend) return `rclone:${profile.repository.rcloneBackend}`;
  if (profile.repository.type === "rclone") return "local";
  return profile.repository.type;
}

function BackupWizard({
  initialProfile,
  defaultExcludes,
  onCancel,
  onSave
}: {
  initialProfile: BackupProfile | null;
  defaultExcludes: string;
  onCancel: () => void;
  onSave: (profile: DraftProfile) => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<DraftProfile>(() => draftFromProfile(initialProfile, defaultExcludes));
  const [selectedSchedulePreset, setSelectedSchedulePreset] = useState<SchedulePreset>(() => schedulePresetFromSchedule(draftFromProfile(initialProfile, defaultExcludes).schedule));
  const [locationOption, setLocationOption] = useState<LocationOption>(() => locationOptionFromProfile(initialProfile));
  const [locationAnalysis, setLocationAnalysis] = useState<BackupLocationAnalysis | null>(null);
  const [rcloneBackend, setRcloneBackend] = useState<RcloneBackend>(() => initialProfile?.repository.rcloneBackend ?? "drive");
  const [rcloneRepositoryPath, setRcloneRepositoryPath] = useState(() => initialProfile?.repository.rclonePath ?? defaultRcloneRepositoryPath(initialProfile?.name ?? ""));
  const [rclonePathTouched, setRclonePathTouched] = useState(Boolean(initialProfile?.repository.rclonePath));
  const [rcloneBrowserOpen, setRcloneBrowserOpen] = useState(false);
  const [rcloneConfig, setRcloneConfig] = useState<Record<string, string>>({ provider: "AWS", region: "us-east-1", domain: "WORKGROUP" });
  const [rcloneSetup, setRcloneSetup] = useState<{ status: RcloneSetupStatus; message: string }>({ status: "idle", message: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const steps = ["Details", "Location", "Data", "Frequency", "Retention", "Review"];
  const selectedRcloneOption = rcloneBackendOptions.find((option) => option.value === rcloneBackend) ?? rcloneBackendOptions[0];
  const rcloneFields = rcloneConfigFields[rcloneBackend];
  const rcloneFieldsComplete = rcloneFields.every((field) => !field.required || rcloneConfig[field.key]?.trim());
  const editingBackup = Boolean(initialProfile?.id);
  const editingRcloneBackup = Boolean(editingBackup && initialProfile?.repository.type === "rclone");
  const restoringImportedBackup = Boolean(initialProfile?.reviewRequired);
  const passwordFieldsTouched = Boolean(draft.currentPassword || draft.password || draft.passwordConfirm);
  const newPasswordConfirmed = draft.password.length > 0 && draft.password === draft.passwordConfirm;
  const restoredPasswordConfirmed = draft.currentPassword.length > 0 && draft.currentPassword === draft.passwordConfirm;
  const passwordFormComplete = restoringImportedBackup
    ? restoredPasswordConfirmed
    : editingBackup
    ? !passwordFieldsTouched || (draft.currentPassword.length > 0 && newPasswordConfirmed)
    : newPasswordConfirmed;
  const passwordMessage = restoringImportedBackup
    ? !draft.currentPassword
      ? "Enter the backup password for this restored backup."
      : !draft.passwordConfirm
        ? "Confirm the backup password."
        : draft.currentPassword !== draft.passwordConfirm
          ? "Backup passwords do not match."
          : "Backup password is ready."
    : editingBackup
    ? passwordFieldsTouched
      ? !draft.currentPassword
        ? "Enter the current backup password before changing it."
        : !draft.password
          ? "Enter the new backup password."
          : !draft.passwordConfirm
            ? "Confirm the new backup password."
            : draft.password !== draft.passwordConfirm
              ? "New passwords do not match."
              : "Password change is ready."
      : "Leave these fields blank to keep the current backup password."
    : !draft.passwordConfirm
      ? "Confirm the backup password before continuing."
      : draft.password !== draft.passwordConfirm
        ? "Passwords do not match."
        : "Password confirmed.";
  const passwordMessageIsError = restoringImportedBackup
    ? Boolean(draft.passwordConfirm) && !passwordFormComplete
    : editingBackup
    ? passwordFieldsTouched && !passwordFormComplete
    : Boolean(draft.passwordConfirm) && !passwordFormComplete;
  const detailsComplete = draft.name.trim().length > 0 && passwordFormComplete;
  const rcloneAccountConnected = rcloneSetup.status === "success" || editingRcloneBackup;
  const rcloneReviewComplete = draft.repository.type !== "rclone" || rcloneAccountConnected;
  const locationComplete = draft.repository.target.trim().length > 0 && rcloneReviewComplete;
  const canContinue = useMemo(() => {
    if (step === 0) return detailsComplete;
    if (step === 1) return locationComplete;
    if (step === 2) return draft.sources.length > 0;
    return true;
  }, [detailsComplete, draft, locationComplete, step]);
  const stepRequirements = useMemo(() => [
    detailsComplete,
    locationComplete,
    draft.sources.length > 0,
    true,
    true
  ], [detailsComplete, draft, locationComplete]);
  const canSave = stepRequirements.every(Boolean);
  const weeklySchedule = draft.schedule.mode === "recurring" && draft.schedule.unit === "weeks" && draft.schedule.every === 1;
  const rcloneRemoteName = initialProfile?.repository.rcloneRemoteName ?? defaultRcloneRemoteName(draft.name);
  const suggestedRcloneFolderName = slugifyBackupName(draft.name);
  const highestSelectableStep = useMemo(() => {
    let highest = 0;
    for (let index = 0; index < steps.length - 1; index += 1) {
      if (!stepRequirements[index]) break;
      highest = index + 1;
    }
    return highest;
  }, [stepRequirements, steps.length]);

  useEffect(() => {
    if (rclonePathTouched) return;
    setRcloneRepositoryPath(defaultRcloneRepositoryPath(draft.name));
    setDraft((current) => current.repository.type === "rclone"
      ? { ...current, repository: { type: "rclone", target: "" } }
      : current);
  }, [draft.name, rclonePathTouched]);

  function selectLocation(nextLocation: LocationOption) {
    setLocationOption(nextLocation);
    setRcloneSetup({ status: "idle", message: "" });
    setRcloneBrowserOpen(false);
    setLocationAnalysis(null);
    if (nextLocation === "local" || nextLocation === "smb-folder") {
      setDraft((current) => ({ ...current, repository: { type: "local", target: "" } }));
      return;
    }
    if (nextLocation === "rest" || nextLocation === "sftp") {
      setDraft((current) => ({ ...current, repository: { type: nextLocation, target: "" } }));
      return;
    }

    const backend = nextLocation.replace("rclone:", "") as RcloneBackend;
    setRcloneBackend(backend);
    setDraft((current) => ({ ...current, repository: { type: "rclone", target: "" } }));
  }

  async function chooseRepositoryFolder() {
    const folder = await bridge.chooseDirectory();
    if (folder) await applyLocalBackupLocation(folder);
  }

  async function chooseSmbFolder() {
    const folder = await bridge.chooseDirectory();
    if (folder) await applyLocalBackupLocation(folder);
  }

  async function applyLocalBackupLocation(folder: string) {
    const analysis = await bridge.analyzeBackupLocation(folder);
    setLocationAnalysis(analysis);
    setDraft((current) => ({ ...current, repository: { type: "local", target: folder } }));
  }

  function updateRcloneConfig(key: string, value: string) {
    setRcloneConfig((current) => ({ ...current, [key]: value }));
    setRcloneSetup({ status: "idle", message: "" });
    setRcloneBrowserOpen(false);
    setDraft((current) => ({ ...current, repository: { type: "rclone", target: "" } }));
  }

  function applyRcloneRepositoryPath(pathName: string) {
    const normalizedPath = normalizeRemotePathInput(pathName);
    setRcloneRepositoryPath(pathName);
    setRclonePathTouched(true);
    setDraft((current) => ({
      ...current,
      repository: normalizedPath ? rcloneRepository(rcloneRemoteName, rcloneBackend, normalizedPath) : { type: "rclone", target: "" }
    }));
  }

  async function connectRcloneRepository(replaceRemote = false) {
    setRcloneSetup({
      status: "working",
      message: replaceRemote
        ? selectedRcloneOption.auth === "oauth"
          ? "Starting account authorization..."
          : "Updating backend account..."
        : selectedRcloneOption.auth === "oauth"
          ? "Starting browser authorization..."
          : "Connecting Rclone..."
    });
    try {
      const result = await bridge.connectRcloneAccount({
        backend: rcloneBackend,
        remoteName: rcloneRemoteName,
        config: rcloneConfig,
        replaceRemote
      });
      const normalizedPath = normalizeRemotePathInput(rcloneRepositoryPath);

      setDraft((current) => ({
        ...current,
        repository: normalizedPath ? rcloneRepository(result.remoteName, result.backend, normalizedPath) : { type: "rclone", target: "" }
      }));
      setRcloneRepositoryPath(normalizedPath || rcloneRepositoryPath);
      setRclonePathTouched(true);
      setRcloneSetup({ status: "success", message: result.message });
      setRcloneBrowserOpen(true);
    } catch (error) {
      setRcloneSetup({ status: "error", message: error instanceof Error ? error.message : "Unable to connect Rclone." });
    }
  }

  function goToStep(index: number) {
    if (index <= highestSelectableStep) setStep(index);
  }

  function updateSchedulePreset(preset: SchedulePreset) {
    setSelectedSchedulePreset(preset);
    setDraft((current) => ({
      ...current,
      schedule: scheduleFromPreset(preset, current.schedule)
    }));
  }

  function updateScheduleStart(startAt: string | undefined) {
    if (!startAt) return;
    setDraft((current) => ({
      ...current,
      schedule: { ...current.schedule, startAt }
    }));
  }

  function setScheduleStartToNow() {
    updateScheduleStart(new Date().toISOString());
  }

  function updateWeeklyDay(dayOfWeek: number) {
    setDraft((current) => ({
      ...current,
      schedule: { ...current.schedule, dayOfWeek }
    }));
  }

  function updateCustomSchedule(next: Partial<Pick<BackupSchedule, "every" | "unit">>) {
    setDraft((current) => ({
      ...current,
      schedule: {
        ...current.schedule,
        mode: "recurring",
        every: Math.max(1, Number(next.every ?? current.schedule.every ?? 1)),
        unit: next.unit ?? current.schedule.unit,
        startAt: current.schedule.startAt ?? new Date().toISOString()
      }
    }));
  }

  async function handleSaveDraft() {
    if (!canSave || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      await onSave(draft);
    } catch (error) {
      setSaving(false);
      setSaveError(error instanceof Error ? error.message : "Unable to save this backup.");
    }
  }

  return (
    <section className="rounded-md border border-ink/10 bg-white p-5 shadow-sm">
      {restoringImportedBackup ? (
        <section className="backup-review-notice mb-4">
          <p className="backup-error-eyebrow">Credentials required</p>
          <h3>Finish restoring {initialProfile?.name}</h3>
          <p>Enter the backup password, reconnect the backend account if needed, then save this backup before moving to the next restored backup.</p>
        </section>
      ) : null}
      <Stepper steps={steps} current={step} canSelect={(index) => index <= highestSelectableStep} onSelect={goToStep} />

      {step === 0 ? (
        <div className="wizard-grid">
          <Field label="Backup name">
            <input className="text-input" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Family photos" />
          </Field>
          <Field label="Description">
            <textarea className="text-input min-h-24" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="What this backup protects" />
          </Field>
          <p className="encryption-warning">
            <FontAwesomeIcon icon={faShieldHalved} />
            Restic backups are encrypted. Save this password safely; there is no recovery key if it is lost.
          </p>
          {restoringImportedBackup ? (
            <>
              <Field label="Backup password">
                <input
                  className="text-input"
                  type="password"
                  value={draft.currentPassword}
                  onChange={(event) => {
                    setSaveError("");
                    setDraft({ ...draft, encryptionEnabled: true, currentPassword: event.target.value, password: "" });
                  }}
                  placeholder="Required to open this backup"
                />
              </Field>
              <Field label="Confirm backup password">
                <input
                  className="text-input"
                  type="password"
                  value={draft.passwordConfirm}
                  onChange={(event) => {
                    setSaveError("");
                    setDraft({ ...draft, encryptionEnabled: true, passwordConfirm: event.target.value, password: "" });
                  }}
                  placeholder="Repeat backup password"
                />
              </Field>
            </>
          ) : editingBackup ? (
            <>
              <Field label="Current backup password">
                <input
                  className="text-input"
                  type="password"
                  value={draft.currentPassword}
                  onChange={(event) => {
                    setSaveError("");
                    setDraft({ ...draft, encryptionEnabled: true, currentPassword: event.target.value });
                  }}
                  placeholder="Required to change password"
                />
              </Field>
              <Field label="New backup password">
                <input
                  className="text-input"
                  type="password"
                  value={draft.password}
                  onChange={(event) => {
                    setSaveError("");
                    setDraft({ ...draft, encryptionEnabled: true, password: event.target.value });
                  }}
                  placeholder="Leave blank to keep current password"
                />
              </Field>
              <Field label="Confirm new password">
                <input
                  className="text-input"
                  type="password"
                  value={draft.passwordConfirm}
                  onChange={(event) => {
                    setSaveError("");
                    setDraft({ ...draft, encryptionEnabled: true, passwordConfirm: event.target.value });
                  }}
                  placeholder="Repeat new password"
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Backup password">
                <input
                  className="text-input"
                  type="password"
                  value={draft.password}
                  onChange={(event) => {
                    setSaveError("");
                    setDraft({ ...draft, encryptionEnabled: true, password: event.target.value });
                  }}
                  placeholder="Required by restic"
                />
              </Field>
              <Field label="Confirm backup password">
                <input
                  className="text-input"
                  type="password"
                  value={draft.passwordConfirm}
                  onChange={(event) => {
                    setSaveError("");
                    setDraft({ ...draft, encryptionEnabled: true, passwordConfirm: event.target.value });
                  }}
                  placeholder="Repeat backup password"
                />
              </Field>
            </>
          )}
          <p className={`setup-status ${passwordMessageIsError ? "error" : ""}`}>{passwordMessage}</p>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="wizard-grid">
          <Field label="Backup location">
            <select className="text-input" value={locationOption} onChange={(event) => selectLocation(event.target.value as LocationOption)}>
              {locationOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
          {locationOption === "local" ? (
            <button className="secondary-button justify-center" onClick={chooseRepositoryFolder}>
              <FontAwesomeIcon icon={faFolderOpen} /> Choose backup folder
            </button>
          ) : locationOption === "smb-folder" ? (
            <button className="secondary-button justify-center" onClick={chooseSmbFolder}>
              <FontAwesomeIcon icon={faFolderOpen} /> Choose SMB backup folder
            </button>
          ) : draft.repository.type === "rclone" ? (
            <>
              <div className="grid gap-3">
                <Field label={selectedRcloneOption.pathLabel}>
                  <div className="input-with-action">
                    <input
                      className="text-input"
                      value={rcloneRepositoryPath}
                      onChange={(event) => {
                        applyRcloneRepositoryPath(event.target.value);
                      }}
                      placeholder={defaultRcloneRepositoryPath(draft.name)}
                    />
                    <button
                      aria-label="Choose remote folder"
                      className="icon-button tooltip-button input-action-button"
                      data-tooltip="Choose Remote Folder"
                      type="button"
                      disabled={!rcloneAccountConnected}
                      onClick={() => setRcloneBrowserOpen(true)}
                    >
                      <FontAwesomeIcon icon={faFolderOpen} />
                    </button>
                  </div>
                </Field>
              </div>
              {rcloneBrowserOpen ? (
                <RcloneFolderBrowser
                  remoteName={rcloneRemoteName}
                  suggestedFolderName={suggestedRcloneFolderName}
                  onSelect={(pathName) => {
                    applyRcloneRepositoryPath(pathName);
                  }}
                />
              ) : null}
              {rcloneFields.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {rcloneFields.map((field) => (
                    <Field key={field.key} label={field.label}>
                      <input
                        className="text-input"
                        type={field.type ?? "text"}
                        value={rcloneConfig[field.key] ?? ""}
                        onChange={(event) => updateRcloneConfig(field.key, event.target.value)}
                        placeholder={field.placeholder}
                      />
                    </Field>
                  ))}
                </div>
              ) : null}
              {rcloneBackend === "smb" ? (
                <button className="small-button w-fit" onClick={chooseSmbFolder}>
                  <FontAwesomeIcon icon={faFolderOpen} /> Choose with File Explorer
                </button>
              ) : null}
              {restoringImportedBackup && rcloneSetup.status !== "success" ? (
                <p className="setup-status">Reconnect this backend account before continuing.</p>
              ) : null}
              {editingRcloneBackup ? (
                <button
                  className="secondary-button justify-center"
                  disabled={rcloneSetup.status === "working" || !rcloneFieldsComplete}
                  onClick={() => connectRcloneRepository(true)}
                >
                  <FontAwesomeIcon className={rcloneSetup.status === "working" ? "animate-spin" : ""} icon={rcloneSetup.status === "working" ? faRotateRight : faKey} />
                  Change backend account
                </button>
              ) : (
                <button
                  className="secondary-button justify-center"
                  disabled={rcloneSetup.status === "working" || !rcloneFieldsComplete}
                  onClick={() => connectRcloneRepository(false)}
                >
                  <FontAwesomeIcon className={rcloneSetup.status === "working" ? "animate-spin" : ""} icon={rcloneSetup.status === "working" ? faRotateRight : faKey} />
                  {rcloneSetup.status === "working" ? "Connecting account" : "Connect account"}
                </button>
              )}
              {rcloneSetup.message ? <p className={`setup-status ${rcloneSetup.status}`}>{rcloneSetup.message}</p> : null}
            </>
          ) : (
            <Field label="Backup target">
              <input
                className="text-input"
                value={draft.repository.target}
                onChange={(event) => {
                  setLocationAnalysis(null);
                  setDraft({ ...draft, repository: { ...draft.repository, target: event.target.value } });
                }}
                placeholder={draft.repository.type === "rest" ? "rest:https://host/backup" : "sftp:user@host:/backups/reststop"}
              />
            </Field>
          )}
          {draft.repository.target ? <p className="path-pill">{formatRepositoryLocation(draft.repository)}</p> : null}
          {draft.repository.type === "local" && locationAnalysis ? <LocationAnalysisPanel analysis={locationAnalysis} /> : null}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="wizard-grid">
          <FileBrowser selected={draft.sources} onChange={(sources) => setDraft({ ...draft, sources })} />
          <SelectedPaths paths={draft.sources} onRemove={(path) => setDraft({ ...draft, sources: draft.sources.filter((item) => item !== path) })} />
          <ExclusionFilterEditor label="Exclude files and folders" value={draft.excludes} onChange={(excludes) => setDraft({ ...draft, excludes })} />
        </div>
      ) : null}

      {step === 3 ? (
        <div className="wizard-grid">
          <Field label="Frequency">
            <select className="text-input" value={selectedSchedulePreset} onChange={(event) => updateSchedulePreset(event.target.value as SchedulePreset)}>
              {schedulePresetOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
          {draft.schedule.mode === "recurring" ? (
            <>
              {selectedSchedulePreset === "custom" ? (
                <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                  <Field label="Every">
                    <input
                      className="text-input"
                      min={1}
                      type="number"
                      value={draft.schedule.every}
                      onChange={(event) => updateCustomSchedule({ every: Number(event.target.value) })}
                    />
                  </Field>
                  <Field label="Unit">
                    <select className="text-input" value={draft.schedule.unit === "weeks" ? "days" : draft.schedule.unit} onChange={(event) => updateCustomSchedule({ unit: event.target.value as BackupScheduleUnit })}>
                      {customScheduleUnits.map((unit) => <option key={unit} value={unit}>{unit[0].toUpperCase() + unit.slice(1)}</option>)}
                    </select>
                  </Field>
                </div>
              ) : null}
              {weeklySchedule ? (
                <Field label="Day of week">
                  <select className="text-input" value={draft.schedule.dayOfWeek ?? new Date(draft.schedule.startAt ?? Date.now()).getDay()} onChange={(event) => updateWeeklyDay(Number(event.target.value))}>
                    {weekdayOptions.map((day, index) => <option key={day} value={index}>{day}</option>)}
                  </select>
                </Field>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <Field label="Starting date">
                  <input
                    className="text-input"
                    type="datetime-local"
                    value={scheduleStartInputValue(draft.schedule.startAt)}
                    onChange={(event) => updateScheduleStart(dateTimeInputToIso(event.target.value))}
                  />
                </Field>
                <button className="secondary-button justify-center" type="button" onClick={setScheduleStartToNow}>Now</button>
              </div>
            </>
          ) : null}
          <div className="frequency-summary">
            {formatSchedule(draft.schedule)}
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="wizard-grid">
          <Field label="Retention">
            <select
              className="text-input"
              value={draft.retention.mode}
              onChange={(event) => setDraft({ ...draft, retention: { ...draft.retention, mode: event.target.value as RetentionPolicy["mode"] } })}
            >
              <option value="unlimited">Keep all backups while storage is available</option>
              <option value="years">Keep backups for a number of years</option>
              <option value="snapshots">Keep a fixed number of recent backups</option>
            </select>
          </Field>
          {draft.retention.mode === "years" ? (
            <Field label="Years to keep">
              <input
                className="text-input"
                min={1}
                type="number"
                value={draft.retention.years}
                onChange={(event) => setDraft({ ...draft, retention: { ...draft.retention, years: Number(event.target.value) } })}
              />
            </Field>
          ) : null}
          {draft.retention.mode === "snapshots" ? (
            <div className="grid gap-2">
              <span className="text-sm font-semibold text-ink/75">Backups to keep</span>
              <div className="retention-count-list" role="group" aria-label="Fixed backups to keep">
                {retentionCountOptions.map((option) => (
                  <label className="retention-count-row" key={option.key}>
                    <input
                      aria-label={`${option.label} backups to keep`}
                      className="text-input"
                      min={0}
                      type="number"
                      value={draft.retention[option.key]}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setDraft({
                          ...draft,
                          retention: {
                            ...draft.retention,
                            [option.key]: value,
                            ...(option.key === "latest" ? { snapshots: value } : {})
                          }
                        });
                      }}
                    />
                    <span>{option.label.toLowerCase()} backups</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          <p className="setup-status">{formatRetention(draft.retention)}</p>
          {draft.retention.mode === "unlimited" ? (
            <p className="setup-status">Unlimited retention can use all available storage in the backup location.</p>
          ) : null}
        </div>
      ) : null}

      {step === 5 ? <BackupReview draft={draft} /> : null}
      {saveError ? <p className="setup-status error mt-4">{saveError}</p> : null}

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button className="secondary-button justify-center" disabled={saving} onClick={step === 0 ? onCancel : () => setStep(step - 1)}>
          <FontAwesomeIcon icon={faArrowLeft} /> {step === 0 ? "Cancel" : "Back"}
        </button>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          {editingBackup && step < steps.length - 1 ? (
            <button className="primary-button justify-center" disabled={!canSave || saving} onClick={handleSaveDraft}>
              <FontAwesomeIcon icon={faCheck} /> {saving ? "Saving..." : "Save changes"}
            </button>
          ) : null}
          {step < steps.length - 1 ? (
            <button className="secondary-button justify-center" disabled={!canContinue || saving} onClick={() => setStep(step + 1)}>
              Continue <FontAwesomeIcon icon={faArrowRight} />
            </button>
          ) : (
            <button className="primary-button justify-center" disabled={!canSave || saving} onClick={handleSaveDraft}>
              <FontAwesomeIcon icon={faCheck} /> {saving ? "Saving..." : editingBackup ? "Save changes" : "Save backup"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function RcloneFolderBrowser({
  remoteName,
  suggestedFolderName,
  onSelect
}: {
  remoteName: string;
  suggestedFolderName: string;
  onSelect: (pathName: string) => void;
}) {
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadDirectory();
  }, [remoteName]);

  async function loadDirectory(pathName = "") {
    if (!remoteName.trim()) {
      setError("Enter a Rclone remote name.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      setListing(await bridge.listRcloneDirectory({ remoteName, path: pathName }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to open this remote folder.");
    } finally {
      setLoading(false);
    }
  }

  async function createSuggestedFolder() {
    if (!listing) return;
    const folderPath = joinRemotePath(listing.path, suggestedFolderName);
    setLoading(true);
    setError("");
    try {
      const nextListing = await bridge.createRcloneDirectory({ remoteName, path: folderPath });
      setListing(nextListing);
      onSelect(nextListing.path);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create this remote folder.");
    } finally {
      setLoading(false);
    }
  }

  if (!listing) {
    return (
      <div className="grid gap-2">
        {loading ? <p className="setup-status"><FontAwesomeIcon className="animate-spin" icon={faRotateRight} /> Loading remote folders...</p> : null}
        {error ? <p className="setup-status error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="rclone-browser rounded-md border border-ink/10">
      <div className="flex flex-col gap-3 border-b border-ink/10 p-3 md:flex-row md:items-center md:justify-between">
        <p className="path-pill min-w-0 flex-1">{listing.path ? `/${listing.path}` : "Remote root"}</p>
        <div className="flex flex-wrap gap-2">
          <button className="small-button" disabled={loading} onClick={() => loadDirectory()}>
            <FontAwesomeIcon icon={faHouse} /> Root
          </button>
          <button className="small-button" disabled={loading || listing.parent === null} onClick={() => loadDirectory(listing.parent ?? "")}>
            <FontAwesomeIcon icon={faArrowUp} /> Up
          </button>
          <button className="small-button" disabled={loading || !listing.path} onClick={() => onSelect(listing.path)}>
            <FontAwesomeIcon icon={faCheck} /> Use this folder
          </button>
          <button className="small-button" disabled={loading} onClick={createSuggestedFolder}>
            <FontAwesomeIcon icon={faPlus} /> Create {suggestedFolderName}
          </button>
        </div>
      </div>

      {error ? <p className="m-3 rounded-md bg-coral/15 p-3 text-sm font-semibold text-ink">{error}</p> : null}
      <ul className="stable-scroll max-h-52 overflow-auto p-2">
        {listing.entries.map((entry) => (
          <li key={entry.path} className="grid grid-cols-[34px_1fr] items-center gap-2 rounded-md px-2 py-1.5 hover:bg-skyglass/65">
            <FontAwesomeIcon className="text-pine" icon={faFolderOpen} />
            <button className="break-all text-left text-sm font-semibold" disabled={loading} onClick={() => loadDirectory(entry.path)}>{entry.name}</button>
          </li>
        ))}
        {listing.entries.length === 0 ? (
          <li className="px-2 py-6 text-center text-sm font-semibold text-ink/55">No folders here.</li>
        ) : null}
      </ul>
    </div>
  );
}

function LocationAnalysisPanel({ analysis }: { analysis: BackupLocationAnalysis }) {
  const statusClass = analysis?.reachable && analysis.writable ? "success" : analysis ? "error" : "";

  return (
    <div className="fault-panel">
      <div>
        <p className="settings-label">Location check</p>
        <p className={`setup-status ${statusClass}`}>{analysis.message}</p>
      </div>
    </div>
  );
}

function RestoreFlow({
  profiles,
  onCancel,
  onStartRestore
}: {
  profiles: BackupProfile[];
  onCancel: () => void;
  onStartRestore: (options: RestoreStartOptions, details: { source: string; destination: string; fileCount: number }) => void;
}) {
  const [step, setStep] = useState(0);
  const [selectedProfileId, setSelectedProfileId] = useState(profiles[0]?.id ?? "external");
  const [externalLocation, setExternalLocation] = useState<LocationOption>("local");
  const [externalTarget, setExternalTarget] = useState("");
  const [externalRcloneBackend, setExternalRcloneBackend] = useState<RcloneBackend>("drive");
  const [externalRclonePath, setExternalRclonePath] = useState("");
  const [externalRcloneBrowserOpen, setExternalRcloneBrowserOpen] = useState(false);
  const [externalRcloneConfig, setExternalRcloneConfig] = useState<Record<string, string>>({ provider: "AWS", region: "us-east-1", domain: "WORKGROUP" });
  const [externalRcloneSetup, setExternalRcloneSetup] = useState<{ status: RcloneSetupStatus; message: string }>({ status: "idle", message: "" });
  const [repositoryPassword, setRepositoryPassword] = useState("");
  const [snapshots, setSnapshots] = useState<ResticSnapshot[]>([]);
  const [snapshotId, setSnapshotId] = useState("");
  const [restoreTarget, setRestoreTarget] = useState("");
  const [paths, setPaths] = useState<string[]>([]);
  const [overwrite, setOverwrite] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [restoreMessage, setRestoreMessage] = useState("");
  const steps = ["Backup", "Date", "Files", "Location", "Review"];
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);
  const externalRcloneRemoteName = `reststop-restore-${externalRcloneBackend}`;
  const externalRepository = externalLocation.startsWith("rclone:") && externalRclonePath.trim()
    ? rcloneRepository(externalRcloneRemoteName, externalRcloneBackend, externalRclonePath)
    : externalTarget.trim()
      ? repositoryFromLocation(externalLocation, externalTarget.trim())
      : null;
  const selectedRepository = selectedProfile?.repository ?? externalRepository;
  const selectedSnapshot = snapshots.find((snapshot) => snapshot.id === snapshotId);
  const sourceName = selectedProfile?.name ?? (selectedRepository ? formatRepositoryLocation(selectedRepository) : "Existing backup location");
  const selectedRcloneOption = rcloneBackendOptions.find((option) => option.value === externalRcloneBackend) ?? rcloneBackendOptions[0];
  const externalRcloneFields = rcloneConfigFields[externalRcloneBackend];
  const externalRcloneFieldsComplete = externalRcloneFields.every((field) => !field.required || externalRcloneConfig[field.key]?.trim());
  const canContinue = step === 0
    ? Boolean(selectedRepository && (repositoryPassword.trim() || selectedProfile?.passwordSet))
    : step === 1
      ? Boolean(snapshotId)
      : step === 2
      ? paths.length > 0
      : step === 3
        ? restoreTarget.length > 0
        : true;

  useEffect(() => {
    setPaths([]);
    setSnapshotId("");
    setSnapshots([]);
    setError("");
    setRestoreMessage("");
  }, [selectedProfileId, externalLocation, externalTarget, externalRcloneBackend, externalRclonePath]);

  async function chooseRestoreTarget() {
    const folder = await bridge.chooseDirectory();
    if (folder) setRestoreTarget(folder);
  }

  async function chooseExternalRepository() {
    const folder = await bridge.chooseDirectory();
    if (folder) setExternalTarget(folder);
  }

  async function connectExternalRcloneAccount() {
    setExternalRcloneSetup({ status: "working", message: "Connecting Rclone account..." });
    try {
      if (window.reststop && typeof window.reststop.connectRcloneAccount !== "function") {
        throw new Error("Restart Rest Stop so the updated restore bridge is loaded.");
      }
      const result = await bridge.connectRcloneAccount({
        backend: externalRcloneBackend,
        remoteName: externalRcloneRemoteName,
        config: externalRcloneConfig,
        replaceRemote: true
      });
      setExternalRcloneSetup({ status: "success", message: result.message });
    } catch (setupError) {
      setExternalRcloneSetup({ status: "error", message: setupError instanceof Error ? setupError.message : "Unable to connect this account." });
    }
  }

  async function restorePassword() {
    if (repositoryPassword.trim()) return repositoryPassword;
    if (selectedProfile?.id) {
      const stored = await bridge.getStoredPassword(selectedProfile.id);
      if (stored) return stored;
    }
    throw new Error("Enter the backup password.");
  }

  async function loadSnapshots() {
    if (!selectedRepository) throw new Error("Choose a backup location.");
    const password = await restorePassword();
    const nextSnapshots = await bridge.listRestoreSnapshots({ repository: selectedRepository, password });
    if (nextSnapshots.length === 0) throw new Error("No restore points were found in this backup.");
    setSnapshots(nextSnapshots);
    setSnapshotId((current) => current && nextSnapshots.some((snapshot) => snapshot.id === current) ? current : nextSnapshots[0].id);
  }

  async function handleContinue() {
    if (!canContinue || working) return;
    setError("");
    setRestoreMessage("");
    setWorking(true);
    try {
      if (step === 0) await loadSnapshots();
      setStep(step + 1);
    } catch (continueError) {
      setError(continueError instanceof Error ? continueError.message : "Unable to continue.");
    } finally {
      setWorking(false);
    }
  }

  async function handleRestore() {
    if (!selectedRepository || !snapshotId || paths.length === 0 || !restoreTarget || working) return;
    setError("");
    setRestoreMessage("");
    setWorking(true);
    try {
      const password = await restorePassword();
      onStartRestore({
        repository: selectedRepository,
        password,
        snapshotId,
        paths,
        target: restoreTarget,
        overwrite
      }, {
        source: sourceName,
        destination: restoreTarget,
        fileCount: paths.length
      });
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Unable to restore these files.");
      setWorking(false);
    }
  }

  return (
    <section className="rounded-md border border-ink/10 bg-white p-5 shadow-sm">
      <h2 className="text-2xl font-semibold">Restore files</h2>
      <div className="mt-5">
        <Stepper steps={steps} current={step} />
        {step === 0 ? (
          <div className="wizard-grid">
            <Field label="Backup source">
              <select className="text-input" value={selectedProfileId} onChange={(event) => setSelectedProfileId(event.target.value)}>
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{formatProfileOption(profile)}</option>)}
                <option value="external">Existing backup location</option>
              </select>
            </Field>
            <Field label="Backup password">
              <input
                className="text-input"
                type="password"
                value={repositoryPassword}
                onChange={(event) => setRepositoryPassword(event.target.value)}
                placeholder={selectedProfile?.passwordSet ? "Stored password will be used if available" : "Required to open the backup"}
              />
            </Field>
            {selectedProfileId === "external" ? (
              <>
                <Field label="Backup backend">
                  <select
                    className="text-input"
                    value={externalLocation}
                    onChange={(event) => {
                      const nextLocation = event.target.value as LocationOption;
                      setExternalLocation(nextLocation);
                      if (nextLocation.startsWith("rclone:")) {
                        setExternalRcloneBackend(nextLocation.replace("rclone:", "") as RcloneBackend);
                      }
                    }}
                  >
                    {locationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </Field>
                {externalLocation.startsWith("rclone:") ? (
                  <div className="grid gap-3 rounded-md border border-ink/10 p-3">
                    <div className="grid gap-3">
                      <Field label={`${selectedRcloneOption.label} folder`}>
                        <div className="input-with-action">
                          <input
                            className="text-input"
                            value={externalRclonePath}
                            onChange={(event) => setExternalRclonePath(event.target.value)}
                            placeholder="Path to the restic repository"
                          />
                          <button
                            className="input-action-button tooltip-button"
                            type="button"
                            aria-label="Choose Remote Folder"
                            data-tooltip="Choose Remote Folder"
                            disabled={externalRcloneSetup.status !== "success"}
                            onClick={() => setExternalRcloneBrowserOpen((open) => !open)}
                          >
                            <FontAwesomeIcon icon={faFolderOpen} />
                          </button>
                        </div>
                      </Field>
                      {externalRcloneBrowserOpen ? (
                        <RcloneFolderBrowser
                          remoteName={externalRcloneRemoteName}
                          suggestedFolderName="backups"
                          onSelect={(pathName) => {
                            setExternalRclonePath(pathName);
                            setExternalRcloneBrowserOpen(false);
                          }}
                        />
                      ) : null}
                    </div>
                    {externalRcloneFields.length > 0 ? (
                      <div className="grid gap-3">
                        {externalRcloneFields.map((field) => (
                          <Field key={field.key} label={field.label}>
                            <input
                              className="text-input"
                              type={field.type ?? "text"}
                              value={externalRcloneConfig[field.key] ?? ""}
                              onChange={(event) => setExternalRcloneConfig((current) => ({ ...current, [field.key]: event.target.value }))}
                              placeholder={field.placeholder}
                            />
                          </Field>
                        ))}
                      </div>
                    ) : null}
                    <button
                      className="secondary-button justify-center"
                      disabled={externalRcloneSetup.status === "working" || !externalRcloneFieldsComplete}
                      onClick={connectExternalRcloneAccount}
                    >
                      <FontAwesomeIcon className={externalRcloneSetup.status === "working" ? "animate-spin" : ""} icon={externalRcloneSetup.status === "working" ? faRotateRight : faKey} />
                      {externalRcloneSetup.status === "working" ? "Connecting account" : "Connect account"}
                    </button>
                    {externalRcloneSetup.message ? <p className={`setup-status ${externalRcloneSetup.status}`}>{externalRcloneSetup.message}</p> : null}
                    {externalRclonePath ? <p className="path-pill">{formatRepositoryLocation(rcloneRepository(externalRcloneRemoteName, externalRcloneBackend, externalRclonePath))}</p> : null}
                  </div>
                ) : externalLocation === "rest" || externalLocation === "sftp" ? (
                  <Field label={externalLocation === "rest" ? "REST repository URL" : "SFTP repository URL"}>
                    <input
                      className="text-input"
                      value={externalTarget}
                      onChange={(event) => setExternalTarget(event.target.value)}
                      placeholder={externalLocation === "rest" ? "rest:http://server:8000/repository" : "sftp:user@host:/path/to/repository"}
                    />
                  </Field>
                ) : (
                  <>
                    <button className="secondary-button justify-center" onClick={chooseExternalRepository}>
                      <FontAwesomeIcon icon={faFolderOpen} /> Choose backup location
                    </button>
                    {externalTarget ? <p className="path-pill">{externalTarget}</p> : null}
                  </>
                )}
              </>
            ) : null}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="wizard-grid">
            <Field label="Backup date">
              <select
                className="text-input"
                value={snapshotId}
                onChange={(event) => {
                  setSnapshotId(event.target.value);
                  setPaths([]);
                }}
              >
                {snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{formatSnapshotOption(snapshot)}</option>)}
              </select>
            </Field>
            <p className="path-pill">{formatSnapshotSourcePaths(selectedSnapshot)}</p>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="wizard-grid">
            {selectedRepository && snapshotId ? (
              <RestoreFileBrowser
                repository={selectedRepository}
                password={repositoryPassword}
                profileId={selectedProfile?.id}
                snapshotId={snapshotId}
                selected={paths}
                onChange={setPaths}
              />
            ) : null}
            <SelectedPaths paths={paths} onRemove={(path) => setPaths(paths.filter((item) => item !== path))} />
          </div>
        ) : null}

        {step === 3 ? (
          <div className="wizard-grid">
            <button className="secondary-button justify-center" onClick={chooseRestoreTarget}>
              <FontAwesomeIcon icon={faFolderOpen} /> Choose restore location
            </button>
            {restoreTarget ? <p className="path-pill">{restoreTarget}</p> : null}
            <label className="toggle-row">
              <input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} />
              <span>Overwrite existing files instead of skipping them</span>
            </label>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="grid gap-3">
            <ReviewList
              items={[
                ["Backup", sourceName],
                ["Backup date", selectedSnapshot ? formatSnapshotOption(selectedSnapshot) : "Not selected"],
                ["Files", `${paths.length} selected`],
                ["Destination", restoreTarget],
                ["Overwrite", overwrite ? "Existing files can be replaced." : "Existing files with the same path will be skipped."]
              ]}
            />
            {restoreMessage ? <p className="setup-status success">{restoreMessage}</p> : null}
          </div>
        ) : null}
        {error ? <p className="mt-4 setup-status error">{error}</p> : null}
      </div>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button className="secondary-button justify-center" disabled={working} onClick={step === 0 ? onCancel : () => setStep(step - 1)}>
          <FontAwesomeIcon icon={faArrowLeft} /> {step === 0 ? "Cancel" : "Back"}
        </button>
        {step < steps.length - 1 ? (
          <button className="primary-button justify-center" disabled={!canContinue || working} onClick={handleContinue}>
            {working ? <FontAwesomeIcon className="animate-spin" icon={faRotateRight} /> : null}
            Continue <FontAwesomeIcon icon={faArrowRight} />
          </button>
        ) : (
          <button className="primary-button justify-center" disabled={!canContinue || working || Boolean(restoreMessage)} onClick={handleRestore}>
            <FontAwesomeIcon className={working ? "animate-spin" : ""} icon={working ? faRotateRight : faCloudArrowDown} /> Restore
          </button>
        )}
      </div>
    </section>
  );
}

function RestoreFileBrowser({
  repository,
  password,
  profileId,
  snapshotId,
  selected,
  onChange
}: {
  repository: BackupProfile["repository"];
  password: string;
  profileId?: string;
  snapshotId: string;
  selected: string[];
  onChange: (paths: string[]) => void;
}) {
  const [listing, setListing] = useState<DirectoryListing>({ path: "", parent: null, entries: [] });
  const [expanded, setExpanded] = useState<Record<string, DirectoryListing>>({});
  const [loadingPaths, setLoadingPaths] = useState<Record<string, boolean>>({});
  const [loadingRoot, setLoadingRoot] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setExpanded({});
    setLoadingPaths({});
    loadDirectory("");
  }, [repository.target, snapshotId]);

  async function resolvedPassword() {
    if (password.trim()) return password;
    if (profileId) {
      const stored = await bridge.getStoredPassword(profileId);
      if (stored) return stored;
    }
    throw new Error("Enter the backup password.");
  }

  async function loadDirectory(pathName = "") {
    setLoadingRoot(true);
    try {
      setError("");
      const nextPassword = await resolvedPassword();
      const nextListing = await bridge.listRestoreFiles({ repository, password: nextPassword, snapshotId, path: pathName });
      setListing(nextListing);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to read this backup.");
    } finally {
      setLoadingRoot(false);
    }
  }

  function togglePath(pathName: string) {
    if (selected.includes(pathName)) onChange(selected.filter((item) => item !== pathName));
    else onChange([...selected, pathName]);
  }

  async function toggleExpanded(entry: FileEntry) {
    if (entry.type !== "directory") return;
    if (expanded[entry.path]) {
      setExpanded(({ [entry.path]: _removed, ...remaining }) => remaining);
      return;
    }

    setLoadingPaths((current) => ({ ...current, [entry.path]: true }));
    try {
      setError("");
      const nextPassword = await resolvedPassword();
      const nextListing = await bridge.listRestoreFiles({ repository, password: nextPassword, snapshotId, path: entry.path });
      setExpanded((current) => ({ ...current, [entry.path]: nextListing }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to read this folder from the backup.");
    } finally {
      setLoadingPaths((current) => {
        const { [entry.path]: _done, ...remaining } = current;
        return remaining;
      });
    }
  }

  return (
    <div className="file-tree rounded-md border border-ink/10">
      <div className="flex flex-col gap-3 border-b border-ink/10 p-3 md:flex-row md:items-center md:justify-between">
        <p className="path-pill min-w-0 flex-1">{listing.path || "Backup root"}</p>
        <div className="flex flex-wrap gap-2">
          <button className="small-button" disabled={loadingRoot} onClick={() => loadDirectory("")}>
            <FontAwesomeIcon icon={faHouse} /> Root
          </button>
          <button className="small-button" disabled={loadingRoot || listing.parent === null} onClick={() => listing.parent !== null && loadDirectory(listing.parent)}>
            <FontAwesomeIcon icon={faArrowUp} /> Up
          </button>
        </div>
      </div>

      {error ? <p className="m-3 rounded-md bg-coral/15 p-3 text-sm font-semibold text-ink">{error}</p> : null}
      {loadingRoot ? <p className="m-3 setup-status"><FontAwesomeIcon className="animate-spin" icon={faRotateRight} /> Loading backup files...</p> : null}

      <ul className="stable-scroll file-tree-list max-h-72 overflow-auto p-2">
        {listing.entries.map((entry) => (
          <FileTreeEntry
            key={entry.path}
            entry={entry}
            expanded={expanded}
            loadingPaths={loadingPaths}
            level={0}
            selected={selected}
            onToggleExpand={toggleExpanded}
            onToggleSelect={togglePath}
          />
        ))}
        {!loadingRoot && listing.entries.length === 0 ? (
          <li className="file-tree-empty">No files were found here.</li>
        ) : null}
      </ul>
    </div>
  );
}

function BackupReview({ draft }: { draft: DraftProfile }) {
  return (
    <ReviewList
      items={[
        ["Name", draft.name],
        ["Backup location", formatRepositoryLocation(draft.repository)],
        ["Selected data", `${draft.sources.length} files or folders`],
        ["Exclusions", normalizeExcludePatterns(draft.excludes).length ? normalizeExcludePatterns(draft.excludes).join(", ") : "None"],
        ["Frequency", formatSchedule(draft.schedule)],
        ["Retention", formatRetention(draft.retention)],
        ["Encryption", "Required by Restic"]
      ]}
    />
  );
}

type ExclusionFilterKind = "extension" | "expression";

function ExclusionFilterEditor({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const rows = exclusionRowsFromText(value);

  function updateRow(index: number, pattern: string) {
    onChange(rows.map((row, rowIndex) => rowIndex === index ? pattern : row).join("\n"));
  }

  function updateKind(index: number, kind: ExclusionFilterKind) {
    const pattern = rows[index] ?? "";
    if (kind === "extension") {
      updateRow(index, exclusionFilterKind(pattern) === "extension" ? pattern : "*.");
      return;
    }
    updateRow(index, pattern);
  }

  function removeRow(index: number) {
    const nextRows = rows.filter((_, rowIndex) => rowIndex !== index);
    onChange(nextRows.join("\n"));
  }

  return (
    <div className="filter-editor">
      <div className="filter-editor-heading">
        <span className="text-sm font-semibold text-ink/75">{label}</span>
        <button className="small-button filter-add-button" type="button" onClick={() => onChange([...rows, ""].join("\n"))}>
          <FontAwesomeIcon icon={faPlus} /> Add filter
        </button>
      </div>
      <div className="filter-row-list">
        {rows.map((pattern, index) => {
          const kind = exclusionFilterKind(pattern);
          return (
            <div className="filter-row" key={index}>
              <select
                aria-label={`Filter type ${index + 1}`}
                className="filter-kind-select"
                value={kind}
                onChange={(event) => updateKind(index, event.target.value as ExclusionFilterKind)}
              >
                <option value="extension">Excludes file extension</option>
                <option value="expression">Excludes expression</option>
              </select>
              {kind === "extension" ? (
                <div className="filter-pattern-input with-prefix">
                  <span aria-hidden="true">*.</span>
                  <input
                    aria-label={`Filter pattern ${index + 1}`}
                    value={extensionValueFromPattern(pattern)}
                    onChange={(event) => updateRow(index, extensionPatternFromValue(event.target.value))}
                    placeholder="csv"
                  />
                </div>
              ) : (
                <input
                  aria-label={`Filter pattern ${index + 1}`}
                  className="filter-pattern-input"
                  value={pattern}
                  onChange={(event) => updateRow(index, event.target.value)}
                  placeholder="**/node_modules/"
                />
              )}
              <button className="filter-remove-button" type="button" aria-label={`Remove filter ${index + 1}`} onClick={() => removeRow(index)}>
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function exclusionRowsFromText(value: string) {
  const rows = String(value ?? "").split(/\r?\n/);
  return rows.length > 0 ? rows : [""];
}

function exclusionFilterKind(pattern: string): ExclusionFilterKind {
  return /^\*\.[^*/\\]+$/.test(pattern) || /^\*\.\*[^/\\]+$/.test(pattern) || pattern === "*." ? "extension" : "expression";
}

function extensionValueFromPattern(pattern: string) {
  if (/^\*\.\*[^/\\]+$/.test(pattern)) return pattern.slice(3);
  return pattern.startsWith("*.") ? pattern.slice(2) : pattern;
}

function extensionPatternFromValue(value: string) {
  const extension = String(value ?? "").trim().replace(/^\*?\./, "").replace(/^\*/, "");
  return extension ? `*.${extension}` : "*.";
}

function ReviewList({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid gap-3">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-md border border-ink/10 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink/50">{label}</dt>
          <dd className="mt-1 break-words text-sm font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function FileBrowser({ selected, onChange }: { selected: string[]; onChange: (paths: string[]) => void }) {
  const [listing, setListing] = useState<DirectoryListing>({ path: "", parent: null, entries: [] });
  const [expanded, setExpanded] = useState<Record<string, DirectoryListing>>({});
  const [loadingPaths, setLoadingPaths] = useState<Record<string, boolean>>({});
  const [roots, setRoots] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    bridge.getRoots().then(setRoots);
    bridge.getHomeDirectory().then((home) => loadDirectory(home));
  }, []);

  async function loadDirectory(dirPath: string) {
    try {
      setError("");
      const nextListing = await bridge.listDirectory(dirPath);
      setListing(nextListing);
      setExpanded({});
      setLoadingPaths({});
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to open this folder.");
    }
  }

  function togglePath(pathName: string) {
    if (selected.includes(pathName)) onChange(selected.filter((item) => item !== pathName));
    else onChange([...selected, pathName]);
  }

  async function toggleExpanded(entry: FileEntry) {
    if (entry.type !== "directory") return;
    if (expanded[entry.path]) {
      setExpanded(({ [entry.path]: _removed, ...remaining }) => remaining);
      return;
    }

    setLoadingPaths((current) => ({ ...current, [entry.path]: true }));
    try {
      setError("");
      const nextListing = await bridge.listDirectory(entry.path);
      setExpanded((current) => ({ ...current, [entry.path]: nextListing }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to open this folder.");
    } finally {
      setLoadingPaths((current) => {
        const { [entry.path]: _done, ...remaining } = current;
        return remaining;
      });
    }
  }

  return (
    <div className="file-tree rounded-md border border-ink/10">
      <div className="flex flex-col gap-3 border-b border-ink/10 p-3 md:flex-row md:items-center md:justify-between">
        <p className="path-pill min-w-0 flex-1">{listing.path || "Loading..."}</p>
        <div className="flex flex-wrap gap-2">
          <button className="small-button" onClick={() => bridge.getHomeDirectory().then(loadDirectory)}>
            <FontAwesomeIcon icon={faHouse} /> Home
          </button>
          <button className="small-button" disabled={!listing.parent} onClick={() => listing.parent && loadDirectory(listing.parent)}>
            <FontAwesomeIcon icon={faArrowUp} /> Up
          </button>
        </div>
      </div>

      {roots.length > 1 ? (
        <div className="flex flex-wrap gap-2 border-b border-ink/10 p-3">
          {roots.map((root) => (
            <button key={root} className="small-button" onClick={() => loadDirectory(root)}>{root}</button>
          ))}
        </div>
      ) : null}

      {error ? <p className="m-3 rounded-md bg-coral/15 p-3 text-sm font-semibold text-ink">{error}</p> : null}

      <ul className="stable-scroll file-tree-list max-h-72 overflow-auto p-2">
        {listing.entries.map((entry) => (
          <FileTreeEntry
            key={entry.path}
            entry={entry}
            expanded={expanded}
            loadingPaths={loadingPaths}
            level={0}
            selected={selected}
            onToggleExpand={toggleExpanded}
            onToggleSelect={togglePath}
          />
        ))}
      </ul>
    </div>
  );
}

function FileTreeEntry({
  entry,
  expanded,
  loadingPaths,
  level,
  selected,
  onToggleExpand,
  onToggleSelect
}: {
  entry: FileEntry;
  expanded: Record<string, DirectoryListing>;
  loadingPaths: Record<string, boolean>;
  level: number;
  selected: string[];
  onToggleExpand: (entry: FileEntry) => void;
  onToggleSelect: (pathName: string) => void;
}) {
  const isDirectory = entry.type === "directory";
  const isExpanded = Boolean(expanded[entry.path]);
  const isLoading = Boolean(loadingPaths[entry.path]);
  const isSelected = selected.includes(entry.path);
  const children = expanded[entry.path]?.entries ?? [];

  return (
    <li>
      <div
        className={`file-tree-row ${isSelected ? "selected" : ""}`}
        style={{ paddingLeft: `${0.5 + level * 1.25}rem` }}
      >
        {isDirectory ? (
          <button
            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${entry.name}`}
            className="icon-button small file-tree-expand"
            disabled={isLoading}
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpand(entry);
            }}
            type="button"
          >
            <FontAwesomeIcon className={isLoading ? "animate-spin" : ""} icon={isLoading ? faRotateRight : isExpanded ? faChevronDown : faChevronRight} />
          </button>
        ) : (
          <span className="file-tree-spacer" />
        )}
        <button
          aria-pressed={isSelected}
          className="file-tree-select"
          onClick={() => onToggleSelect(entry.path)}
          type="button"
        >
          <FontAwesomeIcon className="text-pine" icon={isDirectory ? faFolderOpen : faFile} />
          <span>{entry.name}</span>
        </button>
      </div>
      {isExpanded ? (
        <ul>
          {children.map((child) => (
            <FileTreeEntry
              key={child.path}
              entry={child}
              expanded={expanded}
              loadingPaths={loadingPaths}
              level={level + 1}
              selected={selected}
              onToggleExpand={onToggleExpand}
              onToggleSelect={onToggleSelect}
            />
          ))}
          {children.length === 0 ? (
            <li className="file-tree-empty" style={{ paddingLeft: `${2.5 + (level + 1) * 1.25}rem` }}>No items here.</li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

function Stepper({
  steps,
  current,
  canSelect,
  onSelect
}: {
  steps: string[];
  current: number;
  canSelect?: (index: number) => boolean;
  onSelect?: (index: number) => void;
}) {
  return (
    <ol className="stepper-list mb-6 grid gap-2">
      {steps.map((label, index) => {
        const selectable = Boolean(onSelect && canSelect?.(index));
        const content = (
          <>
            <span>{index + 1}</span>
            {label}
          </>
        );

        return (
          <li key={label} className={`step ${index <= current ? "active" : ""} ${onSelect ? "interactive" : ""} ${selectable ? "selectable" : ""}`}>
            {onSelect ? (
              <button type="button" className="step-button" disabled={!selectable} aria-current={index === current ? "step" : undefined} onClick={() => onSelect(index)}>
                {content}
              </button>
            ) : content}
          </li>
        );
      })}
    </ol>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold text-ink/75">{label}</span>
      {children}
    </label>
  );
}

function SelectedPaths({ paths, onRemove }: { paths: string[]; onRemove: (path: string) => void }) {
  if (paths.length === 0) return <p className="rounded-md border border-dashed border-ink/20 p-4 text-sm text-ink/55">No paths selected.</p>;

  return (
    <ul className="stable-scroll grid max-h-52 gap-2 overflow-auto rounded-md border border-ink/10 p-2">
      {paths.map((path) => (
        <li key={path} className="flex items-center justify-between gap-3 rounded-md bg-paper px-3 py-2 text-sm">
          <span className="break-all">{path}</span>
          <button className="icon-button small" aria-label={`Remove ${path}`} onClick={() => onRemove(path)}>
            <FontAwesomeIcon icon={faTrashCan} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function DeleteBackupModal({
  profiles,
  initialProfileId,
  onConfirm,
  onCancel
}: {
  profiles: BackupProfile[];
  initialProfileId: string | null;
  onConfirm: (profileId: string, deleteRepository: boolean) => Promise<void>;
  onCancel: () => void;
}) {
  const [selectedProfileId, setSelectedProfileId] = useState(initialProfileId ?? profiles[0]?.id ?? "");
  const [deleteRepository, setDeleteRepository] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0] ?? null;
  const repositoryDeleteSupported = selectedProfile?.repository.type === "local" || selectedProfile?.repository.type === "rclone";
  const repositoryDeleteUnsupported = Boolean(deleteRepository && selectedProfile && !repositoryDeleteSupported);
  const canDelete = Boolean(selectedProfile && confirmed && !working && !repositoryDeleteUnsupported);

  useEffect(() => {
    if (!profiles.some((profile) => profile.id === selectedProfileId)) {
      setSelectedProfileId(profiles[0]?.id ?? "");
    }
  }, [profiles, selectedProfileId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedProfile || !canDelete) return;
    setWorking(true);
    setError("");
    try {
      await onConfirm(selectedProfile.id, deleteRepository);
    } catch (deleteError) {
      setWorking(false);
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete this backup.");
    }
  }

  return (
    <div className="modal-overlay" onClick={working ? undefined : onCancel}>
      <div className="modal-card delete-modal" onClick={(event) => event.stopPropagation()}>
        <h3 className="text-lg font-semibold">Delete backup</h3>
        <p className="mt-1 text-sm text-ink/65">Choose the saved backup profile to remove from Rest Stop.</p>
        <form className="mt-4 grid gap-3" onSubmit={handleSubmit}>
          <Field label="Backup">
            <select
              className="text-input"
              disabled={working || profiles.length === 0}
              value={selectedProfile?.id ?? ""}
              onChange={(event) => {
                setSelectedProfileId(event.target.value);
                setDeleteRepository(false);
                setConfirmed(false);
                setError("");
              }}
            >
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{formatProfileOption(profile)}</option>)}
            </select>
          </Field>
          {selectedProfile ? <p className="path-pill">{formatRepositoryLocation(selectedProfile.repository)}</p> : null}
          <label className="toggle-row">
            <input
              checked={deleteRepository}
              disabled={working || !selectedProfile}
              type="checkbox"
              onChange={(event) => {
                setDeleteRepository(event.target.checked);
                setError("");
              }}
            />
            <span>Delete the repository data at the backup location as well</span>
          </label>
          {repositoryDeleteUnsupported ? (
            <p className="setup-status error">Repository deletion is only supported for local folders and Rclone backup locations.</p>
          ) : deleteRepository ? (
            <p className="setup-status error">This permanently deletes the backup repository data, not just the saved Rest Stop profile.</p>
          ) : (
            <p className="setup-status">Only the saved Rest Stop profile will be removed.</p>
          )}
          <label className="toggle-row">
            <input
              checked={confirmed}
              disabled={working || !selectedProfile}
              type="checkbox"
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>I understand this cannot be undone</span>
          </label>
          {error ? <p className="setup-status error">{error}</p> : null}
          <div className="flex justify-end gap-3">
            <button type="button" className="secondary-button" disabled={working} onClick={onCancel}>Cancel</button>
            <button type="submit" className="danger-button" disabled={!canDelete}>
              <FontAwesomeIcon icon={faTrashCan} /> {working ? "Deleting..." : "Delete backup"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PasswordPromptModal({
  profile,
  onConfirm,
  onCancel
}: {
  profile: BackupProfile;
  onConfirm: (password: string) => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    onConfirm(password);
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <h3 className="text-lg font-semibold">Run backup</h3>
        <p className="mt-1 text-sm text-ink/65">Enter the password for <strong>{profile.name}</strong>.</p>
        <form className="mt-4 grid gap-3" onSubmit={handleSubmit}>
          <Field label="Backup password">
            <input
              className="text-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
              placeholder="Backup password"
            />
          </Field>
          <div className="flex justify-end gap-3">
            <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
            <button type="submit" className="primary-button" disabled={!password}>
              <FontAwesomeIcon icon={faRepeat} /> Run backup
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
