import { describe, expect, it, vi } from 'vitest';
import {
  NexusBrowserSession,
  accessTokenNeedsRefresh,
  readNexusBrowserSessionMetrics,
  resetNexusBrowserSessionMetrics,
  type NexusBrowserSessionPort,
  type NexusSessionRead,
} from './browser-session.js';

const NOW = 1_700_000_000_000;

function port(overrides: Partial<NexusBrowserSessionPort> = {}): NexusBrowserSessionPort {
  return {
    read: async () => ({ present: false, accessExpiresAt: null }),
    refresh: async () => ({ ok: false, reason: 'unavailable' }),
    clear: async () => undefined,
    ...overrides,
  };
}

describe('NexusBrowserSession', () => {
  it('restores a session that is still outside the expiry skew', async () => {
    resetNexusBrowserSessionMetrics();
    const refresh = vi.fn();
    const logs: unknown[] = [];
    const session = new NexusBrowserSession(
      port({
        read: async () => ({ present: true, accessExpiresAt: NOW + 120_000 }),
        refresh,
      }),
      { now: () => NOW, log: (_event, fields) => logs.push(fields) },
    );
    await expect(session.restore()).resolves.toEqual({ outcome: 'restored', refreshed: false });
    expect(refresh).not.toHaveBeenCalled();
    expect(readNexusBrowserSessionMetrics().restore).toBe(1);
    expect(JSON.stringify(logs)).not.toMatch(/token|secret|bearer/i);
  });

  it('refreshes once when the access token is inside the skew', async () => {
    resetNexusBrowserSessionMetrics();
    const refresh = vi.fn(async () => ({ ok: true as const, accessExpiresAt: NOW + 3_600_000 }));
    const session = new NexusBrowserSession(
      port({
        read: async () => ({ present: true, accessExpiresAt: NOW + 30_000 }),
        refresh,
      }),
      { now: () => NOW },
    );
    await expect(session.restore()).resolves.toEqual({ outcome: 'restored', refreshed: true });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(accessTokenNeedsRefresh(NOW + 30_000, NOW)).toBe(true);
  });

  it('shares one refresh across overlapping restores', async () => {
    resetNexusBrowserSessionMetrics();
    let reads = 0;
    const refresh = vi.fn(
      () =>
        new Promise<{ ok: true; accessExpiresAt: number }>((resolve) => {
          setTimeout(() => resolve({ ok: true, accessExpiresAt: NOW + 3_600_000 }), 10);
        }),
    );
    const session = new NexusBrowserSession(
      port({
        read: async () => {
          reads += 1;
          return { present: true, accessExpiresAt: null };
        },
        refresh,
      }),
      { now: () => NOW },
    );
    const [a, b] = await Promise.all([session.restore(), session.restore()]);
    expect(a).toEqual({ outcome: 'restored', refreshed: true });
    expect(b).toEqual(a);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reads).toBe(1);
  });

  it('keeps a live access token when the early refresh is rejected', async () => {
    resetNexusBrowserSessionMetrics();
    const clear = vi.fn(async () => undefined);
    const session = new NexusBrowserSession(
      port({
        read: async () => ({ present: true, accessExpiresAt: NOW + 20_000 }),
        refresh: async () => ({ ok: false, reason: 'rejected' }),
        clear,
      }),
      { now: () => NOW },
    );
    await expect(session.restore()).resolves.toEqual({ outcome: 'restored', refreshed: false });
    expect(clear).not.toHaveBeenCalled();
    expect(readNexusBrowserSessionMetrics().reauth).toBe(0);
  });

  it('does not clear the session when the post-reject read fails', async () => {
    resetNexusBrowserSessionMetrics();
    const clear = vi.fn(async () => undefined);
    let reads = 0;
    const session = new NexusBrowserSession(
      port({
        read: async () => {
          reads += 1;
          if (reads === 1) return { present: true, accessExpiresAt: NOW - 1_000 };
          throw new Error('storage');
        },
        refresh: async () => ({ ok: false, reason: 'rejected' }),
        clear,
      }),
      { now: () => NOW },
    );
    await expect(session.restore()).resolves.toEqual({ outcome: 'unavailable' });
    expect(clear).not.toHaveBeenCalled();
  });

  it('fails closed when the refresh token is rejected and the access token is expired', async () => {
    resetNexusBrowserSessionMetrics();
    const clear = vi.fn(async () => undefined);
    const current: NexusSessionRead = { present: true, accessExpiresAt: NOW - 1_000 };
    const session = new NexusBrowserSession(
      port({
        read: async () => current,
        refresh: async () => ({ ok: false, reason: 'rejected' }),
        clear,
      }),
      { now: () => NOW },
    );
    await expect(session.restore()).resolves.toEqual({ outcome: 'reauth', reason: 'refresh_rejected' });
    expect(clear).toHaveBeenCalledTimes(1);
    expect(readNexusBrowserSessionMetrics().reauth).toBe(1);
  });

  it('does not clear the session when refresh cannot reach the issuer', async () => {
    resetNexusBrowserSessionMetrics();
    const clear = vi.fn(async () => undefined);
    const session = new NexusBrowserSession(
      port({
        read: async () => ({ present: true, accessExpiresAt: NOW - 1_000 }),
        refresh: async () => ({ ok: false, reason: 'unavailable' }),
        clear,
      }),
      { now: () => NOW },
    );
    await expect(session.restore()).resolves.toEqual({ outcome: 'unavailable' });
    expect(clear).not.toHaveBeenCalled();
    expect(readNexusBrowserSessionMetrics().unavailable).toBe(1);
    expect(readNexusBrowserSessionMetrics().reauth).toBe(0);
  });

  it('treats a missing session as signed out without clearing', async () => {
    resetNexusBrowserSessionMetrics();
    const clear = vi.fn();
    const session = new NexusBrowserSession(port({ clear }), { now: () => NOW });
    await expect(session.restore()).resolves.toEqual({ outcome: 'reauth', reason: 'signed_out' });
    expect(clear).not.toHaveBeenCalled();
  });
});
