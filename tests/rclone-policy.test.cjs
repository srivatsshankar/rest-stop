const test = require("node:test");
const assert = require("node:assert/strict");
const {
  rcloneResticOptions,
  rcloneEnvironmentDefaults,
  resticBackupOptions,
  sanitizeRcloneOutput,
  isRetryableRcloneError,
  isRcloneAuthorizationFailure,
  isTransientAuthError
} = require("../electron/rclonePolicy.cjs");

test("Google Drive restic options use conservative rclone defaults", () => {
  const options = rcloneResticOptions({
    target: "rclone:reststop-drive:backups/main",
    rcloneBackend: "drive"
  });
  const args = options.join(" ");

  assert.match(args, /rclone\.args=serve restic --stdio/);
  assert.match(args, /--checkers 1/);
  assert.match(args, /--transfers 1/);
  assert.match(args, /--max-connections 2/);
  assert.match(args, /--tpslimit 2/);
  assert.match(args, /--tpslimit-burst 2/);
  assert.match(args, /--low-level-retries 20/);
  assert.match(args, /--retries 8/);
  assert.match(args, /--timeout 10m/);
  assert.match(args, /--drive-chunk-size 64M/);
  assert.deepEqual(options.slice(-4), ["-o", "rclone.connections=2", "-o", "rclone.timeout=30m"]);
});

test("non-Google Drive repositories keep restic defaults", () => {
  assert.deepEqual(rcloneResticOptions({ target: "rclone:remote:path", rcloneBackend: "onedrive" }), []);
  assert.deepEqual(rcloneResticOptions({ target: "C:\\backups", type: "local" }), []);
});

test("Google Drive environment defaults tune restic and rclone", () => {
  const env = rcloneEnvironmentDefaults({
    target: "rclone:reststop-drive:backups/main",
    rcloneBackend: "drive"
  });

  assert.deepEqual(resticBackupOptions({ target: "rclone:reststop-drive:backups/main", rcloneBackend: "drive" }), ["--pack-size", "64"]);
  assert.equal(env.RESTIC_PACK_SIZE, "64");
  assert.equal(env.RCLONE_CHECKERS, "1");
  assert.equal(env.RCLONE_TRANSFERS, "1");
  assert.equal(env.RCLONE_MAX_CONNECTIONS, "2");
  assert.equal(env.RCLONE_TPSLIMIT, "2");
  assert.equal(env.RCLONE_TPSLIMIT_BURST, "2");
  assert.equal(env.RCLONE_LOW_LEVEL_RETRIES, "20");
  assert.equal(env.RCLONE_RETRIES, "8");
  assert.equal(env.RCLONE_TIMEOUT, "10m");
  assert.equal(env.RCLONE_DRIVE_CHUNK_SIZE, "64M");
  assert.deepEqual(resticBackupOptions({ target: "rclone:remote:path", rcloneBackend: "onedrive" }), []);
  assert.deepEqual(rcloneEnvironmentDefaults({ target: "rclone:remote:path", rcloneBackend: "onedrive" }), {});
});

test("rclone throttling and transport failures are retryable", () => {
  const retryableMessages = [
    "HTTP 429 too many requests",
    "HTTP 500 backend error",
    "HTTP 503 backend error",
    "Post request rcat error: Post \"http://127.0.0.1:12345/data/file\": context canceled",
    "Post request put error: Post \"http://127.0.0.1:12345/data/file\": context canceled",
    "Fatal: unable to save snapshot: unexpected HTTP response (500): 500 Internal Server Error",
    "context deadline exceeded",
    "context canceled",
    "connection reset by peer",
    "broken pipe",
    "rate limit exceeded",
    "quota exceeded",
    "upload limit reached"
  ];

  for (const message of retryableMessages) {
    assert.equal(isRetryableRcloneError(message), true, message);
  }
});

test("durable OAuth failures still require authorization", () => {
  const authorizationFailures = [
    "invalid_grant: Token has been expired or revoked",
    "consent_required",
    "account_not_found",
    "invalid_client",
    "unauthorized_client",
    "failed to configure token"
  ];

  for (const message of authorizationFailures) {
    assert.equal(isRcloneAuthorizationFailure(message), true, message);
  }
});

test("plain invalid_grant is treated as transient", () => {
  const message = "invalid_grant";

  assert.equal(isTransientAuthError(message), true);
  assert.equal(isRetryableRcloneError(message), true);
  assert.equal(isRcloneAuthorizationFailure(message), false);
});

test("rclone sanitizer hides links and tokens without implying authorization", () => {
  const sanitized = sanitizeRcloneOutput("Post request rcat error: Post \"http://127.0.0.1:12345/data/file?code=abc&state=xyz\": context canceled access_token=secret");

  assert.match(sanitized, /\[link hidden\]/);
  assert.doesNotMatch(sanitized, /authorization link hidden/);
  assert.doesNotMatch(sanitized, /abc|xyz|secret/);
});
