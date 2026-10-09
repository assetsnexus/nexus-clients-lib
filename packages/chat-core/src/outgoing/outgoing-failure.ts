/** Failures that mean Nexus did not accept the message, so it can stay queued. */

const RETRYABLE_CODES = new Set(['NEXUS_UNAVAILABLE', 'exception']);

const TERMINAL_CODES = new Set([
  'NO_NEXUS_GRANT',
  'NEEDS_NEXUS_LOGIN',
  'NEEDS_RELOGIN',
  'APP_COMMAND_FORBIDDEN',
  'client_preflight',
  'sca_required',
  'data_access_approval_required',
  'permission_elevation_required',
  'STREAM_ENDPOINTS_UNCONFIGURED',
]);

const REACHABILITY_MESSAGE =
  /could not be reached|failed to fetch|networkerror|network request failed|econnrefused|etimedout|socket hang up|temporarily unavailable|load failed/i;

export function isRetryableOutgoingFailure(input: { code?: string | null; message?: string | null }): boolean {
  const code = typeof input.code === 'string' ? input.code.trim() : '';
  if (code && TERMINAL_CODES.has(code)) return false;
  if (code && RETRYABLE_CODES.has(code)) return true;
  const message = typeof input.message === 'string' ? input.message : '';
  return REACHABILITY_MESSAGE.test(message);
}

