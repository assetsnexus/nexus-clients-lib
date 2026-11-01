/**
 * Mount lifetime (pure).
 *
 * A mount session may expire after a relative duration (minutes / hours / days /
 * weeks) and may opt into surviving an app/OS restart. Both are plain data the
 * daemon interprets; the arithmetic lives here so the renderer, the daemon and
 * the tests share one implementation.
 */

/** Units the "expires after" picker offers, largest last. */
export const MOUNT_LIFETIME_UNITS = ['minutes', 'hours', 'days', 'weeks'] as const;

export type MountLifetimeUnit = (typeof MOUNT_LIFETIME_UNITS)[number];

export type MountExpiry = {
  /** Positive integer count of `unit`. */
  value: number;
  unit: MountLifetimeUnit;
};

const UNIT_MS: Record<MountLifetimeUnit, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 604_800_000,
};

/** A duration in ms, or null when the value is not a usable positive duration. */
export function mountExpiryMs(expiry: MountExpiry | null | undefined): number | null {
  if (!expiry) return null;
  const { value, unit } = expiry;
  if (!Number.isFinite(value) || value <= 0) return null;
  if (!MOUNT_LIFETIME_UNITS.includes(unit)) return null;
  return Math.round(value) * UNIT_MS[unit];
}

/** The instant a mount expires, or null when it has no/disabled expiry. */
export function computeExpiresAt(
  expiry: MountExpiry | null | undefined,
  startedAt: Date | string,
): string | null {
  const ms = mountExpiryMs(expiry);
  if (ms == null) return null;
  const start = startedAt instanceof Date ? startedAt : new Date(startedAt);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() + ms).toISOString();
}

/** True when `now` is at/after `expiresAt` (an unparsable instant never expires). */
export function isExpired(expiresAt: string | null | undefined, now: Date | string): boolean {
  if (!expiresAt) return false;
  const at = new Date(expiresAt);
  const ref = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(at.getTime()) || Number.isNaN(ref.getTime())) return false;
  return ref.getTime() >= at.getTime();
}

/** Normalize a possibly-malformed persisted expiry into a clean value or null. */
export function normalizeMountExpiry(raw: unknown): MountExpiry | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = Number((raw as { value?: unknown }).value);
  const unit = (raw as { unit?: unknown }).unit;
  if (!Number.isFinite(value) || value <= 0) return null;
  if (typeof unit !== 'string' || !MOUNT_LIFETIME_UNITS.includes(unit as MountLifetimeUnit)) {
    return null;
  }
  return { value: Math.round(value), unit: unit as MountLifetimeUnit };
}
