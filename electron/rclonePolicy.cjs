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
  sanitizeRcloneOutput,
  isMissingRcloneRemoteError,
  isNetworkError,
  isRetryableRcloneError,
  isRcloneAuthorizationFailure,
  isTransientAuthError
};
