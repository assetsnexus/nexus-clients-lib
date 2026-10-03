import { extractNotificationObject, readCategoryKey, readEventKey, readTypes } from './extract.js';
import { isSafeId } from './safe.js';
import type { NotificationAskContext, NotificationAskContextBody, NotificationRouteInput } from './types.js';

/** Chat entity types the agent can resolve. CRM and asset rows are not in this set. */
export const CHAT_ENTITY_REFERENCE_TYPES: readonly string[] = [
  'cluster',
  'marketplace_product',
  'asset_blueprint',
];

const CHAT_TYPES = new Set(CHAT_ENTITY_REFERENCE_TYPES);
const BODY_LIMIT = 500;

function compactDefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(compactDefined).filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const next = compactDefined(child);
      if (next !== undefined) out[key] = next;
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number' && !Number.isFinite(value)) return undefined;
  return value;
}

function formatAskContextObject(object: NotificationAskContextBody): string {
  const compact = compactDefined(object);
  if (!compact || typeof compact !== 'object') return '';
  return JSON.stringify(compact);
}

function createdAtIso(value: Date | string | undefined): string | undefined {
  if (value instanceof Date) {
    const ms = value.getTime();
    if (Number.isNaN(ms)) return undefined;
    return value.toISOString();
  }
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

/**
 * Shared Ask AI payload. Context is the row summary only — never the raw `data` bag.
 * Body is truncated to 500 characters. Both clients must send `formatAskFragment` of this result.
 */
export function buildNotificationAskContext(input: NotificationRouteInput): NotificationAskContext {
  const references: NotificationAskContext['references'] = [
    { type: 'notification', entityId: input.id },
  ];
  const extracted = extractNotificationObject(input);
  if (extracted && CHAT_TYPES.has(extracted.resource) && isSafeId(extracted.id)) {
    references.push({ type: extracted.resource, entityId: extracted.id });
  }
  const title = typeof input.title === 'string' ? input.title : '';
  const body = typeof input.body === 'string' ? input.body.slice(0, BODY_LIMIT) : '';
  const types = readTypes(input);
  const context: NotificationAskContextBody = {
    id: input.id,
    title: title || undefined,
    body: body || undefined,
    eventKey: readEventKey(input) || undefined,
    categoryKey: readCategoryKey(input) || undefined,
    type: types[0],
    createdAt: createdAtIso(input.createdAt),
    sender: typeof input.source?.kind === 'string' && input.source.kind ? input.source.kind : undefined,
  };
  return { references, context, label: title };
}

/**
 * `@type:id` tokens plus the compact context JSON.
 * Same shape as the portal `buildAskReferenceFragment`.
 */
export function formatAskFragment(ask: NotificationAskContext): string {
  const tokens = (ask.references || [])
    .map((ref) => {
      const type = String(ref?.type || '').trim();
      const id = String(ref?.entityId || '').trim();
      if (!type || !id) return '';
      return `@${type}:${id}`;
    })
    .filter(Boolean);
  const objectText = formatAskContextObject(ask.context);
  return [tokens.join(' '), objectText].filter(Boolean).join(' ');
}
