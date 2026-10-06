import { createHmac, timingSafeEqual } from 'crypto';
import type { NexusWebhookPayload } from './events.js';

export {
  NEXUS_WEBHOOK_EVENTS,
  type AccountErasedData,
  type AppRolesChangedData,
  type GrantFieldsChangedData,
  type GrantRevokedData,
  type NexusWebhookEvent,
  type NotificationActionData,
  type NexusWebhookPayload,
  type PermissionRequestDecidedData,
  type PrivacyRequestCancelledData,
  type PrivacyRequestCreatedData,
  type PrivacyRequestType,
  type RegulatoryStatusChangedData,
  isAccountErased,
  isAppRolesChanged,
  isNexusWebhookEvent,
  isNewerVersion,
  isPrivacyRequestCancelled,
  isPrivacyRequestCreated,
} from './events.js';

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

/**
 * Records processed `eventId`s. `add` is called only after the handler succeeded, so a failed
 * handler returns 500 and the Nexus retry is processed again. Use a shared store (database, Redis)
 * when you run more than one instance.
 */
export interface IdempotencyStore {
  has(eventId: string): boolean | Promise<boolean>;
  add(eventId: string): void | Promise<void>;
}

/** In-process store, bounded to `maxEntries` (oldest evicted first). */
export function createIdempotencyStore(opts?: { maxEntries?: number }): IdempotencyStore {
  const maxEntries = opts?.maxEntries ?? 10_000;
  const seen = new Set<string>();
  return {
    has(eventId: string): boolean {
      return seen.has(eventId);
    },
    add(eventId: string): void {
      seen.add(eventId);
      while (seen.size > maxEntries) {
        const oldest = seen.values().next().value as string;
        seen.delete(oldest);
      }
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
  idempotency?: IdempotencyStore;
  onError?: (error: unknown, payload: NexusWebhookPayload) => void;
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
    let payload: NexusWebhookPayload;
    try {
      payload = JSON.parse(raw) as NexusWebhookPayload;
    } catch {
      res.status(400).json({ error: 'invalid_payload' });
      return;
    }
    if (!payload || typeof payload.eventId !== 'string' || !payload.eventId || typeof payload.event !== 'string') {
      res.status(400).json({ error: 'invalid_payload' });
      return;
    }
    if (await store.has(payload.eventId)) {
      res.status(200).json({ ok: true, duplicate: true });
      return;
    }
    try {
      await dispatchWebhookEvent(payload, opts.handlers);
    } catch (error) {
      opts.onError?.(error, payload);
      res.status(500).json({ error: 'handler_failed' });
      return;
    }
    await store.add(payload.eventId);
    res.status(200).json({ ok: true });
  };
}
