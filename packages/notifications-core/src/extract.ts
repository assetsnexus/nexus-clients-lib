import { isSafeId } from './safe.js';
import type { ExtractedNotificationObject, NotificationRouteInput, NotificationRouteResource } from './types.js';

const ROUTE_RESOURCES = new Set<NotificationRouteResource>([
  'crm_contact',
  'crm_lead',
  'crm_campaign',
  'crm_project',
  'marketplace_product',
  'asset',
  'cluster',
  'conversation',
  'calendar_event',
  'transaction',
  'registration',
  'section',
]);

const PARAM_BY_RESOURCE: Record<string, string> = {
  crm_contact: 'contactId',
  crm_lead: 'leadId',
  crm_campaign: 'campaignId',
  crm_project: 'projectId',
  marketplace_product: 'productId',
  asset: 'assetId',
  cluster: 'clusterId',
  conversation: 'conversationId',
  calendar_event: 'eventId',
  transaction: 'transactionId',
  registration: 'registrationId',
  asset_blueprint: 'blueprintId',
  section: 'id',
};

interface Alias {
  key: string;
  resource: NotificationRouteResource;
  param: string;
  when?: (input: NotificationRouteInput) => boolean;
}

const ALIASES: readonly Alias[] = [
  { key: 'contactId', resource: 'crm_contact', param: 'contactId' },
  { key: 'campaignId', resource: 'crm_campaign', param: 'campaignId' },
  { key: 'leadId', resource: 'crm_lead', param: 'leadId' },
  { key: 'projectId', resource: 'crm_project', param: 'projectId' },
  { key: 'productId', resource: 'marketplace_product', param: 'productId' },
  { key: 'assetInstanceId', resource: 'asset', param: 'assetId' },
  { key: 'assetId', resource: 'asset', param: 'assetId' },
  { key: 'clusterId', resource: 'cluster', param: 'clusterId' },
  { key: 'conversationId', resource: 'conversation', param: 'conversationId' },
  {
    key: 'eventId',
    resource: 'calendar_event',
    param: 'eventId',
    when: (input) => readTypes(input).includes('calendar.invite'),
  },
  { key: 'transactionId', resource: 'transaction', param: 'transactionId' },
];

export function dataRecord(input: NotificationRouteInput): Record<string, unknown> {
  const data = input.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  return data;
}

function stringField(record: Record<string, unknown> | undefined, key: string): string {
  const value = record?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function readEventKey(input: NotificationRouteInput): string {
  if (typeof input.eventKey === 'string' && input.eventKey.trim()) return input.eventKey.trim();
  const fromMeta = stringField(input.meta, 'eventKey');
  if (fromMeta) return fromMeta;
  const data = dataRecord(input);
  const fromData = stringField(data, 'eventKey');
  if (fromData) return fromData;
  // Older rows stored the semantic key only as templateKey.
  const templateKey = stringField(data, 'templateKey');
  if (templateKey.includes('.')) return templateKey;
  // Membership rows always carry membershipId plus a status transition, even
  // when eventKey was not persisted.
  if (
    isSafeId(data.membershipId)
    && (stringField(data, 'nextStatus') || stringField(data, 'previousStatus'))
  ) {
    return 'org.membership.updated';
  }
  return '';
}

export function readCategoryKey(input: NotificationRouteInput): string {
  if (typeof input.categoryKey === 'string' && input.categoryKey.trim()) return input.categoryKey.trim();
  const fromMeta = stringField(input.meta, 'categoryKey');
  if (fromMeta) return fromMeta;
  return stringField(dataRecord(input), 'categoryKey');
}

export function readTags(input: NotificationRouteInput): string[] {
  if (!Array.isArray(input.tags)) return [];
  return input.tags.filter((tag): tag is string => typeof tag === 'string' && tag.length > 0);
}

/** `data.type` first (wake payloads), then the inbox `type`. */
export function readTypes(input: NotificationRouteInput): string[] {
  const out: string[] = [];
  const dataType = stringField(dataRecord(input), 'type');
  if (dataType) out.push(dataType);
  if (typeof input.type === 'string' && input.type.trim() && !out.includes(input.type.trim())) {
    out.push(input.type.trim());
  }
  return out;
}

/**
 * First safe object id.
 * Order: `data.nav`, then contact, campaign, lead, project, product,
 * asset instance / asset, cluster, conversation, calendar event (invite only), transaction.
 * An unsafe value is skipped so it cannot block a later safe id.
 */
export function extractNotificationObject(input: NotificationRouteInput): ExtractedNotificationObject | undefined {
  const data = dataRecord(input);
  const nav = data.nav;
  if (nav && typeof nav === 'object' && !Array.isArray(nav)) {
    const record = nav as Record<string, unknown>;
    const resource = typeof record.resource === 'string' ? record.resource.trim() : '';
    const id = typeof record.id === 'string' ? record.id : '';
    if ((ROUTE_RESOURCES.has(resource as NotificationRouteResource) || resource === 'asset_blueprint') && isSafeId(id)) {
      return { resource, id, param: PARAM_BY_RESOURCE[resource] || 'id' };
    }
  }
  for (const alias of ALIASES) {
    if (alias.when && !alias.when(input)) continue;
    const raw = data[alias.key];
    if (!isSafeId(raw)) continue;
    return { resource: alias.resource, id: raw, param: alias.param };
  }
  return undefined;
}

/** Safe ids keyed by the catalog param name. Does not include raw unsafe values. */
export function collectParamValues(input: NotificationRouteInput): Record<string, string> {
  const data = dataRecord(input);
  const values: Record<string, string> = {};
  const copy = (from: string, to = from) => {
    const raw = data[from];
    if (isSafeId(raw) && !values[to]) values[to] = raw;
  };
  copy('contactId');
  copy('campaignId');
  copy('leadId');
  copy('projectId');
  copy('productId');
  copy('assetInstanceId', 'assetId');
  copy('assetId');
  copy('clusterId');
  copy('conversationId');
  if (readTypes(input).includes('calendar.invite')) copy('eventId');
  copy('transactionId');
  copy('blueprintId');
  copy('grantId');
  const extracted = extractNotificationObject(input);
  if (extracted && isSafeId(extracted.id)) values[extracted.param] = extracted.id;
  return values;
}
