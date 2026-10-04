import type { NexusClient } from '../client.js';
import { NexusError } from '../errors/nexus-error.js';
import type { SendResult } from '../types.js';

export type PermissionRequestStatus = 'open' | 'decided' | 'revoked';

export type PermissionRequestSnapshot = {
  requestId: string;
  status: PermissionRequestStatus | string;
  approvalUrl: string | null;
  items: Array<{
    itemId?: string;
    kind?: string;
    decision?: string;
    commandName?: string;
    dataDomain?: string;
  }>;
};

export type CommandSender = {
  send<T = unknown>(
    command: string,
    payload?: Record<string, unknown>,
  ): Promise<SendResult<T>>;
};

const LIST = 'anx.permission-grants.requests.list';
const RETURN_STATUSES = new Set(['approved', 'denied', 'pending']);

function requireHttpUrl(raw: string, name: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new NexusError('INVALID_RESPONSE', `${name} must be an absolute http(s) URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new NexusError('INVALID_RESPONSE', `${name} must use http or https`);
  }
  if (url.username || url.password) {
    throw new NexusError('INVALID_RESPONSE', `${name} must not include credentials`);
  }
  return url;
}

/** Reads `permission_request` and `status` after the portal sends the user back. */
export function parsePermissionRequestReturn(
  raw: string,
): { requestId: string; status: 'approved' | 'denied' | 'pending' } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const requestId = (url.searchParams.get('permission_request') || '').trim();
  const status = (url.searchParams.get('status') || '').trim();
  if (!requestId || !RETURN_STATUSES.has(status)) return null;
  return { requestId, status: status as 'approved' | 'denied' | 'pending' };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new NexusError('TIMEOUT', 'waitForDecision aborted'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new NexusError('TIMEOUT', 'waitForDecision aborted'));
      },
      { once: true },
    );
  });
}

function asSnapshot(row: Record<string, unknown>, fallbackUrl: string | null): PermissionRequestSnapshot | null {
  const requestId = typeof row.requestId === 'string' ? row.requestId : '';
  if (!requestId) return null;
  const status = typeof row.status === 'string' ? row.status : 'open';
  const approvalUrl = typeof row.approvalUrl === 'string' ? row.approvalUrl : fallbackUrl;
  const items = Array.isArray(row.items)
    ? row.items.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    : [];
  return {
    requestId,
    status,
    approvalUrl,
    items: items.map((item) => ({
      ...(typeof item.itemId === 'string' ? { itemId: item.itemId } : {}),
      ...(typeof item.kind === 'string' ? { kind: item.kind } : {}),
      ...(typeof item.decision === 'string' ? { decision: item.decision } : {}),
      ...(typeof item.commandName === 'string' ? { commandName: item.commandName } : {}),
      ...(typeof item.dataDomain === 'string' ? { dataDomain: item.dataDomain } : {}),
    })),
  };
}

/**
 * 403 PERMISSION_ELEVATION_REQUIRED for an app command inside the requestable ceiling.
 * `approvalUrl` is the portal path from the region. `waitForDecision` polls
 * `anx.permission-grants.requests.list` until the request leaves `open`.
 */
export class ElevationRequiredError extends NexusError {
  readonly approvalUrl: string;
  readonly elevationRequestId: string;
  readonly command: string | null;

  constructor(input: {
    approvalUrl?: string | null;
    elevationRequestId: string;
    command?: string | null;
    message?: string;
  }) {
    const approvalUrl = input.approvalUrl?.trim() || '';
    super('PERMISSION_ELEVATION_REQUIRED', input.message || 'Permission elevation required.', {
      meta: {
        approvalUrl,
        elevationRequestId: input.elevationRequestId,
        command: input.command ?? null,
      },
    });
    this.name = 'ElevationRequiredError';
    this.approvalUrl = approvalUrl;
    this.elevationRequestId = input.elevationRequestId;
    this.command = input.command ?? null;
  }

  /**
   * Portal URL for the permission-request page, with `return_to` for the app.
   * Relative approval paths stay on `portalOrigin`. A different host is rejected.
   */
  buildRedirectUrl(input: { portalOrigin: string; returnTo: string }): string {
    if (!this.approvalUrl) {
      throw new NexusError('INVALID_RESPONSE', 'Permission request is missing approvalUrl');
    }
    const portal = requireHttpUrl(input.portalOrigin, 'portalOrigin');
    const back = requireHttpUrl(input.returnTo, 'returnTo');
    let approval: URL;
    try {
      approval = new URL(this.approvalUrl, `${portal.origin}/`);
    } catch {
      throw new NexusError('INVALID_RESPONSE', 'approvalUrl is not a URL');
    }
    if (approval.protocol !== 'http:' && approval.protocol !== 'https:') {
      throw new NexusError('INVALID_RESPONSE', 'approvalUrl must use http or https');
    }
    if (approval.origin !== portal.origin) {
      throw new NexusError('INVALID_RESPONSE', 'approvalUrl must stay on the portal origin');
    }
    approval.searchParams.set('return_to', back.toString());
    return approval.toString();
  }

  static fromSendResult(result: SendResult): ElevationRequiredError | null {
    if (result.ok || result.kind !== 'permission_elevation_required') return null;
    const details = result.error.details || {};
    const fromDetails =
      typeof details.elevationRequestId === 'string' ? details.elevationRequestId.trim() : '';
    const fromLegacy =
      typeof details.elevationId === 'string' ? details.elevationId.trim() : '';
    const elevationRequestId =
      fromDetails || result.permissionElevation.elevationRequestId || fromLegacy || '';
    if (!elevationRequestId) return null;
    const approvalUrl =
      (typeof details.approvalUrl === 'string' && details.approvalUrl.trim()) ||
      result.permissionElevation.approvalUrl ||
      '';
    const command =
      (typeof details.command === 'string' && details.command) ||
      result.permissionElevation.command ||
      null;
    return new ElevationRequiredError({
      approvalUrl,
      elevationRequestId,
      command,
      message: result.error.message || result.permissionElevation.message,
    });
  }

  async waitForDecision(
    client: CommandSender | NexusClient,
    opts: { timeoutMs?: number; pollAfterMs?: number; signal?: AbortSignal } = {},
  ): Promise<PermissionRequestSnapshot> {
    const timeoutMs = opts.timeoutMs ?? 120_000;
    const pollAfterMs = Math.max(200, opts.pollAfterMs ?? 1_500);
    const started = Date.now();
    while (true) {
      if (opts.signal?.aborted) {
        throw new NexusError('TIMEOUT', 'waitForDecision aborted');
      }
      if (Date.now() - started > timeoutMs) {
        throw new NexusError('TIMEOUT', `waitForDecision timed out after ${timeoutMs}ms`, {
          meta: { elevationRequestId: this.elevationRequestId },
        });
      }
      const res = await client.send<{ requests?: unknown[] }>(LIST, {});
      if (res.ok && res.kind === 'ok') {
        const rows = Array.isArray(res.data?.requests) ? res.data.requests : [];
        for (const row of rows) {
          if (!row || typeof row !== 'object') continue;
          const snap = asSnapshot(row as Record<string, unknown>, this.approvalUrl || null);
          if (!snap || snap.requestId !== this.elevationRequestId) continue;
          if (snap.status !== 'open') return snap;
        }
      }
      await sleep(pollAfterMs, opts.signal);
    }
  }
}
