import { defaultKindWeight, scoreRoute } from './route-score.js';

export type RouteRole = 'primary' | 'redundant' | 'standby' | 'down';

export type ProbeResult = {
  ok: boolean;
  /** Measured RTT in ms when ok. */
  rttMs?: number;
  /** True when RTT was estimated (neither in-band nor HTTP probe available). */
  estimated?: boolean;
};

export type RouteProbeFn = (routeId: string) => Promise<ProbeResult>;

export type RouteMonitorInput = {
  id: string;
  /** Kind used only for display/weight fallback. */
  kind?: string;
  /** Explicit weight; overrides kind default when set. */
  kindWeight?: number;
  /** Whether this route currently carries control/data traffic. */
  carryingTraffic?: boolean;
};

export type RouteQosSnapshot = {
  routeId: string;
  latency: number;
  averageLatency: number;
  jitter: number;
  packetLoss: number;
  lossRatio: number;
  score: number;
  role: RouteRole;
  reachable: boolean;
  isBest: boolean;
  isCurrent: boolean;
  latencyEstimated: boolean;
  lastSeenMs: number;
  kindWeight: number;
  consecutiveLosses: number;
};

export type CommandRedundancyConfig = {
  enabled: boolean;
  minRoutes: number;
  maxRoutes: number;
  preferDiverse: boolean;
  includeDegraded: boolean;
};

export const DEFAULT_COMMAND_REDUNDANCY: CommandRedundancyConfig = {
  enabled: true,
  minRoutes: 2,
  maxRoutes: 3,
  preferDiverse: true,
  includeDegraded: false,
};

export type RouteMonitorClock = {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
};

export type RouteMonitorOptions = {
  clock?: Partial<RouteMonitorClock>;
  probeTimeoutMs?: number;
  windowSize?: number;
  ewmaAlpha?: number;
  hysteresisRatio?: number;
  hysteresisEvals?: number;
  minSwitchIntervalMs?: number;
  fastFailoverLostProbes?: number;
  fastFailoverSilenceMs?: number;
  activeIntervalMs?: number;
  standbyIntervalMs?: number;
  unreachableBaseMs?: number;
  unreachableMaxMs?: number;
  redundancy?: Partial<CommandRedundancyConfig>;
  onUpdate?: (snapshots: RouteQosSnapshot[], primaryId: string | null) => void;
  onSwitch?: (fromId: string | null, toId: string, reason: string) => void;
};

type ProbeSample = { rttMs: number | null; lost: boolean; at: number };

type RouteState = {
  id: string;
  kindWeight: number;
  carryingTraffic: boolean;
  samples: ProbeSample[];
  ewmaRtt: number | null;
  jitterMs: number;
  lastRtt: number | null;
  consecutiveLosses: number;
  lastSeenMs: number;
  lastPongMs: number;
  latencyEstimated: boolean;
  reachable: boolean;
  timer: unknown | null;
  backoffMs: number;
  probing: boolean;
};

const WINDOW = 20;
const ALPHA = 0.2;
const PROBE_TIMEOUT = 1500;
const ACTIVE_MS = 1000;
const STANDBY_MS = 3000;
const UNREACH_BASE = 5000;
const UNREACH_MAX = 30000;

function defaultClock(): RouteMonitorClock {
  return {
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  };
}

/**
 * Parallel per-route QoS monitor with hysteresis and fast failover.
 * Framework-free; inject a fake clock for tests.
 */
export class RouteMonitor {
  private readonly clock: RouteMonitorClock;
  private readonly probeTimeoutMs: number;
  private readonly windowSize: number;
  private readonly ewmaAlpha: number;
  private readonly hysteresisRatio: number;
  private readonly hysteresisEvals: number;
  private readonly minSwitchIntervalMs: number;
  private readonly fastFailoverLostProbes: number;
  private readonly fastFailoverSilenceMs: number;
  private readonly activeIntervalMs: number;
  private readonly standbyIntervalMs: number;
  private readonly unreachableBaseMs: number;
  private readonly unreachableMaxMs: number;
  private redundancy: CommandRedundancyConfig;
  private readonly onUpdate?: RouteMonitorOptions['onUpdate'];
  private readonly onSwitch?: RouteMonitorOptions['onSwitch'];

  private probeFn: RouteProbeFn | null = null;
  private routes = new Map<string, RouteState>();
  private primaryId: string | null = null;
  private lockedRouteId: string | null = null;
  private lastSwitchAt = 0;
  private hysteresisCandidate: string | null = null;
  private hysteresisCount = 0;
  private running = false;
  private redundantIds = new Set<string>();

