/**
 * Typed notification client for Nexus apps (and any host that speaks `anx.*`).
 *
 * The app supplies a command transport; this module owns the command names, the
 * payload shapes, and the two decisions an app must not re-implement:
 *
 * - **which actions to show** (`actions()` — hides a consumed once-callback),
 *   and
 * - **where a tap goes** (`resolveTap()`), using the same route catalog the
 *   portal uses.
 *
 * Outbound dispatch is deliberately narrow: an app may send a notification to
 * the people it is already allowed to notify (its own signed-in user, or a
 * member/team of an org it holds a grant for). It cannot set
 * `recipientVirtualEmployeeId`, and it cannot write routing — those are
 * recipient preferences, not sender capabilities.
 */
import { visibleActions } from './actions.js';
import { resolveNotificationTarget } from './resolve.js';
import type {
  NotificationAction,
  NotificationPresentation,
  NotificationRouteInput,
  ResolveNotificationOptions,
  ResolvedNotificationTarget,
} from './types.js';

/** The only thing a host has to provide: a way to call `anx.*` commands. */
export interface NotificationCommandClient {
  command<T = unknown>(name: string, payload?: unknown): Promise<T>;
}

/** Region command names this client uses. Exported so a host can allowlist them. */
export const NOTIFICATION_COMMANDS = {
  DISPATCH: 'anx.notification.dispatch',
  LIST: 'anx.notification.list',
  GET: 'anx.notification.get',
  MARK_READ: 'anx.notification.mark-read',
  MARK_UNREAD: 'anx.notification.mark-unread',
  MARK_ALL_READ: 'anx.notification.mark-all-read',
  ACTION_INVOKE: 'anx.notification.action.invoke',
  DEFAULTS_LIST: 'anx.notification.defaults.list',
} as const;

export type NotificationPriority = 'lowest' | 'low' | 'normal' | 'high' | 'highest';

/** What an app may ask for when it sends a notification. */
export interface DispatchNotificationInput {
  type: string;
  title: string;
  body: string;
  /** Semantic event key; the region derives the category when omitted. */
  eventKey?: string;
  categoryKey?: string;
  priority?: NotificationPriority;
  tags?: string[];
  /** Structured payload. Images are stripped server-side. */
  data?: Record<string, unknown>;
  /** Validated link/icon/actions. App senders cannot use path links or handlerKey. */
  presentation?: NotificationPresentation;
  /** The caller's own user (default) or a member of the caller's org. */
  recipientUserId?: string;
  /** Fan-out to a team of the caller's org. */
  recipientTeamId?: string;
  /** Explicit channel list; omit to let the recipient's preferences decide. */
  channels?: string[];
  urgent?: boolean;
}

/** One inbox row, as the region returns it. */
export interface NotificationInboxItem {
  id: string;
  type?: string;
  title: string;
  body: string;
  priority?: string;
  tags?: string[];
  eventKey?: string;
  categoryKey?: string;
  presentation?: NotificationPresentation;
  actionResults?: Array<{
    actionId: string;
    userId: string;
    at?: string | Date;
    status: 'claimed' | 'delivered' | 'handled' | 'failed';
  }>;
  data?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  readAt?: string | Date;
  createdAt?: string | Date;
  oauthClientId?: string;
  source?: { kind?: string };
  [key: string]: unknown;
}

export interface ListNotificationsInput {
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
  type?: string;
  priority?: string;
  tags?: string[];
}

export interface DispatchResult {
  notification?: NotificationInboxItem;
  notifications?: NotificationInboxItem[];
  dispatched: number;
}

