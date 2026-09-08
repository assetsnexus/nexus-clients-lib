import { mapDataAccessApprovalError } from './data-access.js';
import { DiscoveryNamespace } from './discovery/namespace.js';
import { mapHttpStatusToCode, NexusError } from './errors/nexus-error.js';
import { GrantNamespace } from './grant/namespace.js';
import { LongRunningNamespace } from './long-running/namespace.js';
import { SubscriptionsNamespace } from './subscriptions/namespace.js';
import type { IdentityContext, TokenProvider } from './token-provider.js';
import {
  type CommandResponse,
  type RateLimitInfo,
  type SendOptions,
  type SendResult,
  isLikelyReadCommand,
} from './types.js';
import {
  type Logger,
  createIdempotencyKey,
  createRequestId,
  noopLogger,
  redactForLog,
} from './utils.js';

export type Transport = {
  request(input: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }): Promise<{
    status: number;
    headers: Headers;
    text: string;
  }>;
};

export type NexusClientOptions = {
  baseUrl: string;
  tokenProvider?: TokenProvider;
  identity?: IdentityContext | (() => IdentityContext | null);
  fetchImpl?: typeof fetch;
  transport?: Transport;
  logger?: Logger;
  defaultTimeoutMs?: number;
  maxRetries?: number;
  docsBaseUrl?: string;
};

function parseRateLimit(headers: Headers): RateLimitInfo | undefined {
  const limit = headers.get('x-nexus-ratelimit-limit');
  const remaining = headers.get('x-nexus-ratelimit-remaining');
  const reset = headers.get('x-nexus-ratelimit-reset');
  const retryAfter = headers.get('retry-after');
  if (!limit && !remaining && !reset && !retryAfter) return undefined;
  return {
    limit: limit ? Number(limit) : undefined,
    remaining: remaining ? Number(remaining) : undefined,
    reset: reset ? Number(reset) : undefined,
    retryAfterSeconds: retryAfter ? Number(retryAfter) : undefined,
  };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new NexusError('TIMEOUT', 'Aborted'));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new NexusError('TIMEOUT', 'Aborted'));
      },
      { once: true },
    );
  });
}

export class NexusClient {
  readonly grant: GrantNamespace;
  readonly subscriptions: SubscriptionsNamespace;
  readonly discovery: DiscoveryNamespace;
  readonly longRunning: LongRunningNamespace;

  private readonly baseUrl: string;
  private readonly tokenProvider?: TokenProvider;
  private readonly identity?: IdentityContext | (() => IdentityContext | null);
  private readonly fetchImpl: typeof fetch;
  private readonly transport?: Transport;
  private readonly logger: Logger;
  private readonly defaultTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly docsBaseUrl?: string;
  private circuitOpenUntil = 0;
  private consecutiveFailures = 0;

  constructor(opts: NexusClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.tokenProvider = opts.tokenProvider;
    this.identity = opts.identity;
    this.fetchImpl = opts.fetchImpl || fetch;
    this.transport = opts.transport;
    this.logger = opts.logger || noopLogger;
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? 30_000;
    this.maxRetries = opts.maxRetries ?? 2;
    this.docsBaseUrl = opts.docsBaseUrl;
    this.grant = new GrantNamespace(this);
    this.subscriptions = new SubscriptionsNamespace(this);
    this.discovery = new DiscoveryNamespace(this);
    this.longRunning = new LongRunningNamespace(this);
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = await this.tokenProvider?.getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const { status, text } = await this.rawRequest({
      method: 'GET',
      path,
      headers,
      signal,
    });
    if (status >= 400) {
      throw new NexusError(mapHttpStatusToCode(status), `GET ${path} failed: ${status}`, {
        docsBaseUrl: this.docsBaseUrl,
        meta: { body: text.slice(0, 500) },
      });
    }
    return JSON.parse(text) as T;
  }