  constructor(options: RouteMonitorOptions = {}) {
    this.clock = { ...defaultClock(), ...options.clock };
    this.probeTimeoutMs = options.probeTimeoutMs ?? PROBE_TIMEOUT;
    this.windowSize = options.windowSize ?? WINDOW;
    this.ewmaAlpha = options.ewmaAlpha ?? ALPHA;
    this.hysteresisRatio = options.hysteresisRatio ?? 0.25;
    this.hysteresisEvals = options.hysteresisEvals ?? 3;
    this.minSwitchIntervalMs = options.minSwitchIntervalMs ?? 5000;
    this.fastFailoverLostProbes = options.fastFailoverLostProbes ?? 3;
    this.fastFailoverSilenceMs = options.fastFailoverSilenceMs ?? 2000;
    this.activeIntervalMs = options.activeIntervalMs ?? ACTIVE_MS;
    this.standbyIntervalMs = options.standbyIntervalMs ?? STANDBY_MS;
    this.unreachableBaseMs = options.unreachableBaseMs ?? UNREACH_BASE;
    this.unreachableMaxMs = options.unreachableMaxMs ?? UNREACH_MAX;
    this.redundancy = { ...DEFAULT_COMMAND_REDUNDANCY, ...options.redundancy };
    this.onUpdate = options.onUpdate;
    this.onSwitch = options.onSwitch;
  }

  setProbeFn(fn: RouteProbeFn | null): void {
    this.probeFn = fn;
  }

  setRedundancy(cfg: Partial<CommandRedundancyConfig>): void {
    this.redundancy = { ...this.redundancy, ...cfg };
    this.recomputeRoles();
    this.emit();
  }

  getRedundancy(): CommandRedundancyConfig {
    return { ...this.redundancy };
  }

  /** Manual lock disables auto-switch. Pass null to unlock. */
  setLockedRoute(routeId: string | null): void {
    this.lockedRouteId = routeId;
    if (routeId && this.routes.has(routeId)) {
      this.switchPrimary(routeId, 'manual_lock');
    }
  }

  isLocked(): boolean {
    return this.lockedRouteId != null;
  }

  getPrimaryId(): string | null {
    return this.primaryId;
  }

  /** Top-N route ids for redundant command fan-out (primary first). */
  getSendRouteIds(): string[] {
    const snaps = this.snapshots();
    const primary = snaps.find((s) => s.role === 'primary');
    const redundant = snaps.filter((s) => s.role === 'redundant');
    const out: string[] = [];
    if (primary) out.push(primary.routeId);
    for (const r of redundant) out.push(r.routeId);
    return out;
  }

  /** Mark which routes currently carry open control/data channels. */
  setCarryingTraffic(routeIds: string[]): void {
    const set = new Set(routeIds);
    for (const r of this.routes.values()) {
      r.carryingTraffic = set.has(r.id) || r.id === this.primaryId || this.redundantIds.has(r.id);
    }
  }

  setRoutes(inputs: RouteMonitorInput[]): void {
    const keep = new Set(inputs.map((i) => i.id));
    for (const id of [...this.routes.keys()]) {
      if (!keep.has(id)) {
        this.clearTimer(this.routes.get(id)!);
        this.routes.delete(id);
      }
    }
    for (const input of inputs) {
      const existing = this.routes.get(input.id);
      const kindWeight =
        input.kindWeight ?? defaultKindWeight(input.kind ?? 'p2p_direct');
      if (existing) {
        existing.kindWeight = kindWeight;
        if (input.carryingTraffic != null) existing.carryingTraffic = input.carryingTraffic;
      } else {
        this.routes.set(input.id, {
          id: input.id,
          kindWeight,
          carryingTraffic: !!input.carryingTraffic,
          samples: [],
          ewmaRtt: null,
          jitterMs: 0,
          lastRtt: null,
          consecutiveLosses: 0,
          lastSeenMs: 0,
          lastPongMs: 0,
          latencyEstimated: false,
          reachable: false,
          timer: null,
          backoffMs: this.unreachableBaseMs,
          probing: false,
        });
      }
    }
    if (this.running) {
      for (const r of this.routes.values()) {
        if (!r.timer) this.schedule(r, 0);
      }
    }
    this.recomputeRoles();
    this.emit();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    for (const r of this.routes.values()) {
      this.schedule(r, 0);
    }
  }

