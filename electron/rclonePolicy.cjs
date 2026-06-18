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
    "--checkers 2",
    "--transfers 2",
    "--max-connections 4",
    "--tpslimit 4",
    "--tpslimit-burst 4",
    "--drive-pacer-min-sleep 400ms",
    "--drive-pacer-burst 4",
    "--drive-chunk-size 16M",
    "--drive-acknowledge-abuse"
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
    "--checkers 1",
    "--transfers 1",
    "--max-connections 2",
    "--tpslimit 2",
    "--tpslimit-burst 2",
    "--drive-pacer-min-sleep 500ms",
    "--drive-pacer-burst 2",
    "--drive-chunk-size 8M"
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

function rcloneResticArgs(repositoryOrTarget, highPerformance = true) {
  const backend = typeof repositoryOrTarget === "object" ? repositoryOrTarget?.rcloneBackend : null;
  const backendExtras = highPerformance ? RCLONE_BACKEND_EXTRAS_HIGH_PERF : RCLONE_BACKEND_EXTRAS_STANDARD;
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

function sanitizeRcloneOutput(output) {
  return String(output ?? "")
    .replace(/https?:\/\/\S+/gi, "[authorization link hidden]")
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
  return /network|offline|unavailable|timed?\s*out|timeout|connection|connect|reset|refused|unreachable|dns|getaddrinfo|resolve|lookup|no such host|unknown host|host not found|could not resolve|econn|etimedout|enotfound|eai_again|no route|i\/o timeout|context deadline|temporary failure|temporary error|transport|tls handshake|broken pipe|rate.?limit|too many requests|try again later|backend error|rclone:\s*5|HTTP 429|HTTP 500|HTTP 502|HTTP 503|HTTP 504|userRateLimitExceeded|dailyLimitExceeded|storageQuotaExceeded|uploadRateLimitExceeded|quota|upload limit/i.test(errorOutput(error));
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
  rcloneResticArgs,
  sanitizeRcloneOutput,
  isMissingRcloneRemoteError,
  isNetworkError,
  isRetryableRcloneError,
  isRcloneAuthorizationFailure,
  isTransientAuthError
};