  async send<T = unknown>(
    command: string,
    payload: Record<string, unknown> = {},
    options: SendOptions = {},
  ): Promise<SendResult<T>> {
    const requestId = options.requestId || createRequestId();
    const traceId = options.traceId || requestId;
    const isRead =
      options.isRead !== undefined ? options.isRead : isLikelyReadCommand(command);
    const idempotencyKey =
      options.idempotencyKey ||
      (options.autoIdempotency !== false && !isRead ? createIdempotencyKey() : undefined);

    const identity = this.resolveIdentity(options.identity);
    const envelope = {
      command,
      payload,
      requestId,
      traceId,
      idempotencyKey,
      identity,
      responseExpected: options.responseExpected !== false,
    };

    this.logger.debug?.('send', redactForLog({ command, requestId, traceId }) as Record<string, unknown>);

    try {
      const { status, headers, body } = await this.postCommand(
        command,
        envelope,
        options,
      );
      const rateLimit = parseRateLimit(headers);

      if (status === 429) {
        return {
          ok: false,
          kind: 'rate_limited',
          requestId,
          error: { code: 'RATE_LIMITED', message: 'Rate limited' },
          rateLimit,
        };
      }

      let response: CommandResponse;
      try {
        response = typeof body === 'string' ? JSON.parse(body) : body;
      } catch {
        return {
          ok: false,
          kind: 'error',
          requestId,
          error: { code: 'INVALID_RESPONSE', message: 'Unparseable response' },
          rateLimit,
        };
      }

      return this.mapResponse<T>(response, requestId, rateLimit);
    } catch (err) {
      if (err instanceof NexusError && err.code === 'UNAUTHORIZED' && options._authRetried !== true) {
        const refreshed = await this.tokenProvider?.refresh?.();
        if (refreshed) {
          return this.send(command, payload, {
            ...options,
            requestId,
            idempotencyKey,
            traceId,
            _authRetried: true,
          } as SendOptions & { _authRetried?: boolean });
        }
      }
      this.logger.error?.('command_exception', {
        command,
        requestId,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * Complete SCA via anx.security.auth.verify-2fa then retry the original command
   * with the **same** requestId (required for dynamic-linking / SCA correlation).
   */
  async sendWithSca<T = unknown>(
    command: string,
    payload: Record<string, unknown>,
    verify: {
      authRequestId: string;
      code: string;
      deviceId?: string;
    },
    options: SendOptions = {},
  ): Promise<SendResult<T>> {
    const requestId = options.requestId || createRequestId();
    const verifyResult = await this.verifyTwoFactor(verify);
    if (!verifyResult.ok) return verifyResult as SendResult<T>;
    return this.send<T>(command, payload, {
      ...options,
      requestId,
    });
  }

  async verifyTwoFactor(params: {
    authRequestId: string;
    code: string;
    deviceId?: string;
  }): Promise<SendResult> {
    return this.send('anx.security.auth.verify-2fa', {
      authRequestId: params.authRequestId,
      code: params.code,
      ...(params.deviceId ? { identity: { deviceId: params.deviceId } } : {}),
    });
  }

  private mapResponse<T>(
    response: CommandResponse,
    requestId: string,
    rateLimit?: RateLimitInfo,
  ): SendResult<T> {
    if (response.responseCode === 102 || response.responseCode === 202) {
      const ro = response.responseObject || {};
      const authRequestId = ro.authRequestId || response.authRequestId || null;
      const isSca =
        response.responseCode === 202 &&
        Boolean(ro.authorizationRequired || authRequestId || ro.authMethod);
      if (isSca) {
        return {
          ok: false,
          kind: 'sca_required',
          requestId,
          authRequestId,
          authorizationText: ro.authorizationText,
          dynamicFields: ro.dynamicFields,
          dynamicFieldsHash: ro.dynamicFieldsHash,
          sentTo: ro.sentTo,
          channelType: ro.channelType,
          authMethod: ro.authMethod,
          uiMetadata: ro.uiMetadata,
          error: response.errorObjects?.[0] || { code: 'SCA_REQUIRED' },
          response,
          rateLimit,
        };
      }
      return {
        ok: true,
        kind: 'accepted',
        requestId,
        data: ro as T,
        taskId: typeof ro.taskId === 'string' ? ro.taskId : undefined,
        jobId: typeof ro.jobId === 'string' ? ro.jobId : undefined,
        sessionId: typeof ro.sessionId === 'string' ? ro.sessionId : undefined,
        status: typeof ro.status === 'string' ? ro.status : undefined,
        mode: ro.mode === 'poll' || ro.mode === 'push' || ro.mode === 'poll_push' ? ro.mode : undefined,
        statusCommand: typeof ro.statusCommand === 'string' ? ro.statusCommand : undefined,
        cancelCommand: typeof ro.cancelCommand === 'string' ? ro.cancelCommand : undefined,
        pollAfterMs: typeof ro.pollAfterMs === 'number' ? ro.pollAfterMs : undefined,
        expiresAt: typeof ro.expiresAt === 'string' ? ro.expiresAt : undefined,
        channels: Array.isArray(ro.channels) ? ro.channels : undefined,
        progress: ro.progress && typeof ro.progress === 'object' ? ro.progress : undefined,
        response,
        rateLimit,
      };
    }

    if (response.responseCode === 403) {
      const primary = response.errorObjects?.[0];
      const dataAccess = mapDataAccessApprovalError(primary);
      if (dataAccess) {
        return {
          ok: false,
          kind: 'data_access_approval_required',
          requestId,
          dataAccessApproval: dataAccess,
          error: primary || { code: 'DATA_ACCESS_APPROVAL_REQUIRED' },
          response,
          rateLimit,
        };
      }
    }

    if (response.responseCode >= 400) {
      return {
        ok: false,
        kind: 'error',
        requestId,
        error:
          response.errorObjects?.[0] || {
            message: response.message || 'Command failed',
          },
        response,
        rateLimit,
      };
    }

    return {
      ok: true,
      kind: 'ok',
      data: (response.responseObject ?? response) as T,
      response,
      requestId,
      rateLimit,
    };
  }

  private resolveIdentity(
    override?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (override) return override;
    if (!this.identity) return undefined;
    const value = typeof this.identity === 'function' ? this.identity() : this.identity;
    return value || undefined;
  }

  private async postCommand(
    command: string,
    envelope: Record<string, unknown>,
    options: SendOptions,
  ): Promise<{ status: number; headers: Headers; body: string }> {
    if (Date.now() < this.circuitOpenUntil) {
      throw new NexusError('TRANSPORT_ERROR', 'Circuit breaker open', {
        docsBaseUrl: this.docsBaseUrl,
      });
    }

    let attempt = 0;
    let lastErr: unknown;
    while (attempt <= this.maxRetries) {
      attempt += 1;
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        options.timeoutMs ?? this.defaultTimeoutMs,
      );
      const signal = options.signal
        ? anySignal([options.signal, controller.signal])
        : controller.signal;

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Request-Id': String(envelope.requestId),
          'X-Trace-Id': String(envelope.traceId || envelope.requestId),
        };
        if (envelope.idempotencyKey) {
          headers['Idempotency-Key'] = String(envelope.idempotencyKey);
        }
        const token = await this.tokenProvider?.getAccessToken();
        if (token) headers.Authorization = `Bearer ${token}`;

        const result = await this.rawRequest({
          method: 'POST',
          path: `/command/${encodeURIComponent(command)}`,
          headers,
          body: JSON.stringify(envelope),
          signal,
        });
        clearTimeout(timeout);

        if (result.status === 401) {
          throw new NexusError('UNAUTHORIZED', 'Unauthorized', {
            docsBaseUrl: this.docsBaseUrl,
          });
        }

        if (result.status === 429 && attempt <= this.maxRetries) {
          const retryAfter = Number(result.headers.get('retry-after') || '1');
          await sleep(Math.max(1, retryAfter) * 1000, signal);
          continue;
        }

        if (result.status >= 500 && attempt <= this.maxRetries) {
          await sleep(2 ** (attempt - 1) * 200, signal);
          continue;
        }

        this.consecutiveFailures = 0;
        return { status: result.status, headers: result.headers, body: result.text };
      } catch (err) {
        clearTimeout(timeout);
        lastErr = err;
        if (err instanceof NexusError && !err.retryable) throw err;
        if (attempt > this.maxRetries) break;
        await sleep(2 ** (attempt - 1) * 200, options.signal);
      }
    }

    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= 5) {
      this.circuitOpenUntil = Date.now() + 15_000;
    }
    if (lastErr instanceof NexusError) throw lastErr;
    throw new NexusError(
      'TRANSPORT_ERROR',
      lastErr instanceof Error ? lastErr.message : 'Transport failed',
      { cause: lastErr, docsBaseUrl: this.docsBaseUrl },
    );
  }

  private async rawRequest(input: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }): Promise<{ status: number; headers: Headers; text: string }> {
    if (this.transport) {
      return this.transport.request(input);
    }
    const res = await this.fetchImpl(`${this.baseUrl}${input.path}`, {
      method: input.method,
      headers: input.headers,
      body: input.body,
      signal: input.signal,
    });
    return {
      status: res.status,
      headers: res.headers,
      text: await res.text(),
    };
  }
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort();
      return controller.signal;
    }
    s.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}
