const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isRetryableRcloneError,
  isRcloneAuthorizationFailure,
  isTransientAuthError
} = require("../electron/rclonePolicy.cjs");

test("rclone throttling and transport failures are retryable", () => {
  const retryableMessages = [
    "HTTP 429 too many requests",
    "HTTP 500 backend error",
    "HTTP 503 backend error",
    "context deadline exceeded",
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
