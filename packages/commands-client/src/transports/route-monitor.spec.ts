import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scoreRoute } from './route-score.js';
import {
  DEFAULT_COMMAND_REDUNDANCY,
  pickRedundantRoutes,
  RouteMonitor,
  type ProbeResult,
} from './route-monitor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(__dirname, 'route-score-fixture.json'), 'utf8'),
) as Array<{
  id: string;
  rtt_ms: number;
  jitter_ms: number;
  loss_ratio: number;
  kind_weight: number;
  expected_score: number;
}>;

describe('scoreRoute parity', () => {
  for (const row of fixture) {
    it(`matches fixture ${row.id}`, () => {
      const got = scoreRoute({
        rttMs: row.rtt_ms,
        jitterMs: row.jitter_ms,
        lossRatio: row.loss_ratio,
        kindWeight: row.kind_weight,
      });
      expect(got).toBeCloseTo(row.expected_score, 10);
    });
  }
});

describe('RouteMonitor', () => {
  let timers: Array<{ id: number; at: number; fn: () => void }> = [];
  let now = 0;
  let nextId = 1;

  function installClock() {
    timers = [];
    now = 0;
    nextId = 1;
    return {
      now: () => now,
      setTimeout: (fn: () => void, ms: number) => {
        const id = nextId++;
        timers.push({ id, at: now + ms, fn });
        return id;
      },
      clearTimeout: (id: unknown) => {
        timers = timers.filter((t) => t.id !== id);
      },
    };
  }

  async function advance(ms: number) {
    const target = now + ms;
    while (true) {
      const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at);
      if (due.length === 0) {
        now = target;
        break;
      }
      const next = due[0];
      now = next.at;
      timers = timers.filter((t) => t.id !== next.id);
      next.fn();
      // Flush microtasks so async runProbe / probeFn can settle
      for (let i = 0; i < 20; i++) await Promise.resolve();
    }
    for (let i = 0; i < 20; i++) await Promise.resolve();
  }

  afterEach(() => {
    timers = [];
  });

  it('probes routes in parallel (slow route does not delay others)', async () => {
    const clock = installClock();
    const startedAt = new Map<string, number>();
    let releaseSlow: (r: ProbeResult) => void = () => {};
    const slowGate = new Promise<ProbeResult>((resolve) => {
      releaseSlow = resolve;
    });

    const monitor = new RouteMonitor({
      clock,
      probeTimeoutMs: 1500,
      activeIntervalMs: 1000,
      standbyIntervalMs: 3000,
    });
    monitor.setRoutes([
      { id: 'fast', kindWeight: 1 },
      { id: 'slow', kindWeight: 1 },
    ]);
    monitor.setProbeFn(async (id) => {
      startedAt.set(id, clock.now());
      if (id === 'slow') return slowGate;
      return { ok: true, rttMs: 10 };
    });
    monitor.start();
    await advance(0);
    expect(startedAt.has('fast')).toBe(true);
    expect(startedAt.has('slow')).toBe(true);
    expect(startedAt.get('fast')).toBe(startedAt.get('slow'));

    // Fast probe already completed while slow is gated — snapshots must reflect fast.
    const snaps = monitor.snapshots();
    const fast = snaps.find((s) => s.routeId === 'fast');
    expect(fast?.reachable).toBe(true);
    expect(fast?.averageLatency).toBeCloseTo(10, 5);
    releaseSlow({ ok: true, rttMs: 200 });
    for (let i = 0; i < 20; i++) await Promise.resolve();
    monitor.stop();
  });

  it('computes loss and jitter over the window', async () => {
    const clock = installClock();
    const results: ProbeResult[] = [
      { ok: true, rttMs: 10 },
      { ok: true, rttMs: 20 },
      { ok: false },
      { ok: true, rttMs: 30 },
    ];
    let i = 0;
    const monitor = new RouteMonitor({
      clock,
      probeTimeoutMs: 1500,
      activeIntervalMs: 1000,
      windowSize: 20,
    });
    monitor.setRoutes([{ id: 'a', kindWeight: 1, carryingTraffic: true }]);
    monitor.setProbeFn(async () => results[Math.min(i++, results.length - 1)]);
    monitor.start();
    for (let step = 0; step < 4; step++) {
      await advance(step === 0 ? 0 : 1000);
    }
    const snap = monitor.snapshots()[0];
    expect(snap.lossRatio).toBeCloseTo(0.25, 5);
    expect(snap.jitter).toBeGreaterThan(0);
    monitor.stop();
  });

  it('holds hysteresis then switches when score beats by 25% for 3 evals', async () => {
    const clock = installClock();
    const rtts = new Map<string, number>([
      ['a', 100],
      ['b', 100],
    ]);
    const switches: string[] = [];
    const monitor = new RouteMonitor({
      clock,
      probeTimeoutMs: 1500,
      activeIntervalMs: 1000,
      minSwitchIntervalMs: 0,
      hysteresisEvals: 3,
      hysteresisRatio: 0.25,
      onSwitch: (_from, to) => switches.push(to),
    });
    monitor.setRoutes([
      { id: 'a', kindWeight: 1, carryingTraffic: true },
      { id: 'b', kindWeight: 1 },
    ]);
    monitor.setProbeFn(async (id) => ({ ok: true, rttMs: rtts.get(id)! }));
    monitor.start();
    await advance(0);
    // Force known primary so hysteresis has something to beat
    monitor.setLockedRoute('a');
    monitor.setLockedRoute(null);
    expect(monitor.getPrimaryId()).toBe('a');

    // Make b clearly better so score exceeds +25%
    rtts.set('b', 20);
    rtts.set('a', 100);
    for (let i = 0; i < 8; i++) {
      await advance(1000);
    }
    expect(monitor.getPrimaryId()).toBe('b');
    expect(switches.filter((s) => s === 'b').length).toBeGreaterThan(0);
    monitor.stop();
  });

  it('fast-failovers after 3 lost probes', async () => {
    const clock = installClock();
    let aFail = false;
    const switches: Array<{ to: string; reason: string }> = [];
    const monitor = new RouteMonitor({
      clock,
      probeTimeoutMs: 1500,
      activeIntervalMs: 1000,
      standbyIntervalMs: 1000,
      fastFailoverLostProbes: 3,
      minSwitchIntervalMs: 0,
      onSwitch: (_f, to, reason) => switches.push({ to, reason }),
    });
    monitor.setRoutes([
      { id: 'a', kindWeight: 1, carryingTraffic: true },
      { id: 'b', kindWeight: 0.8 },
    ]);
    monitor.setProbeFn(async (id) => {
      if (id === 'a' && aFail) return { ok: false };
      return { ok: true, rttMs: id === 'a' ? 10 : 30 };
    });
    monitor.start();
    await advance(0);
    expect(monitor.getPrimaryId()).toBe('a');
    aFail = true;
    for (let i = 0; i < 5; i++) {
      await advance(1000);
    }
    const failover = switches.find((s) => s.reason.startsWith('fast_failover'));
    expect(failover?.to).toBe('b');
    expect(monitor.getPrimaryId()).toBe('b');
    monitor.stop();
  });

  it('manual lock disables auto-switch', async () => {
    const clock = installClock();
    const rtts = new Map([
      ['a', 100],
      ['b', 10],
    ]);
    const monitor = new RouteMonitor({
      clock,
      probeTimeoutMs: 1500,
      activeIntervalMs: 1000,
      minSwitchIntervalMs: 0,
      hysteresisEvals: 1,
    });
    monitor.setRoutes([
      { id: 'a', kindWeight: 1 },
      { id: 'b', kindWeight: 1 },
    ]);
    monitor.setProbeFn(async (id) => ({ ok: true, rttMs: rtts.get(id)! }));
    monitor.start();
    await advance(0);
    monitor.setLockedRoute('a');
    for (let i = 0; i < 5; i++) {
      await advance(1000);
    }
    expect(monitor.getPrimaryId()).toBe('a');
    monitor.stop();
  });

  it('pickRedundantRoutes prefers diversity', () => {
    const ids = pickRedundantRoutes(
      [
        { id: 'd1', score: 50, reachable: true, kind: 'intranet' },
        { id: 'd2', score: 49, reachable: true, kind: 'intranet' },
        { id: 'r1', score: 40, reachable: true, kind: 'registry_relay' },
      ],
      { ...DEFAULT_COMMAND_REDUNDANCY, maxRoutes: 2, preferDiverse: true },
    );
    expect(ids).toEqual(['d1', 'r1']);
  });
});
