/**
 * HTTP transport that pins each call to the best region origin and fails over
 * across {@link RegionRoutes}. Background {@link RouteMonitor} probes
 * `GET {origin}/health` and may switch back when a recovered route scores
 * better by {@link RoutedTransportOptions.hysteresisMargin}.
 */

import { NexusError } from '../errors/nexus-error.js';
import { hasIdempotencyHeader } from '../idempotency.js';
import {
  canonicalRouteUrl,
  kindWeightFromPriority,
  type RegionRoute,
  type RegionRouteKind,
  type RegionRoutes,
} from '../regions/region-routes.js';
import { type Logger, noopLogger } from '../utils.js';
import {
  classifyTransportFailure,
  shouldFailoverFailure,
  shouldFailoverHttpStatus,
  type RouteAttemptClass,
  type TransportFailureKind,
} from './failover-policy.js';
import { parseRegionRedirect } from './region-redirect.js';
import { RouteMonitor, type RouteMonitorClock, type RouteProbeFn } from './route-monitor.js';
import { resolveRoutes, type RouteCandidateInput } from './route-resolver.js';

export type RoutedTransportRequest = {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
};

export type RoutedTransportResponse = {
  status: number;
  headers: Headers;
  text: string;
};

export type RouteSwitchHandler = (fromUrl: string | null, toUrl: string, reason: string) => void;

export type RegionRedirectEvent = {
  fromUrl: string | null;
  endpoints: string[];
};

export type RegionRedirectHandler = (event: RegionRedirectEvent) => void;

export type RouteClassifyFn = (input: RoutedTransportRequest) => {
  isRead: boolean;
  idempotent: boolean;
};

export type RoutedRouteSnapshot = {
  id: string;
  url: string;
  priority: number;
  kind?: RegionRouteKind;
  score: number;
  failed: boolean;
  active: boolean;
  rttMs: number | null;
  lossRatio: number;
  probeOk: boolean;
};

export type RoutedTransportOptions = {
  routes: RegionRoutes;
  fetchImpl?: typeof fetch;
  /** Background health probe interval. Default 30s. */
  probeIntervalMs?: number;
  /** Score points a recovered route must beat the active route by. Default 10. */
  hysteresisMargin?: number;
  /**
   * Allow non-localhost http endpoints adopted from a region redirect.
   * Initial `routes` are used as given (callers validate via parseRegionRoutes).
   */
  allowHttp?: boolean;
  classify?: RouteClassifyFn;
  onRouteSwitch?: RouteSwitchHandler;
  onRegionRedirect?: RegionRedirectHandler;
  logger?: Logger;
  /** Injected into RouteMonitor. Tests pass a fake clock. */
  clock?: Partial<RouteMonitorClock>;
};

type LiveRoute = {
  id: string;
  url: string;
  priority: number;
  kind?: RegionRouteKind;
  failed: boolean;
  rttMs?: number;
  lossRatio: number;
  probeOk: boolean;
};

const DEFAULT_PROBE_MS = 30_000;
const DEFAULT_MARGIN = 10;
/** Unmeasured routes share this RTT so priority (kind weight) decides order. */
const UNMEASURED_RTT_MS = 50;
const MAX_ATTEMPTS = 16;

export class RoutedTransport {
  private readonly fetchImpl: typeof fetch;
  private readonly logger: Logger;
  private readonly probeIntervalMs: number;
  private readonly hysteresisMargin: number;
  private readonly allowHttp: boolean;
  private readonly classify?: RouteClassifyFn;
  private readonly onRouteSwitch?: RouteSwitchHandler;
  private readonly onRegionRedirect?: RegionRedirectHandler;
  private readonly monitor: RouteMonitor;

  private routes = new Map<string, LiveRoute>();
  private activeId: string | null = null;
  private redirectAdopted = false;

