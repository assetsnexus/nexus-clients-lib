import type { AccessDecision, AgentAccessTarget, CoverageRow, SubscriptionLimitSwitch } from './types.js';

export type AccessCommandClient = {
  send: (command: string, payload?: Record<string, unknown>, opts?: { requestId?: string }) => Promise<unknown>;
};

const RESOLVE = 'anx.ai.agent-access.resolve';
const GRANT_CREATE = 'anx.ai.agent-access.grant.create';
const GRANT_RENEW = 'anx.ai.agent-access.grant.renew';
const PASS_PURCHASE = 'anx.ai.agent-access.pass.purchase';
const ROOMS_ATTACH = 'anx.communicate.rooms.funding.attach';
const ENTITLEMENTS = 'anx.ai-agents.entitlements.list';
const PROXY_KEYS = 'anx.inference.proxy-key.list';
const BYOK_REGISTER = 'anx.ai.byok.register';
const BYOK_DISCOVER = 'anx.ai.byok.discover-models';
const BYOK_SAVE = 'anx.ai.byok.models.save';
const BYOK_QUOTE = 'anx.ai.byok.fee-quote';
const BYOK_CONSENT = 'anx.ai.byok.fee-consent';

export class AgentAccessCommandError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly switchOffer: SubscriptionLimitSwitch | null;

  constructor(message: string, code: string, httpStatus: number, switchOffer: SubscriptionLimitSwitch | null = null) {
    super(message);
    this.name = 'AgentAccessCommandError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.switchOffer = switchOffer;
  }
}

