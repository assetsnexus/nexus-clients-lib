/**
 * Notification listeners and filters.
 *
 * A host needs to react to notifications without polling or re-implementing the
 * routing rules: show a toast, refresh a badge, open a panel, or forward a
 * specific category to its own analytics. This module is the subscription rail.
 *
 * It is deliberately transport-free: the host pushes whatever it received (an
 * SSE frame, a polled inbox page, a webhook relay) and the listener decides
 * whether it matches. No notification body is stored here.
 */
import { keyMatches } from './catalog.js';
import type { NotificationRouteResource } from './types.js';

/** The fields a filter can look at. Extra fields are ignored. */
export type NotificationLike = {
  id?: string;
  categoryKey?: string;
  eventKey?: string;
  resource?: string;
  appClientId?: string;
  urgency?: string;
  [key: string]: unknown;
};

export type NotificationUrgency = 'low' | 'normal' | 'high' | 'critical';

export type NotificationListenerFilter = {
  /** Exact category keys. */
  categoryKeys?: readonly string[];
  /** Event keys; a trailing `*` is a prefix match (same rule as the catalog). */
  eventKeys?: readonly string[];
  resource?: NotificationRouteResource | readonly NotificationRouteResource[];
  /** Only notifications issued by this Nexus app. */
  appClientId?: string;
  urgency?: readonly NotificationUrgency[];
  /** Anything else the host needs. Runs last. */
  predicate?: (notification: NotificationLike) => boolean;
};

function asArray<T>(value: T | readonly T[] | undefined): readonly T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value as T];
}

/**
 * Whether a notification matches a filter. An empty filter matches everything,
 * which is what a host that wants a global hook passes.
 */
export function matchesNotificationFilter(
  filter: NotificationListenerFilter | undefined,
  notification: NotificationLike,
): boolean {
  if (!filter) return true;

  const categories = asArray(filter.categoryKeys);
  if (categories.length) {
    const category = String(notification.categoryKey || '');
    if (!categories.includes(category)) return false;
  }

  const events = asArray(filter.eventKeys);
  if (events.length) {
    const eventKey = String(notification.eventKey || '');
    if (!keyMatches(events, eventKey)) return false;
  }

  const resources = asArray(filter.resource);
  if (resources.length) {
    const resource = String(notification.resource || '');
    if (!resources.includes(resource as NotificationRouteResource)) return false;
  }

  if (filter.appClientId) {
    if (String(notification.appClientId || '') !== filter.appClientId) return false;
  }

  const urgencies = asArray(filter.urgency);
  if (urgencies.length) {
    const urgency = String(notification.urgency || '');
    if (!urgencies.includes(urgency as NotificationUrgency)) return false;
  }

  if (filter.predicate && !filter.predicate(notification)) return false;
  return true;
}

export type NotificationListener = (notification: NotificationLike) => void;

export type NotificationListenerHandle = {
  /** Subscribe. Returns an unsubscribe. */
  on(listener: NotificationListener): () => void;
  /** Push one notification; only matching listeners run. */
  push(notification: NotificationLike): void;
  /** Remove every listener. */
  clear(): void;
  listenerCount(): number;
};

/**
 * Creates a listener set for one filter.
 *
 * A host that wants several independent hooks creates several handles, or one
 * handle with an empty filter and branches inside its listener. A throwing
 * listener is isolated and reported to `onError`.
 */
export function createNotificationListener(opts: {
  filter?: NotificationListenerFilter;
  onError?: (err: unknown, notification: NotificationLike) => void;
} = {}): NotificationListenerHandle {
  const listeners = new Set<NotificationListener>();

  return {
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    push(notification) {
      if (!matchesNotificationFilter(opts.filter, notification)) return;
      for (const listener of [...listeners]) {
        try {
          listener(notification);
        } catch (err) {
          opts.onError?.(err, notification);
        }
      }
    },
    clear() {
      listeners.clear();
    },
    listenerCount() {
      return listeners.size;
    },
  };
}