  constructor(options: RoutedTransportOptions) {
    if (!options.routes?.routes?.length) {
      throw new NexusError('TRANSPORT_ERROR', 'RoutedTransport requires at least one route');
    }
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.logger = options.logger ?? noopLogger;
    this.probeIntervalMs = options.probeIntervalMs ?? DEFAULT_PROBE_MS;
    this.hysteresisMargin = options.hysteresisMargin ?? DEFAULT_MARGIN;
    this.allowHttp = options.allowHttp === true;
    this.classify = options.classify;
    this.onRouteSwitch = options.onRouteSwitch;
    this.onRegionRedirect = options.onRegionRedirect;

    this.replaceRoutes(options.routes.routes, false);

    const interval = this.probeIntervalMs;
    this.monitor = new RouteMonitor({
      clock: options.clock,
      probeTimeoutMs: Math.min(10_000, interval),
      activeIntervalMs: interval,
      standbyIntervalMs: interval,
      unreachableBaseMs: interval,
      unreachableMaxMs: Math.max(interval, DEFAULT_PROBE_MS),
      onUpdate: () => {
        /* QoS is applied in probe(); promotion runs there too. */
      },
    });
    this.monitor.setProbeFn(this.probe);
    this.syncMonitorRoutes();
    this.monitor.start();
  }

  /** Current primary origin without a trailing slash. */
  getPrimaryOrigin(): string {
    const active = this.activeId ? this.routes.get(this.activeId) : undefined;
    return (active?.url ?? '').replace(/\/$/, '');
  }

  snapshots(): RoutedRouteSnapshot[] {
    const scores = this.scoreAll();
    return scores.map((row) => {
      const live = this.routes.get(row.id)!;
      return {
        id: live.id,
        url: live.url,
        priority: live.priority,
        kind: live.kind,
        score: row.score,
        failed: live.failed,
        active: live.id === this.activeId,
        rttMs: live.rttMs ?? null,
        lossRatio: live.lossRatio,
        probeOk: live.probeOk,
      };
    });
  }

  stop(): void {
    this.monitor.stop();
  }

  async request(input: RoutedTransportRequest): Promise<RoutedTransportResponse> {
    if (input.signal?.aborted) {
      throw new NexusError('TIMEOUT', 'Aborted', { meta: { path: input.path } });
    }

    const attempt = this.classifyAttempt(input);
    const attempted = new Set<string>();
    let hops = 0;
    let lastError: NexusError | undefined;

    while (hops < MAX_ATTEMPTS) {
      hops += 1;
      if (input.signal?.aborted) {
        throw (
          lastError ??
          new NexusError('TIMEOUT', 'Aborted', { meta: { path: input.path } })
        );
      }
      const route = this.selectRoute(attempted);
      if (!route) break;
      attempted.add(route.id);

      let response: RoutedTransportResponse;
      try {
        response = await this.sendOnce(route, input);
      } catch (err) {
        const kind = classifyTransportFailure(err);
        this.markFailed(route.id);
        lastError = this.toTransportError(err, kind, route.url);
        this.logger.warn?.('route_request_failed', {
          url: route.url,
          kind,
          method: input.method,
          path: input.path,
          message: lastError.message,
        });
        if (!shouldFailoverFailure(kind, attempt) || !this.hasAnother(attempted)) {
          throw lastError;
        }
        continue;
      }

      const redirect = parseRegionRedirect(response.status, response.text);
      if (redirect.redirect && !this.redirectAdopted && redirect.endpoints.length > 0) {
        const adopted = this.adoptRedirect(redirect.endpoints, route.url);
        if (adopted > 0) {
          attempted.clear();
          continue;
        }
      }

      if (shouldFailoverHttpStatus(response.status)) {
        this.markFailed(route.id);
        this.logger.warn?.('route_http_failover', {
          url: route.url,
          status: response.status,
          method: input.method,
          path: input.path,
        });
        if (this.hasAnother(attempted)) continue;
        return response;
      }

      return response;
    }

    throw (
      lastError ??
      new NexusError('TRANSPORT_ERROR', 'No region route available', {
        meta: { path: input.path },
      })
    );
  }

