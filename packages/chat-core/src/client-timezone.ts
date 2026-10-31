/**
 * Caller timezone detection for the per-turn clock anchor.
 *
 * The server has no per-user timezone (region profiles do not carry one), so the
 * client is the authoritative source. The resolved IANA zone is sent on every
 * chat turn so the agent measures relative requests ("in 15 minutes") and names
 * wall-clock times in the user's day, not the server's UTC day.
 *
 * Pure and side-effect free; returns `undefined` when the runtime cannot answer
 * (never throws), so a caller can simply omit the field.
 */

/** The host's IANA timezone (e.g. "Europe/Berlin"), or undefined if unknown. */
export function detectClientTimezone(): string | undefined {
  try {
    const tz = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === 'string' && tz.trim() ? tz.trim() : undefined;
  } catch {
    return undefined;
  }
}