  stop(): void {
    this.running = false;
    for (const r of this.routes.values()) {
      this.clearTimer(r);
    }
  }

  /** Record an in-band pong RTT for a route (from control WS / data channel). */
  recordInBandRtt(routeId: string, rttMs: number): void {
    const r = this.routes.get(routeId);
    if (!r) return;
    const now = this.clock.now();
    this.applyProbe(r, { ok: true, rttMs, estimated: false }, now);
    this.afterProbe(r);
  }

  /** Force one parallel probe round (e.g. after route list load). */
  async probeAll(): Promise<void> {
    const ids = [...this.routes.keys()];
    await Promise.all(ids.map((id) => this.runProbe(this.routes.get(id)!)));
    this.evaluateSwitch();
    this.recomputeRoles();
    this.emit();
  }

  snapshots(): RouteQosSnapshot[] {
    const list: RouteQosSnapshot[] = [];
    for (const r of this.routes.values()) {
      list.push(this.toSnapshot(r));
    }
    list.sort((a, b) => b.score - a.score);
    return list;
  }

  private toSnapshot(r: RouteState): RouteQosSnapshot {
    const lossRatio = this.lossRatio(r);
    const rtt = r.ewmaRtt ?? r.lastRtt ?? 9999;
    const score = r.reachable
      ? scoreRoute({
          rttMs: rtt,
          jitterMs: r.jitterMs,
          lossRatio,
          kindWeight: r.kindWeight,
        })
      : 0;
    let role: RouteRole = 'down';
    if (!r.reachable) role = 'down';
    else if (r.id === this.primaryId) role = 'primary';
    else if (this.redundantIds.has(r.id)) role = 'redundant';
    else role = 'standby';

    return {
      routeId: r.id,
      latency: r.lastRtt ?? rtt,
      averageLatency: r.ewmaRtt ?? r.lastRtt ?? 0,
      jitter: r.jitterMs,
      packetLoss: Math.round(lossRatio * 1000) / 10,
      lossRatio,
      score,
      role,
      reachable: r.reachable,
      isBest: false,
      isCurrent: r.id === this.primaryId,
      latencyEstimated: r.latencyEstimated,
      lastSeenMs: r.lastSeenMs,
      kindWeight: r.kindWeight,
      consecutiveLosses: r.consecutiveLosses,
    };
  }

  private lossRatio(r: RouteState): number {
    if (r.samples.length === 0) return r.reachable ? 0 : 1;
    const lost = r.samples.filter((s) => s.lost).length;
    return lost / r.samples.length;
  }

  private schedule(r: RouteState, delayMs: number): void {
    this.clearTimer(r);
    if (!this.running) return;
    r.timer = this.clock.setTimeout(() => {
      void this.runProbe(r).then(() => {
        this.evaluateSwitch();
        this.recomputeRoles();
        this.emit();
        this.schedule(r, this.nextInterval(r));
      });
    }, Math.max(0, delayMs));
  }

  private nextInterval(r: RouteState): number {
    if (!r.reachable) return r.backoffMs;
    if (r.carryingTraffic || r.id === this.primaryId || this.redundantIds.has(r.id)) {
      return this.activeIntervalMs;
    }
    return this.standbyIntervalMs;
  }

  private clearTimer(r: RouteState): void {
    if (r.timer != null) {
      this.clock.clearTimeout(r.timer);
      r.timer = null;
    }
  }

  private async runProbe(r: RouteState): Promise<void> {
    if (r.probing || !this.probeFn) return;
    r.probing = true;
    const now = this.clock.now();
    const timeoutMs = this.probeTimeoutMs;
    let result: ProbeResult;
    try {
      result = await Promise.race([
        this.probeFn(r.id),
        new Promise<ProbeResult>((resolve) => {
          this.clock.setTimeout(() => resolve({ ok: false }), timeoutMs);
        }),
      ]);
    } catch {
      result = { ok: false };
    }
    this.applyProbe(r, result, this.clock.now() || now);
    r.probing = false;
    this.afterProbe(r);
  }