  private classifyAttempt(input: RoutedTransportRequest): RouteAttemptClass {
    const method = input.method.toUpperCase();
    const hinted = this.classify?.(input);
    const isRead = method === 'GET' || method === 'HEAD' || hinted?.isRead === true;
    const idempotent = hinted?.idempotent === true || hasIdempotencyHeader(input.headers);
    return { isRead, idempotent };
  }

  private selectRoute(attempted: Set<string>): LiveRoute | undefined {
    if (this.activeId && !attempted.has(this.activeId)) {
      const active = this.routes.get(this.activeId);
      if (active && !active.failed) return active;
    }
    const next = this.scoreAll().find((row) => !row.failed && !attempted.has(row.id));
    if (!next) return undefined;
    const live = this.routes.get(next.id);
    if (!live) return undefined;
    this.setActive(live.id, 'failover');
    return live;
  }

  private hasAnother(attempted: Set<string>): boolean {
    for (const route of this.routes.values()) {
      if (!route.failed && !attempted.has(route.id)) return true;
    }
    return false;
  }

  private async sendOnce(
    route: LiveRoute,
    input: RoutedTransportRequest,
  ): Promise<RoutedTransportResponse> {
    const url = joinUrl(route.url, input.path);
    this.logger.debug?.('route_request', { url, method: input.method });
    const started = Date.now();
    const res = await this.fetchImpl(url, {
      method: input.method,
      headers: input.headers,
      body: input.body,
      signal: input.signal,
    });
    const text = await res.text();
    const rtt = Date.now() - started;
    if (rtt > 0 && res.status < 500) route.rttMs = rtt;
    return { status: res.status, headers: res.headers, text };
  }

  private adoptRedirect(endpoints: string[], fromUrl: string): number {
    const next: RegionRoute[] = [];
    for (let i = 0; i < endpoints.length && next.length < 8; i += 1) {
      const url = canonicalRouteUrl(endpoints[i], this.allowHttp);
      if (!url) {
        this.logger.warn?.('region_redirect_skipped_url', { url: endpoints[i] });
        continue;
      }
      next.push({ url, priority: i, kind: 'alternative' });
    }
    if (next.length === 0) return 0;

    this.redirectAdopted = true;
    const previous = fromUrl;
    this.replaceRoutes(next, false);
    this.syncMonitorRoutes();
    this.onRegionRedirect?.({ fromUrl: previous, endpoints: next.map((route) => route.url) });
    this.logger.info?.('region_redirect', {
      from: previous,
      endpoints: next.map((route) => route.url),
    });
    if (this.activeId) {
      const active = this.routes.get(this.activeId);
      if (active && active.url !== previous) {
        this.onRouteSwitch?.(previous, active.url, 'region_redirect');
        this.logger.info?.('route_switch', {
          from: previous,
          to: active.url,
          reason: 'region_redirect',
        });
      }
    }
    return next.length;
  }

  private replaceRoutes(list: RegionRoute[], notify: boolean): void {
    const previous = this.activeId ? this.routes.get(this.activeId)?.url ?? null : null;
    this.routes = new Map();
    const sorted = [...list].sort((a, b) => a.priority - b.priority);
    for (const route of sorted) {
      if (this.routes.has(route.url)) continue;
      this.routes.set(route.url, {
        id: route.url,
        url: route.url,
        priority: route.priority,
        kind: route.kind,
        failed: false,
        lossRatio: 0,
        probeOk: false,
      });
    }
    const first = this.scoreAll().find((row) => !row.failed);
    this.activeId = first?.id ?? null;
    if (notify && this.activeId) {
      const active = this.routes.get(this.activeId);
      if (active) this.fireSwitch(previous, active.url, 'routes_replaced');
    }
  }

