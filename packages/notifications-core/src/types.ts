/**
 * Presentation contract. Duplicated from the notifications contract so this
 * package does not import region-node.
 */

export type NotificationLink =
  | { kind: 'route'; resource: NotificationRouteResource; id?: string; section?: string }
  | { kind: 'path'; path: string }
  | { kind: 'url'; url: string };

export type NotificationRouteResource =
  | 'crm_contact'
  | 'crm_lead'
  | 'crm_campaign'
  | 'crm_project'
  | 'marketplace_product'
  | 'asset'
  | 'cluster'
  | 'conversation'
  | 'calendar_event'
  | 'transaction'
  | 'registration'
  | 'section';

export type NotificationIconSymbol =
  | 'bell'
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'user'
  | 'org'
  | 'chat'
  | 'calendar'
  | 'payment'
  | 'asset'
  | 'cluster'
  | 'product'
  | 'crm'
  | 'security'
  | 'task'
  | 'ai';

export type NotificationIcon =
  | { kind: 'symbol'; name: NotificationIconSymbol }
  | { kind: 'app_logo' };

export type NotificationActionStyle = 'primary' | 'secondary' | 'danger' | 'link';
export type NotificationActionKind = 'open' | 'callback' | 'ask_ai' | 'mark_read';

export interface NotificationAction {
  id: string;
  label: string;
  style: NotificationActionStyle;
  kind: NotificationActionKind;
  link?: NotificationLink;
  handlerKey?: string;
  confirm?: { title: string; body?: string };
  once?: boolean;
}

export interface NotificationPresentation {
  link?: NotificationLink;
  icon?: NotificationIcon;
  actions?: NotificationAction[];
}

export interface NotificationActionResult {
  actionId: string;
  userId: string;
  at: Date;
  status: 'claimed' | 'delivered' | 'handled' | 'failed';
}

/** Inbox row the resolver accepts. Field names match the notification DTO. */
export interface NotificationRouteInput {
  id: string;
  title?: string;
  body?: string;
  type?: string;
  tags?: string[];
  eventKey?: string;
  categoryKey?: string;
  presentation?: NotificationPresentation;
  actionResults?: NotificationActionResult[];
  data?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  source?: { kind?: string };
  createdAt?: Date | string;
}

export type NotificationResolveStep =
  | 'presentation.link'
  | 'deepLink'
  | 'eventKey'
  | 'objectId'
  | 'eventKeySection'
  | 'category'
  | 'tags'
  | 'type'
  | 'none';

export interface ResolvedNotificationTarget {
  kind: 'path' | 'screen' | 'url' | 'portal-web' | 'none';
  value: string;
  params?: Record<string, string>;
  ruleId?: string;
  grade: 'detail' | 'section' | 'none';
  missingParams: string[];
}

export interface ResolveNotificationOptions {
  surface: 'portal' | 'app';
  currentPath?: string;
  appScreens?: ReadonlySet<string>;
  extraRules?: readonly NotificationRouteRule[];
}

export interface NotificationRouteMatch {
  eventKeys?: readonly string[];
  categoryKeys?: readonly string[];
  tagsAll?: readonly string[];
  tagsAny?: readonly string[];
  types?: readonly string[];
  resource?: NotificationRouteResource;
}

export interface NotificationPortalTarget {
  /** Detail path. `:param` placeholders are filled from safe ids. */
  path?: string;
  sectionPath?: string;
  /**
   * Keep the path's console (`/b2b` or `/user`). Set when the other console
   * has no twin of this page, so a click from user home still opens the org page.
   */
  preserveConsole?: boolean;
}

export interface NotificationAppScreenTarget {
  screen: string;
  /** Values may be literals or `:param` placeholders. */
  params?: Record<string, string>;
}

export interface NotificationAppPortalWebTarget {
  portalWeb: true;
}

export type NotificationAppTarget = NotificationAppScreenTarget | NotificationAppPortalWebTarget;

export interface NotificationRouteRule {
  id: string;
  match: NotificationRouteMatch;
  /** Required ids for a detail target. Absent or unsafe ids use `sectionPath`. */
  params?: readonly string[];
  portal?: NotificationPortalTarget;
  app?: NotificationAppTarget;
}

export interface ExtractedNotificationObject {
  resource: string;
  id: string;
  param: string;
}

export interface NotificationRouteExplanation {
  target: ResolvedNotificationTarget;
  step: NotificationResolveStep;
  eventKey?: string;
  categoryKey?: string;
  resource?: string;
  objectId?: string;
}

export interface CatalogAudit {
  detail: string[];
  section: string[];
  none: string[];
}

export interface InboxClassification {
  detail: NotificationRouteInput[];
  section: NotificationRouteInput[];
  none: NotificationRouteInput[];
  counts: { detail: number; section: number; none: number };
}

export interface NotificationAskReference {
  type: string;
  entityId: string;
}

export interface NotificationAskContextBody {
  id: string;
  title?: string;
  body?: string;
  eventKey?: string;
  categoryKey?: string;
  type?: string;
  createdAt?: string;
  sender?: string;
}

export interface NotificationAskContext {
  references: NotificationAskReference[];
  context: NotificationAskContextBody;
  label: string;
}
