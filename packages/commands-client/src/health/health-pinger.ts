import type { Logger } from '../utils.js';
import { noopLogger } from '../utils.js';
import {
  deprecationDedupeKey,
  headerDeprecationNotice,
  healthDeprecationNotice,
  parseAnxNodeHealth,
} from './parse-health.js';
import type { AnxNodeHealthV1, DeprecationNotice } from './types.js';

const BACKOFF_START_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000;

export type HealthPingerOptions = {
  getBaseUrl: () => string;
  /** Headers for the ping, including Authorization and X-Anx-Client when available. */
  getHeaders?: () => Promise<Record<string, string>> | Record<string, string>;
  fetchImpl?: typeof fetch;
  /** Idle gap after the last successful command. Default 5 minutes. */
  idleIntervalMs?: number;
  onReport?: (health: AnxNodeHealthV1) => void;
  onDeprecation?: (notice: DeprecationNotice) => void;
  logger?: Logger;
};

/**
 * Opt-in idle health ping. The owner calls {@link HealthPinger.touch} after
 * every successful command so a busy client does not ping. Failures use
 * exponential backoff from 5s up to 5 minutes. Deprecation notices fire once
 * per catalog fingerprint + warning signature.
 */
export class HealthPinger {
  private readonly getBaseUrl: () => string;
  private readonly getHeaders?: HealthPingerOptions['getHeaders'];
  private readonly fetchImpl: typeof fetch;
  private readonly idleIntervalMs: number;
  private readonly onReport?: (health: AnxNodeHealthV1) => void;
  private readonly onDeprecation?: (notice: DeprecationNotice) => void;
  private readonly logger: Logger;

  private timer: unknown = null;
  private stopped = true;
  private ticking = false;
  private pending: Promise<void> | null = null;
  private backoffMs = BACKOFF_START_MS;
  private readonly seenDeprecations = new Set<string>();
  private readonly invalidShapeLogged = new Set<string>();

  constructor(options: HealthPingerOptions) {
    this.getBaseUrl = options.getBaseUrl;
    this.getHeaders = options.getHeaders;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.idleIntervalMs = options.idleIntervalMs ?? 300_000;
    this.onReport = options.onReport;
    this.onDeprecation = options.onDeprecation;
    this.logger = options.logger ?? noopLogger;
  }

  start(): void {
    if (!this.stopped && this.timer != null) return;
    this.stopped = false;
    this.backoffMs = BACKOFF_START_MS;
    this.arm(this.idleIntervalMs);
  }

  /** Reset the idle timer after successful command traffic. */
  touch(): void {
    if (this.stopped) return;
    this.backoffMs = BACKOFF_START_MS;
    this.arm(this.idleIntervalMs);
  }

  stop(): void {
    this.stopped = true;
    this.clearTimer();
  }

  /** Wait for an in-flight ping (tests). */
  async settle(): Promise<void> {
    if (this.pending) await this.pending;
  }

  /**
   * Command responses may carry RFC 9745 `Deprecation`, RFC 8594 `Sunset`,
   * and `Link`. Same de-dupe key as health warnings.
   */
  noteResponseHeaders(headers: Headers, command?: string): void {
    const notice = headerDeprecationNotice({
      command,
      deprecation: headers.get('deprecation'),
      sunset: headers.get('sunset'),
      link: headers.get('link'),
    });
    if (notice) this.emitDeprecation(notice);
  }

  private arm(delayMs: number): void {
    this.clearTimer();
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.pending = this.tick().finally(() => {
        this.pending = null;
      });
    }, Math.max(0, delayMs));
  }

  private clearTimer(): void {
    if (this.timer != null) {
      clearTimeout(this.timer as ReturnType<typeof setTimeout>);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.ticking) return;
    this.ticking = true;
    const baseUrl = this.getBaseUrl().replace(/\/$/, '');
    try {
      if (!baseUrl) {
        this.logger.warn?.('health_ping_skipped', { reason: 'no_base_url' });
        this.failAndBackoff();
        return;
      }
      const headers = await this.resolveHeaders();
      const res = await this.fetchImpl(`${baseUrl}/health`, {
        method: 'GET',
        headers,
      });
      if (!res.ok) {
        this.logger.warn?.('health_ping_failed', { baseUrl, status: res.status });
        this.failAndBackoff();
        return;
      }
      const text = await res.text();
      let json: unknown;
      try {
        json = text ? (JSON.parse(text) as unknown) : undefined;
      } catch (err) {
        this.logger.warn?.('health_ping_invalid_json', {
          baseUrl,
          message: err instanceof Error ? err.message : String(err),
        });
        this.failAndBackoff();
        return;
      }
      const health = parseAnxNodeHealth(json);
      if (!health) {
        if (!this.invalidShapeLogged.has(baseUrl)) {
          this.invalidShapeLogged.add(baseUrl);
          this.logger.warn?.('health_ping_unexpected_shape', {
            baseUrl,
            message: 'HTTP 200 was not AnxNodeHealthV1; treating the node as reachable',
          });
        }
        this.backoffMs = BACKOFF_START_MS;
        this.arm(this.idleIntervalMs);
        return;
      }
      this.backoffMs = BACKOFF_START_MS;
      this.safeReport(health);
      const notice = healthDeprecationNotice(health);
      if (notice) this.emitDeprecation(notice);
      this.logger.debug?.('health_ping_ok', {
        baseUrl,
        catalogFingerprint: health.catalogFingerprint,
        status: health.status,
      });
      this.arm(this.idleIntervalMs);
    } catch (err) {
      this.logger.warn?.('health_ping_error', {
        baseUrl,
        message: err instanceof Error ? err.message : String(err),
      });
      this.failAndBackoff();
    } finally {
      this.ticking = false;
    }
  }

  private failAndBackoff(): void {
    const delay = this.backoffMs;
    this.backoffMs = Math.min(BACKOFF_MAX_MS, this.backoffMs * 2);
    this.logger.warn?.('health_ping_backoff', { delayMs: delay, nextBackoffMs: this.backoffMs });
    this.arm(delay);
  }

  private async resolveHeaders(): Promise<Record<string, string>> {
    try {
      const headers = (await this.getHeaders?.()) ?? { Accept: 'application/json' };
      if (!headers.Accept && !headers.accept) headers.Accept = 'application/json';
      return headers;
    } catch (err) {
      this.logger.warn?.('health_ping_headers_failed', {
        message: err instanceof Error ? err.message : String(err),
      });
      return { Accept: 'application/json' };
    }
  }

  private emitDeprecation(notice: DeprecationNotice): void {
    const key = deprecationDedupeKey(notice);
    if (this.seenDeprecations.has(key)) return;
    this.seenDeprecations.add(key);
    try {
      this.onDeprecation?.(notice);
    } catch (err) {
      this.logger.error?.('health_on_deprecation_failed', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private safeReport(health: AnxNodeHealthV1): void {
    try {
      this.onReport?.(health);
    } catch (err) {
      this.logger.error?.('health_on_report_failed', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