  private syncMonitorRoutes(): void {
    this.monitor.setRoutes(
      [...this.routes.values()].map((route) => ({
        id: route.id,
        kind: route.kind ?? 'primary',
        kindWeight: kindWeightFromPriority(route.priority),
      })),
    );
  }

  private readonly probe: RouteProbeFn = async (routeId) => {
    const route = this.routes.get(routeId);
    if (!route) return { ok: false };
    const started = Date.now();
    try {
      const res = await this.fetchImpl(`${originOf(route.url)}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const rttMs = Math.max(1, Date.now() - started);
      if (res.ok) {
        route.failed = false;
        route.lossRatio = 0;
        route.rttMs = rttMs;
        route.probeOk = true;
        this.maybePromote('probe_recovered');
        return { ok: true, rttMs };
      }
      this.logger.debug?.('route_probe_failed', { url: route.url, status: res.status });
      return { ok: false, rttMs };
    } catch (err) {
      this.logger.debug?.('route_probe_error', {
        url: route.url,
        message: err instanceof Error ? err.message : String(err),
      });
      return { ok: false };
    }
  };

  /**
   * Switch back only after a successful probe, and only when the candidate
   * beats the active route by the hysteresis margin. Avoids flapping.
   */
  private maybePromote(reason: string): void {
    const ranked = this.scoreAll().filter((row) => !row.failed && row.probeOk);
    const best = ranked[0];
    if (!best || best.id === this.activeId) return;
    const active = this.activeId ? this.routes.get(this.activeId) : undefined;
    if (!active || active.failed) {
      this.setActive(best.id, reason);
      return;
    }
    const current = this.scoreAll().find((row) => row.id === active.id);
    const currentScore = current && !current.failed ? current.score : 0;
    if (best.score >= currentScore + this.hysteresisMargin) {
      this.setActive(best.id, reason);
    }
  }

  private setActive(id: string, reason: string): void {
    if (this.activeId === id) return;
    const from = this.activeId ? this.routes.get(this.activeId)?.url ?? null : null;
    const next = this.routes.get(id);
    if (!next) return;
    this.activeId = id;
    this.fireSwitch(from, next.url, reason);
  }

  private fireSwitch(from: string | null, to: string, reason: string): void {
    if (from === to) return;
    this.onRouteSwitch?.(from, to, reason);
    this.logger.info?.('route_switch', { from, to, reason });
  }

  private markFailed(id: string): void {
    const route = this.routes.get(id);
    if (!route) return;
    route.failed = true;
    route.lossRatio = 1;
  }

  private scoreAll(): Array<{ id: string; score: number; failed: boolean; probeOk: boolean }> {
    const candidates: RouteCandidateInput[] = [...this.routes.values()].map((route) => ({
      id: route.id,
      kind: route.kind ?? 'primary',
      kindWeight: kindWeightFromPriority(route.priority),
      url: route.url,
      rttMs: route.rttMs ?? UNMEASURED_RTT_MS,
      jitterMs: 0,
      lossRatio: route.failed ? 1 : route.lossRatio,
      failed: route.failed,
    }));
    const resolved = resolveRoutes(candidates);
    return resolved.map((row) => {
      const live = this.routes.get(row.id);
      return {
        id: row.id,
        score: row.score,
        failed: live?.failed === true || !row.reachable,
        probeOk: live?.probeOk === true,
      };
    });
  }

  private toTransportError(err: unknown, kind: TransportFailureKind, url: string): NexusError {
    if (err instanceof NexusError) return err;
    const message = err instanceof Error ? err.message : 'Transport failed';
    const code = kind === 'timeout' ? 'TIMEOUT' : 'TRANSPORT_ERROR';
    return new NexusError(code, message, { cause: err, meta: { url, kind } });
  }
}

function joinUrl(base: string, path: string): string {
  const trimmed = base.replace(/\/$/, '');
  if (!path) return trimmed;
  return path.startsWith('/') ? `${trimmed}${path}` : `${trimmed}/${path}`;
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url.replace(/\/$/, '');
  }
}
