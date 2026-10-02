import { createHmac, timingSafeEqual } from 'crypto';
import type { NexusWebhookPayload } from './events.js';

export {
  APP_SUBSCRIPTION_EVENTS,
  isAppSubscriptionEvent,
  type AgentFundingChangedData,
  type AppConfigChangedData,
  type AppRolesChangedData,
  type AppSubscriptionData,
  type AppSubscriptionEvent,
  type AppUserBlockedData,
  type AppUserUnblockedData,
  type GrantAccessRevokedData,
  type GrantFieldsChangedData,
  type GrantResourceScopeChangedData,
  type GrantRevokedData,
  type NexusWebhookEvent,
  type NexusWebhookPayload,
  type PermissionRequestDecidedData,
  type RegulatoryStatusChangedData,
} from './events.js';
export { isNewerVersion } from './version.js';

export function verifySignature(
  rawBody: string | Buffer,
  headers: Record<string, string | string[] | undefined>,
  secret: string | string[],
  opts?: { toleranceSeconds?: number },
): boolean {
  const header =
    (headers['x-nexus-signature'] as string) ||
    (headers['X-Nexus-Signature'] as string) ||
    '';
  if (!header) return false;
  if (rawBody === undefined || rawBody === null) return false;
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  // Empty body is only valid if the partner truly sent empty bytes; treat missing Buffer as fail-closed.
  if (typeof rawBody !== 'string' && !Buffer.isBuffer(rawBody)) return false;
  const secrets = Array.isArray(secret) ? secret : [secret];
  const tolerance = opts?.toleranceSeconds ?? 300;
  let t: number | undefined;
  const presentedList: string[] = [];
  for (const part of header.split(',')) {
    const trimmed = part.trim();
    if (trimmed.startsWith('t=')) t = Number(trimmed.slice(2));
    if (trimmed.startsWith('v1=')) presentedList.push(trimmed.slice(3));
  }
  if (!t || !Number.isFinite(t) || Math.abs(Math.floor(Date.now() / 1000) - t) > tolerance) {
    return false;
  }
  if (!presentedList.length) return false;
  for (const s of secrets.filter(Boolean)) {
    const expected = createHmac('sha256', s).update(`${t}.${body}`).digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf8');
    for (const presented of presentedList) {
      const presentedBuf = Buffer.from(presented, 'utf8');
      if (
        expectedBuf.length === presentedBuf.length &&
        timingSafeEqual(expectedBuf, presentedBuf)
      ) {
        return true;
      }
    }
  }
  return false;
}

export function createIdempotencyStore() {
  const seen = new Set<string>();
  return {
    seen(eventId: string): boolean {
      if (seen.has(eventId)) return true;
      seen.add(eventId);
      return false;
    },
  };
}

export type WebhookHandlers = {
  [E in NexusWebhookPayload['event']]?: (
    payload: Extract<NexusWebhookPayload, { event: E }>,
  ) => void | Promise<void>;
};

export async function dispatchWebhookEvent(
  payload: NexusWebhookPayload,
  handlers: WebhookHandlers,
): Promise<void> {
  const handler = handlers[payload.event] as
    | ((payload: NexusWebhookPayload) => void | Promise<void>)
    | undefined;
  if (handler) await handler(payload);
}

export function expressAdapter(opts: {
  secret: string | string[];
  handlers: WebhookHandlers;
  idempotency?: ReturnType<typeof createIdempotencyStore>;
}) {
  const store = opts.idempotency || createIdempotencyStore();
  return async (req: any, res: any) => {
    // Fail closed: HMAC must be over the exact wire bytes. Never re-serialize req.body.
    if (typeof req.rawBody !== 'string' && !Buffer.isBuffer(req.rawBody)) {
      res.status(400).json({ error: 'raw_body_required' });
      return;
    }
    const raw =
      typeof req.rawBody === 'string' ? req.rawBody : req.rawBody.toString('utf8');
    if (!verifySignature(raw, req.headers || {}, opts.secret)) {
      res.status(401).json({ error: 'invalid_signature' });
      return;
    }
    const payload = (typeof req.body === 'object' && req.body
      ? req.body
      : JSON.parse(raw)) as NexusWebhookPayload;
    if (!payload || typeof payload.eventId !== 'string' || !payload.eventId || typeof payload.event !== 'string') {
      res.status(400).json({ error: 'invalid_payload' });
      return;
    }
    if (await store.seen(payload.eventId)) {
      res.status(200).json({ ok: true, duplicate: true });
      return;
    }
    await dispatchWebhookEvent(payload, opts.handlers);
    res.status(200).json({ ok: true });
  };
}

export async function completePrivacyRequest(
  client: { send: (cmd: string, payload: Record<string, unknown>) => Promise<unknown> },
  requestId: string,
  outcome: { status: 'completed' | 'refused'; artifactUrl?: string; refusalReason?: string },
): Promise<unknown> {
  return client.send('anx.oauth2.privacy.request.complete', {
    requestId,
    ...outcome,
  });
}
