/**
 * A resume rejected because another resume/generation already holds the
 * conversation is **not** a failure: inference answers `409 RESUME_IN_FLIGHT`
 * ("a resume is already in flight for this conversation; retry shortly") when a
 * `client-tool.result` lands while the turn is genuinely live.
 *
 * Treating it as fatal is the bug that killed the thinking/cancel chrome for a
 * permission-elevation resume: every client must keep `streaming: true` and let
 * the live stream deliver the (already running) turn. One predicate, shared by
 * React and Vue hosts, so the two rails never diverge.
 *
 * @module session/resume-inflight
 */

/** Codes/servers that mean "the conversation is already generating — not an error". */
const RESUME_IN_FLIGHT_CODES = new Set([
  'RESUME_IN_FLIGHT',
  'GENERATION_IN_PROGRESS',
  'ALREADY_IN_FLIGHT',
]);

const RESUME_IN_FLIGHT_MESSAGE = /(?:resume(?: is)? already in flight|already in flight|generation already in progress)/i;

function readCode(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const row = result as {
    code?: unknown;
    kind?: unknown;
    error?: { code?: unknown } | null;
  };
  const top = typeof row.code === 'string' ? row.code : '';
  const nested = row.error && typeof row.error === 'object' && typeof row.error.code === 'string'
    ? row.error.code
    : '';
  const kind = typeof row.kind === 'string' ? row.kind : '';
  return (top || nested || kind).trim();
}

function readMessage(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const row = result as { message?: unknown; error?: { message?: unknown } | null };
  const top = typeof row.message === 'string' ? row.message : '';
  const nested =
    row.error && typeof row.error === 'object' && typeof row.error.message === 'string'
      ? row.error.message
      : '';
  return (top || nested).trim();
}

/**
 * True when a soft-failed command result just means "already generating".
 *
 * Matches the structured `code` first (region/inference `RESUME_IN_FLIGHT`,
 * `GENERATION_IN_PROGRESS`) and falls back to the human message so an older
 * server that only sends prose still keeps the client out of a false error
 * state.
 */
export function isResumeInFlight(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const code = readCode(result);
  if (code && RESUME_IN_FLIGHT_CODES.has(code)) return true;
  return RESUME_IN_FLIGHT_MESSAGE.test(readMessage(result));
}