  private applyProbe(r: RouteState, result: ProbeResult, now: number): void {
    if (result.ok && result.rttMs != null && Number.isFinite(result.rttMs)) {
      const rtt = Math.max(0, result.rttMs);
      if (r.lastRtt != null) {
        const delta = Math.abs(rtt - r.lastRtt);
        // Mean absolute consecutive RTT delta (RFC 3550 style over the window).
        const absDeltas: number[] = [];
        let prev: number | null = null;
        for (const s of r.samples) {
          if (s.rttMs == null) continue;
          if (prev != null) absDeltas.push(Math.abs(s.rttMs - prev));
          prev = s.rttMs;
        }
        if (prev != null) absDeltas.push(delta);
        r.jitterMs =
          absDeltas.length > 0
            ? absDeltas.reduce((a, b) => a + b, 0) / absDeltas.length
            : delta;
      } else {
        r.jitterMs = 0;
      }
      r.lastRtt = rtt;
      r.ewmaRtt = r.ewmaRtt == null ? rtt : this.ewmaAlpha * rtt + (1 - this.ewmaAlpha) * r.ewmaRtt;
      r.consecutiveLosses = 0;
      r.reachable = true;
      r.lastSeenMs = now;
      r.lastPongMs = now;
      r.latencyEstimated = !!result.estimated;
      r.backoffMs = this.unreachableBaseMs;
      r.samples.push({ rttMs: rtt, lost: false, at: now });
    } else {
      r.consecutiveLosses += 1;
      r.latencyEstimated = !!result.estimated;
      r.samples.push({ rttMs: null, lost: true, at: now });
      if (r.consecutiveLosses >= 1) {
        // After a loss, still reachable until we have enough evidence — but score drops via loss ratio.
        // Mark unreachable after 3 consecutive losses (aligns with fast failover).
        if (r.consecutiveLosses >= this.fastFailoverLostProbes) {
          r.reachable = false;
        }
      }
      if (!r.reachable) {
        r.backoffMs = Math.min(this.unreachableMaxMs, Math.max(this.unreachableBaseMs, r.backoffMs * 2));
      }
    }
    while (r.samples.length > this.windowSize) r.samples.shift();
  }

  private afterProbe(_r: RouteState): void {
    // hook for subclasses / tests
  }

  private evaluateSwitch(): void {
    if (this.lockedRouteId) {
      if (this.primaryId !== this.lockedRouteId && this.routes.has(this.lockedRouteId)) {
        this.switchPrimary(this.lockedRouteId, 'manual_lock');
      }
      return;
    }

    const snaps = this.snapshots().filter((s) => s.reachable);
    if (snaps.length === 0) return;

    const best = snaps[0];
    const primary = this.primaryId ? this.routes.get(this.primaryId) : null;
    const now = this.clock.now();

    // Fast failover
    if (primary) {
      const silence = primary.lastPongMs > 0 ? now - primary.lastPongMs : Infinity;
      const lost = primary.consecutiveLosses >= this.fastFailoverLostProbes;
      const silent = silence >= this.fastFailoverSilenceMs && primary.lastPongMs > 0;
      if ((lost || silent) && best.routeId !== this.primaryId && best.reachable) {
        this.hysteresisCandidate = null;
        this.hysteresisCount = 0;
        this.switchPrimary(best.routeId, lost ? 'fast_failover_loss' : 'fast_failover_silence');
        return;
      }
    }

    if (!this.primaryId) {
      this.switchPrimary(best.routeId, 'initial');
      return;
    }

    if (best.routeId === this.primaryId) {
      this.hysteresisCandidate = null;
      this.hysteresisCount = 0;
      return;
    }

    const primarySnap = snaps.find((s) => s.routeId === this.primaryId);
    const primaryScore = primarySnap?.score ?? 0;
    const beats = best.score > primaryScore * (1 + this.hysteresisRatio);

    if (!beats) {
      this.hysteresisCandidate = null;
      this.hysteresisCount = 0;
      return;
    }

    if (this.hysteresisCandidate !== best.routeId) {
      this.hysteresisCandidate = best.routeId;
      this.hysteresisCount = 1;
      return;
    }
    this.hysteresisCount += 1;
    if (
      this.hysteresisCount >= this.hysteresisEvals &&
      now - this.lastSwitchAt >= this.minSwitchIntervalMs
    ) {
      this.switchPrimary(best.routeId, 'hysteresis');
      this.hysteresisCandidate = null;
      this.hysteresisCount = 0;
    }
  }

  private switchPrimary(toId: string, reason: string): void {
    if (!this.routes.has(toId)) return;
    const from = this.primaryId;
    if (from === toId) return;
    this.primaryId = toId;
    this.lastSwitchAt = this.clock.now();
    this.recomputeRoles();
    this.onSwitch?.(from, toId, reason);
  }