export interface CommandOutcome<T> {
  data: T;
  sca: { authRequestId: string | null } | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function readSwitch(value: unknown): SubscriptionLimitSwitch | null {
  const row = asRecord(value);
  if (!row) return null;
  if (row.code !== 'SUBSCRIPTION_LIMIT_REACHED') return null;
  if (row.failedFunding !== 'byo' && row.failedFunding !== 'owner_resale') return null;
  if (row.alternateFunding !== 'byo' && row.alternateFunding !== 'owner_resale') return null;
  if (row.alternateFunding === row.failedFunding) return null;
  return {
    code: 'SUBSCRIPTION_LIMIT_REACHED',
    failedFunding: row.failedFunding,
    alternateFunding: row.alternateFunding,
    message: typeof row.message === 'string' ? row.message : 'Subscription limit reached',
  };
}

export function unwrapCommand<T>(result: unknown): CommandOutcome<T> {
  const row = asRecord(result);
  if (!row) return { data: result as T, sca: null };
  if (row.ok === false) {
    const kind = String(row.kind || '');
    if (kind === 'sca_required') {
      return { data: (row.data ?? {}) as T, sca: { authRequestId: (row.authRequestId as string) || null } };
    }
    const code = String(row.code || kind || 'COMMAND_FAILED');
    const status = kind === 'error' ? 400 : 409;
    throw new AgentAccessCommandError(String(row.message || code), code, status, readSwitch(row.switchOffer || row.data));
  }
  const responseCode = typeof row.responseCode === 'number' ? row.responseCode : null;
  if (responseCode === 202) {
    const body = asRecord(row.responseObject) || row;
    return { data: body as T, sca: { authRequestId: (body.authRequestId as string) || (row.authRequestId as string) || null } };
  }
  if (responseCode != null && responseCode >= 400) {
    const errors = Array.isArray(row.errorObjects) ? row.errorObjects : [];
    const first = asRecord(errors[0]);
    const body = asRecord(row.responseObject);
    const code = String(first?.code || body?.code || 'COMMAND_FAILED');
    const message = String(first?.message || body?.message || code);
    throw new AgentAccessCommandError(message, code, responseCode, readSwitch(body?.switch || body));
  }
  const data = (row.data ?? row.responseObject ?? row) as T;
  return { data, sca: null };
}

async function send<T>(client: AccessCommandClient, command: string, payload: Record<string, unknown>): Promise<CommandOutcome<T>> {
  const result = await client.send(command, payload);
  return unwrapCommand<T>(result);
}

export function createAgentAccessClient(client: AccessCommandClient) {
  return {
    resolve(target: AgentAccessTarget) {
      return send<AccessDecision>(client, RESOLVE, { target });
    },
    createGrant(payload: Record<string, unknown>) {
      return send<{ grantId?: string }>(client, GRANT_CREATE, payload);
    },
    renewGrant(grantId: string) {
      if (!grantId) throw new AgentAccessCommandError('grantId is required', 'GRANT_ID_REQUIRED', 400);
      return send<{ grantId?: string }>(client, GRANT_RENEW, { grantId });
    },
    purchasePass(payload: { target: AgentAccessTarget; amountMinor: number }) {
      if (!Number.isInteger(payload.amountMinor) || payload.amountMinor <= 0) {
        throw new AgentAccessCommandError('amountMinor must be a positive integer', 'PASS_AMOUNT_INVALID', 400);
      }
      return send<{ passId?: string; grantId?: string }>(client, PASS_PURCHASE, {
        target: payload.target,
        amountMinor: payload.amountMinor,
      });
    },
    attachToRoom(roomId: string, grantId: string) {
      if (!roomId || !grantId) {
        throw new AgentAccessCommandError('roomId and grantId are required', 'ATTACH_REQUIRED', 400);
      }
      return send<{ roomId?: string }>(client, ROOMS_ATTACH, { roomId, grantId });
    },
    async coverage(target: AgentAccessTarget): Promise<CoverageRow[]> {
      const resolved = await send<AccessDecision>(client, RESOLVE, { target });
      const decision = resolved.data;
      const fromResolve =
        decision && decision.mode === 'caller_required' && decision.options.byo ? decision.options.byo.rows : [];
      const entitlements = await send<{ rows?: CoverageRow[] }>(client, ENTITLEMENTS, {}).catch(() => ({ data: { rows: [] }, sca: null }));
      const keys = await send<{ rows?: CoverageRow[] }>(client, PROXY_KEYS, {}).catch(() => ({ data: { rows: [] }, sca: null }));
      return mergeCoverage(fromResolve, entitlements.data.rows || [], keys.data.rows || []);
    },
    async byokQuick(input: {
      providerId: string;
      apiKey: string;
      scope?: 'user' | 'org';
      idempotencyKey: string;
      agentModelKey?: string | null;
      regionId?: string;
    }) {
      if (!input.providerId || !input.apiKey || !input.idempotencyKey) {
        throw new AgentAccessCommandError('provider, key, and idempotencyKey are required', 'BYOK_INPUT_REQUIRED', 400);
      }
      const scope = input.scope || 'user';
      const registered = await send<{ providerId?: string }>(client, BYOK_REGISTER, {
        scope,
        providerId: input.providerId,
        apiKey: input.apiKey,
        idempotencyKey: input.idempotencyKey,
      });
      if (registered.sca) return { step: 'register' as const, sca: registered.sca, providerId: input.providerId };
      const providerId = registered.data.providerId || input.providerId;
      const discovered = await send<{ models?: Array<{ id?: string; modelKey?: string }> }>(client, BYOK_DISCOVER, {
        scope,
        providerId,
      });
      const models = (discovered.data.models || []).map((row) => ({
        id: row.id || row.modelKey,
        enabled: Boolean(input.agentModelKey && (row.id === input.agentModelKey || row.modelKey === input.agentModelKey)),
      }));
      if (input.agentModelKey && !models.some((row) => row.enabled)) {
        models.forEach((row) => {
          if (row.id === input.agentModelKey) row.enabled = true;
        });
      }
      const quote = await send<{ consentRequired?: boolean }>(client, BYOK_QUOTE, { scope, providerId, regionId: input.regionId });
      if (quote.data.consentRequired) {
        const consent = await send<unknown>(client, BYOK_CONSENT, {
          scope,
          providerId,
          accepted: true,
          regionId: input.regionId,
        });
        if (consent.sca) return { step: 'fee-consent' as const, sca: consent.sca, providerId };
      }
      const saved = await send<unknown>(client, BYOK_SAVE, {
        scope,
        providerId,
        models: models.filter((row) => row.enabled && row.id),
        ...(quote.data.consentRequired ? { feeConsentAccepted: true } : {}),
        ...(input.regionId ? { regionId: input.regionId } : {}),
      });
      if (saved.sca) return { step: 'models.save' as const, sca: saved.sca, providerId };
      return { step: 'saved' as const, sca: null, providerId, models };
    },
  };
}

function mergeCoverage(...groups: CoverageRow[][]): CoverageRow[] {
  const byId = new Map<string, CoverageRow>();
  for (const group of groups) {
    for (const row of group) {
      if (!row || !row.id) continue;
      const prev = byId.get(row.id);
      byId.set(row.id, prev ? { ...prev, ...row, covers: { ...prev.covers, ...row.covers } } : row);
    }
  }
  return [...byId.values()];
}

export type AgentAccessClient = ReturnType<typeof createAgentAccessClient>;
