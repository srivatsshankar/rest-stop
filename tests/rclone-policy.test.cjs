const test = require("node:test");
const assert = require("node:assert/strict");
const {
  rcloneResticArgs,
  isRetryableRcloneError,
  isRcloneAuthorizationFailure,
  isTransientAuthError
} = require("../electron/rclonePolicy.cjs");

function driveArgs(highPerformance = true) {
  return rcloneResticArgs({ rcloneBackend: "drive" }, highPerformance);
}

test("Google Drive rclone args avoid hard upload-limit failures", () => {
  assert.equal(driveArgs(true).includes("--drive-stop-on-upload-limit"), false);
  assert.equal(driveArgs(false).includes("--drive-stop-on-upload-limit"), false);
});

test("Google Drive high-performance args stay bounded for reliability", () => {
  const args = driveArgs(true);

  assert.match(args, /--checkers 2/);
  assert.match(args, /--transfers 2/);
  assert.match(args, /--max-connections 4/);
  assert.match(args, /--tpslimit 4/);
  assert.match(args, /--tpslimit-burst 4/);
  assert.match(args, /--drive-chunk-size 16M/);
});

test("Google Drive standard args are conservative", () => {
  const args = driveArgs(false);

  assert.match(args, /--checkers 1/);
  assert.match(args, /--transfers 1/);
  assert.match(args, /--max-connections 2/);
  assert.match(args, /--tpslimit 2/);
  assert.match(args, /--tpslimit-burst 2/);
  assert.match(args, /--drive-chunk-size 8M/);
});

test("Drive throttling and transport failures are retryable", () => {
  const retryableMessages = [
    "Google Drive upload limit reached",
    "HTTP 429 too many requests",
    "HTTP 500 backend error",
    "HTTP 503 backend error",
    "context deadline exceeded",
    "connection reset by peer",
    "broken pipe",
    "userRateLimitExceeded",
    "storageQuotaExceeded",
    "uploadRateLimitExceeded"
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
