const GOOGLE_DRIVE_RESTIC_PACK_SIZE = "64";

const GOOGLE_DRIVE_RCLONE_RESTIC_ARGS = [
  "serve restic",
  "--stdio",
  "--fast-list",
  "--b2-hard-delete",
  "--checkers 1",
  "--transfers 1",
  "--max-connections 2",
  "--tpslimit 2",
  "--tpslimit-burst 2",
  "--low-level-retries 20",
  "--retries 8",
  "--retries-sleep 30s",
  "--timeout 30m",
  "--contimeout 60s",
  "--buffer-size 32M",
  "--expect-continue-timeout 5s",
  "--drive-use-trash=false",
  "--drive-stop-on-upload-limit",
  "--drive-pacer-min-sleep 200ms",
  "--drive-pacer-burst 2",
  "--drive-chunk-size 64M",
  "--drive-acknowledge-abuse"
].join(" ");

const GOOGLE_DRIVE_RCLONE_ENV = Object.freeze({
  RESTIC_PACK_SIZE: GOOGLE_DRIVE_RESTIC_PACK_SIZE,
  RCLONE_CHECKERS: "1",
  RCLONE_TRANSFERS: "1",
  RCLONE_MAX_CONNECTIONS: "2",
  RCLONE_TPSLIMIT: "2",
  RCLONE_TPSLIMIT_BURST: "2",
  RCLONE_LOW_LEVEL_RETRIES: "20",
  RCLONE_RETRIES: "8",
  RCLONE_RETRIES_SLEEP: "30s",
  RCLONE_TIMEOUT: "30m",
  RCLONE_CONTIMEOUT: "60s",
  RCLONE_BUFFER_SIZE: "32M",
  RCLONE_EXPECT_CONTINUE_TIMEOUT: "5s",
  RCLONE_DRIVE_CHUNK_SIZE: "64M",
  RCLONE_DRIVE_USE_TRASH: "false",
  RCLONE_DRIVE_STOP_ON_UPLOAD_LIMIT: "true",
  RCLONE_DRIVE_PACER_MIN_SLEEP: "200ms",
  RCLONE_DRIVE_PACER_BURST: "2",
  RCLONE_DRIVE_ACKNOWLEDGE_ABUSE: "true"
});

function rcloneResticOptions(repositoryOrTarget) {
  const target = typeof repositoryOrTarget === "string" ? repositoryOrTarget : repositoryOrTarget?.target;
  if (!String(target ?? "").trim().startsWith("rclone:") || !isGoogleDriveRepository(repositoryOrTarget)) return [];
  return [
    "-o",
    `rclone.args=${GOOGLE_DRIVE_RCLONE_RESTIC_ARGS}`,
    "-o",
    "rclone.connections=2",
    "-o",
    "rclone.timeout=30m"
  ];
}

function rcloneEnvironmentDefaults(repositoryOrTarget) {
  return isGoogleDriveRepository(repositoryOrTarget) ? { ...GOOGLE_DRIVE_RCLONE_ENV } : {};
}

function resticBackupOptions(repositoryOrTarget) {
  return isGoogleDriveRepository(repositoryOrTarget) ? ["--pack-size", GOOGLE_DRIVE_RESTIC_PACK_SIZE] : [];
}

function isGoogleDriveRepository(repositoryOrTarget) {
  return Boolean(repositoryOrTarget && typeof repositoryOrTarget === "object" && repositoryOrTarget.rcloneBackend === "drive");
}

function sanitizeRcloneOutput(output) {
  return String(output ?? "")
    .replace(/https?:\/\/\S+/gi, "[link hidden]")
    .replace(/\S*(code|state|session_crd|access_token|refresh_token|id_token|client_secret)=\S*/gi, "$1=[hidden]")
    .trim();
}

function isMissingRcloneRemoteError(error) {
  return /didn'?t find section in config file|not found in config|couldn'?t find remote|remote .* not found/i.test(errorOutput(error));
}

function isRcloneAuthorizationFailure(output) {
  const text = String(output ?? "");
  if (/revoked|consent_required|account_not_found|invalid_client|unauthorized_client|refresh token|failed to configure token/i.test(text)) return true;
  if (/access_denied|denied access/i.test(text) && !isRetryableRcloneError(text)) return true;
  const hasAuthContext = /authorization|authorize|oauth|accounts\.google\.com|localhost:\d+\/auth|session_crd=/i.test(text);
  return hasAuthContext && /context canceled|cancelled|canceled|failed to authorize/i.test(text);
}

function isNetworkError(error) {
  return /network|offline|unavailable|timed?\s*out|timeout|connection|connect|reset|refused|unreachable|dns|getaddrinfo|resolve|lookup|no such host|unknown host|host not found|could not resolve|econn|etimedout|enotfound|eai_again|no route|i\/o timeout|context deadline|context cancel(?:ed|led)|temporary failure|temporary error|transport|tls handshake|broken pipe|rate.?limit|too many requests|try again later|backend error|rclone:\s*5|HTTP 429|HTTP 500|HTTP 502|HTTP 503|HTTP 504|HTTP response \((?:429|5\d\d)\)|\b5\d\d Internal Server Error\b|userRateLimitExceeded|dailyLimitExceeded|storageQuotaExceeded|uploadRateLimitExceeded|quota|upload limit/i.test(errorOutput(error));
}

function isRetryableRcloneError(error) {
  return isNetworkError(error) || isTransientAuthError(error);
}

function isTransientAuthError(error) {
  const output = errorOutput(error);
  return /invalid_grant/i.test(output) && !/revoked|consent_required|account_not_found|invalid_client|unauthorized_client|refresh token|failed to configure token/i.test(output);
}

function errorOutput(error) {
  return [
    error?.message,
    error?.stderr,
    error?.stdout,
    String(error ?? "")
  ].filter(Boolean).join("\n");
}

module.exports = {
  rcloneResticOptions,
  resticBackupOptions,
  rcloneEnvironmentDefaults,
  sanitizeRcloneOutput,
  isMissingRcloneRemoteError,
  isNetworkError,
  isRetryableRcloneError,
  isRcloneAuthorizationFailure,
  isTransientAuthError
};