export interface NotificationsClient {
  /** Send a notification. Returns the created row and how many were dispatched. */
  dispatch(input: DispatchNotificationInput): Promise<DispatchResult>;
  list(input?: ListNotificationsInput): Promise<{
    notifications: NotificationInboxItem[];
    total: number;
  }>;
  get(id: string): Promise<NotificationInboxItem | null>;
  markRead(id: string): Promise<unknown>;
  markUnread(id: string): Promise<NotificationInboxItem | null>;
  markAllRead(): Promise<{ updated: number }>;
  /** Invoke a `callback` action on a row. */
  invokeAction(notificationId: string, actionId: string): Promise<unknown>;
  /** Actions this user should still see (a consumed once-callback is hidden). */
  actions(notification: NotificationInboxItem, userId: string): NotificationAction[];
  /** Where a tap on the row should go, using the shared route catalog. */
  resolveTap(
    notification: NotificationInboxItem,
    opts?: Omit<ResolveNotificationOptions, 'surface'> & { surface?: 'portal' | 'app' },
  ): ResolvedNotificationTarget;
  /** The platform's notification categories and their default channels. */
  defaults(): Promise<unknown>;
}

function toRouteInput(notification: NotificationInboxItem): NotificationRouteInput {
  return {
    id: String(notification.id || ''),
    title: notification.title,
    body: notification.body,
    type: notification.type,
    tags: notification.tags,
    eventKey: notification.eventKey,
    categoryKey: notification.categoryKey,
    presentation: notification.presentation,
    actionResults: notification.actionResults?.map((result) => ({
      actionId: result.actionId,
      userId: result.userId,
      at: result.at ? new Date(result.at) : new Date(0),
      status: result.status,
    })),
    data: notification.data,
    meta: notification.meta,
    source: notification.source,
    createdAt: notification.createdAt,
  };
}

export function createNotificationsClient(input: {
  command: NotificationCommandClient['command'];
}): NotificationsClient {
  const call = input.command;

  return {
    async dispatch(payload) {
      const body = await call<{
        notification?: NotificationInboxItem;
        notifications?: NotificationInboxItem[];
        dispatched?: number;
      }>(NOTIFICATION_COMMANDS.DISPATCH, payload);
      const notifications = Array.isArray(body?.notifications) ? body.notifications : undefined;
      return {
        notification: body?.notification || undefined,
        ...(notifications ? { notifications } : {}),
        dispatched:
          typeof body?.dispatched === 'number' ? body.dispatched : body?.notification ? 1 : 0,
      };
    },

    async list(payload) {
      const body = await call<{ notifications?: NotificationInboxItem[]; total?: number }>(
        NOTIFICATION_COMMANDS.LIST,
        payload || {},
      );
      return {
        notifications: Array.isArray(body?.notifications) ? body.notifications : [],
        total: typeof body?.total === 'number' ? body.total : 0,
      };
    },

    async get(id) {
      const body = await call<{ notification?: NotificationInboxItem }>(
        NOTIFICATION_COMMANDS.GET,
        { id },
      );
      return body?.notification || null;
    },

    async markRead(id) {
      return call(NOTIFICATION_COMMANDS.MARK_READ, { notificationId: id });
    },

    async markUnread(id) {
      const body = await call<{ notification?: NotificationInboxItem }>(
        NOTIFICATION_COMMANDS.MARK_UNREAD,
        { id },
      );
      return body?.notification || null;
    },

    async markAllRead() {
      const body = await call<{ updated?: number; modified?: number }>(
        NOTIFICATION_COMMANDS.MARK_ALL_READ,
        {},
      );
      return { updated: Number(body?.updated ?? body?.modified ?? 0) };
    },

    async invokeAction(notificationId, actionId) {
      return call(NOTIFICATION_COMMANDS.ACTION_INVOKE, { notificationId, actionId });
    },

    actions(notification, userId) {
      return visibleActions(toRouteInput(notification), { userId });
    },

    resolveTap(notification, opts) {
      return resolveNotificationTarget(toRouteInput(notification), {
        surface: 'app',
        ...(opts || {}),
      });
    },

    async defaults() {
      return call(NOTIFICATION_COMMANDS.DEFAULTS_LIST, {});
    },
  };
}
