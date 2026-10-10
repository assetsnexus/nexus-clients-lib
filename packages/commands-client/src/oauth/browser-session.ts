/**
 * Browser session for Login with Nexus.
 *
 * The host owns where the credential lives (httpOnly cookie via its BFF, or
 * the same persisted session store it already uses). This module never writes
 * a global and never logs token material. It restores one session:
 *
 *   - still inside the expiry skew → use it
 *   - inside the skew or already expired → refresh once
 *   - refresh rejected and the access token is already past expiry → clear and reauth
 *   - refresh rejected while the access token is still inside its real expiry → keep it
 *   - transport failure → keep the stored session and do not ask for login
 *
 * A second `restore()` shares the in-flight attempt so two mounts cannot
 * rotate the refresh token twice.
 */

export const NEXUS_SESSION_EXPIRY_SKEW_MS = 60_000;

export type NexusSessionRead = {
  present: boolean;
  /** Unix milliseconds. Null means the store did not say — refresh once. */
  accessExpiresAt: number | null;
};

export type NexusSessionRefreshResult =
  | { ok: true; accessExpiresAt: number | null }
  | { ok: false; reason: 'rejected' | 'unavailable' };

export interface NexusBrowserSessionPort {
  read(): Promise<NexusSessionRead>;
  /** One refresh. Do not retry a rejected refresh inside the port. */
  refresh(): Promise<NexusSessionRefreshResult>;
  /** Drop the persisted session. Used only after a dead refresh token. */
  clear(): Promise<void>;
}

export type NexusSessionRestoreResult =
  | { outcome: 'restored'; refreshed: boolean }
  | { outcome: 'reauth'; reason: 'signed_out' | 'refresh_rejected' }
  | { outcome: 'unavailable' };

export type NexusSessionMetricOutcome = 'restore' | 'reauth' | 'unavailable';

export type NexusSessionLogFields = {
  outcome: NexusSessionMetricOutcome;
  refreshed?: boolean;
  reason?: string;
};

const metrics: Record<NexusSessionMetricOutcome, number> = {
  restore: 0,
  reauth: 0,
  unavailable: 0,
};

export function readNexusBrowserSessionMetrics(): Record<NexusSessionMetricOutcome, number> {
  return { ...metrics };
}

export function resetNexusBrowserSessionMetrics(): void {
  metrics.restore = 0;
  metrics.reauth = 0;
  metrics.unavailable = 0;
}

/** True when the access token should be refreshed before it is sent. */
export function accessTokenNeedsRefresh(
  expiresAt: number | null,
  now: number,
  skewMs: number = NEXUS_SESSION_EXPIRY_SKEW_MS,
): boolean {
  if (expiresAt == null || !Number.isFinite(expiresAt)) return true;
  return expiresAt - skewMs <= now;
}

/** True when the access token is still inside its real expiry, ignoring skew. */
export function accessTokenStillValid(expiresAt: number | null, now: number): boolean {
  return typeof expiresAt === 'number' && Number.isFinite(expiresAt) && expiresAt > now;
}

type SessionLogger = (event: 'nexus_session_restore', fields: NexusSessionLogFields) => void;

export class NexusBrowserSession {
  private flight: Promise<NexusSessionRestoreResult> | null = null;

  constructor(
    private readonly port: NexusBrowserSessionPort,
    private readonly options: {
      now?: () => number;
      skewMs?: number;
      log?: SessionLogger;
      metric?: (sample: { outcome: NexusSessionMetricOutcome }) => void;
    } = {},
  ) {}

  restore(): Promise<NexusSessionRestoreResult> {
    if (!this.flight) {
      const run = this.restoreOnce().finally(() => {
        if (this.flight === run) this.flight = null;
      });
      this.flight = run;
    }
    return this.flight;
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private skew(): number {
    return this.options.skewMs ?? NEXUS_SESSION_EXPIRY_SKEW_MS;
  }

  private emit(fields: NexusSessionLogFields): void {
    metrics[fields.outcome] += 1;
    this.options.metric?.({ outcome: fields.outcome });
    this.options.log?.('nexus_session_restore', fields);
  }

  private async restoreOnce(): Promise<NexusSessionRestoreResult> {
    const now = this.now();
    let current: NexusSessionRead;
    try {
      current = await this.port.read();
    } catch {
      this.emit({ outcome: 'unavailable', reason: 'read_failed' });
      return { outcome: 'unavailable' };
    }

    if (!current.present) {
      this.emit({ outcome: 'reauth', reason: 'signed_out', refreshed: false });
      return { outcome: 'reauth', reason: 'signed_out' };
    }

    if (!accessTokenNeedsRefresh(current.accessExpiresAt, now, this.skew())) {
      this.emit({ outcome: 'restore', refreshed: false });
      return { outcome: 'restored', refreshed: false };
    }

    let refreshed: NexusSessionRefreshResult;
    try {
      refreshed = await this.port.refresh();
    } catch {
      this.emit({ outcome: 'unavailable', reason: 'refresh_failed' });
      return { outcome: 'unavailable' };
    }

    if (refreshed.ok) {
      this.emit({ outcome: 'restore', refreshed: true });
      return { outcome: 'restored', refreshed: true };
    }

    if (refreshed.reason === 'unavailable') {
      this.emit({ outcome: 'unavailable', reason: 'refresh_unavailable' });
      return { outcome: 'unavailable' };
    }

    let again: NexusSessionRead;
    try {
      again = await this.port.read();
    } catch {
      this.emit({ outcome: 'unavailable', reason: 'reread_failed' });
      return { outcome: 'unavailable' };
    }
    const after = this.now();
    if (again.present && !accessTokenNeedsRefresh(again.accessExpiresAt, after, this.skew())) {
      this.emit({ outcome: 'restore', refreshed: true, reason: 'concurrent_refresh' });
      return { outcome: 'restored', refreshed: true };
    }
    if (again.present && accessTokenStillValid(again.accessExpiresAt, after)) {
      this.emit({ outcome: 'restore', refreshed: false, reason: 'refresh_rejected_token_live' });
      return { outcome: 'restored', refreshed: false };
    }

    try {
      await this.port.clear();
    } catch {
      // The caller still has to sign in. A failed clear does not keep a dead refresh token in use.
    }
    this.emit({ outcome: 'reauth', reason: 'refresh_rejected', refreshed: false });
    return { outcome: 'reauth', reason: 'refresh_rejected' };
  }
}