  private recomputeRoles(): void {
    this.redundantIds.clear();
    const snaps = [...this.routes.values()]
      .map((r) => this.toSnapshot(r))
      .filter((s) => {
        if (!s.reachable) return false;
        if (!this.redundancy.includeDegraded && s.lossRatio > 0.1) return false;
        return true;
      })
      .sort((a, b) => b.score - a.score);

    if (!this.primaryId && snaps.length) {
      this.primaryId = snaps[0].routeId;
    }

    if (!this.redundancy.enabled || !this.primaryId) return;

    const primary = this.routes.get(this.primaryId);
    const primaryKind = primary ? this.kindBucket(primary) : '';
    const maxExtra = Math.max(0, this.redundancy.maxRoutes - 1);
    const candidates = snaps.filter((s) => s.routeId !== this.primaryId);

    const pick: string[] = [];
    if (this.redundancy.preferDiverse) {
      for (const c of candidates) {
        if (pick.length >= maxExtra) break;
        const st = this.routes.get(c.routeId);
        if (!st) continue;
        if (this.kindBucket(st) !== primaryKind || candidates.length <= maxExtra) {
          if (!pick.includes(c.routeId)) pick.push(c.routeId);
        }
      }
    }
    for (const c of candidates) {
      if (pick.length >= maxExtra) break;
      if (!pick.includes(c.routeId)) pick.push(c.routeId);
    }
    for (const id of pick) this.redundantIds.add(id);

    // Mark carrying traffic for probe cadence
    for (const r of this.routes.values()) {
      if (r.id === this.primaryId || this.redundantIds.has(r.id)) {
        r.carryingTraffic = true;
      }
    }
  }

  private kindBucket(r: RouteState): string {
    // Coarse diversity: weight bands approximate kind families.
    if (r.kindWeight >= 1.15) return 'lan';
    if (r.kindWeight >= 1.08) return 'wifi_direct';
    if (r.kindWeight >= 1.02) return 'peer_relay';
    if (r.kindWeight >= 0.9) return 'direct';
    if (r.kindWeight >= 0.7) return 'registry';
    if (r.kindWeight >= 0.4) return 'turn';
    return 'other';
  }

  private emit(): void {
    const snaps = this.snapshots();
    let bestScore = -1;
    let bestId: string | null = null;
    for (const s of snaps) {
      if (s.reachable && s.score > bestScore) {
        bestScore = s.score;
        bestId = s.routeId;
      }
    }
    for (const s of snaps) {
      s.isBest = s.routeId === bestId;
      s.isCurrent = s.routeId === this.primaryId;
    }
    this.onUpdate?.(snaps, this.primaryId);
  }
}

/**
 * Pick top-N diverse reachable routes for redundant send (pure helper).
 */
export function pickRedundantRoutes(
  routes: Array<{ id: string; score: number; reachable: boolean; kind?: string; lossRatio?: number }>,
  cfg: Partial<CommandRedundancyConfig> = {},
): string[] {
  const c = { ...DEFAULT_COMMAND_REDUNDANCY, ...cfg };
  if (!c.enabled) {
    const best = [...routes].filter((r) => r.reachable).sort((a, b) => b.score - a.score)[0];
    return best ? [best.id] : [];
  }
  let list = routes.filter((r) => r.reachable);
  if (!c.includeDegraded) {
    list = list.filter((r) => (r.lossRatio ?? 0) <= 0.1);
  }
  list.sort((a, b) => b.score - a.score);
  const out: string[] = [];
  const kinds = new Set<string>();
  for (const r of list) {
    if (out.length >= c.maxRoutes) break;
    const k = (r.kind || '').toLowerCase() || 'unknown';
    if (c.preferDiverse && kinds.has(k) && out.length < c.minRoutes) {
      // Prefer filling minRoutes with diverse kinds first; skip same-kind until needed.
      const remainingDiverse = list.some(
        (x) => !out.includes(x.id) && !kinds.has((x.kind || '').toLowerCase() || 'unknown'),
      );
      if (remainingDiverse) continue;
    }
    if (c.preferDiverse && kinds.has(k) && out.length >= c.minRoutes) continue;
    out.push(r.id);
    kinds.add(k);
  }
  // Fill up to minRoutes ignoring diversity if still short.
  if (out.length < c.minRoutes) {
    for (const r of list) {
      if (out.length >= c.minRoutes) break;
      if (!out.includes(r.id)) out.push(r.id);
    }
  }
  return out;
}
