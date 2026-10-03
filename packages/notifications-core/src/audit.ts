import { explainNotification, resolveNotificationTarget } from './resolve.js';
import type {
  CatalogAudit,
  InboxClassification,
  NotificationRouteExplanation,
  NotificationRouteInput,
  ResolveNotificationOptions,
} from './types.js';

export function explain(
  input: NotificationRouteInput,
  opts: ResolveNotificationOptions,
): NotificationRouteExplanation {
  return explainNotification(input, opts);
}

/** Classifies event keys with no object id. Unmapped keys land in `none`. */
export function auditCatalog(
  eventKeys: readonly string[],
  opts?: Partial<ResolveNotificationOptions>,
): CatalogAudit {
  const detail: string[] = [];
  const section: string[] = [];
  const none: string[] = [];
  const surface = opts?.surface ?? 'portal';
  for (const eventKey of eventKeys) {
    const target = resolveNotificationTarget(
      { id: `audit:${eventKey}`, eventKey, title: '', body: '' },
      { ...opts, surface },
    );
    if (target.grade === 'detail') detail.push(eventKey);
    else if (target.grade === 'section') section.push(eventKey);
    else none.push(eventKey);
  }
  return { detail, section, none };
}

export function classifyInbox(
  rows: readonly NotificationRouteInput[],
  opts: ResolveNotificationOptions,
): InboxClassification {
  const detail: NotificationRouteInput[] = [];
  const section: NotificationRouteInput[] = [];
  const none: NotificationRouteInput[] = [];
  for (const row of rows) {
    const target = resolveNotificationTarget(row, opts);
    if (target.grade === 'detail') detail.push(row);
    else if (target.grade === 'section') section.push(row);
    else none.push(row);
  }
  return {
    detail,
    section,
    none,
    counts: { detail: detail.length, section: section.length, none: none.length },
  };
}
