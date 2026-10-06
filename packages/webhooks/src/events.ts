/** Partner webhook events the region delivers on the OAuth2 outbox. */

export interface GrantRevokedData {
  grantId: string;
  clientId: string;
  sub: string;
  reason: string;
}

export interface GrantFieldsChangedData {
  grantId: string;
  clientId: string;
  sub: string;
  grantedFields: string[];
}

/**
 * App callback invoked from a notification row.
 * `subject` is the pairwise subject, not the platform user id.
 */
export interface NotificationActionData {
  notificationId: string;
  actionId: string;
  subject: string;
  /** Same value as `subject`. */
  sub: string;
  occurredAt: string;
}

export interface PermissionRequestDecidedItem {
  itemId: string;
  kind: string;
  decision: string;
}

export interface PermissionRequestDecidedData {
  requestId: string;
  grantId?: string;
  items: PermissionRequestDecidedItem[];
}

export interface RegulatoryStatusChangedData {
  grantId: string;
  clientId: string;
  sub: string;
  subjectType: 'user' | 'org_member';
  bundleSlug: string;
  target: 'user' | 'org';
  status: 'verified' | 'pending' | 'rejected' | 'expired' | 'revoked' | 'none';
  previousStatus?: string;
  verifiedAt?: string;
  expiresAt?: string;
}

/** Pairwise only. One event per client. No platform user id. */
export interface AccountErasedData {
  clientId: string;
  grantIds: string[];
  subs: string[];
  reason: 'user_erasure';
}

export type PrivacyRequestType = 'access' | 'erasure' | 'rectification' | 'restriction' | 'objection';

/** Pairwise `sub` only. No platform user id. */
export interface PrivacyRequestCreatedData {
  requestId: string;
  type: PrivacyRequestType;
  sub: string;
  grantId: string;
  details?: string;
  dueAt: string;
}

export interface PrivacyRequestCancelledData {
  requestId: string;
  type: PrivacyRequestType;
  sub: string;
  grantId: string;
  reason: string;
}

/** Pairwise only. `app_roles` is empty when the subject no longer has a role. */
export interface AppRolesChangedData {
  grantId: string;
  clientId: string;
  sub: string;
  app_roles: string[];
  app_roles_v: number;
  app_tenant_org?: string;
}

/** Wire names for every event this package documents. */
export const NEXUS_WEBHOOK_EVENTS = {
  grantRevoked: 'grant.revoked',
  grantFieldsChanged: 'grant.fields_changed',
  notificationAction: 'notification.action',
  permissionRequestDecided: 'permission_request.decided',
  regulatoryStatusChanged: 'regulatory.status_changed',
  accountErased: 'account.erased',
  privacyRequestCreated: 'privacy_request.created',
  privacyRequestCancelled: 'privacy_request.cancelled',
  appRolesChanged: 'app_roles.changed',
} as const;

export type NexusWebhookEvent = (typeof NEXUS_WEBHOOK_EVENTS)[keyof typeof NEXUS_WEBHOOK_EVENTS];

const NEXUS_WEBHOOK_EVENT_NAMES: ReadonlySet<string> = new Set(Object.values(NEXUS_WEBHOOK_EVENTS));

export function isNexusWebhookEvent(event: string): event is NexusWebhookEvent {
  return NEXUS_WEBHOOK_EVENT_NAMES.has(event);
}

type Envelope<E extends string, D> = {
  eventId: string;
  event: E;
  eventVersion: number;
  clientId: string;
  data: D;
  at: string;
};

export type NexusWebhookPayload =
  | Envelope<typeof NEXUS_WEBHOOK_EVENTS.grantRevoked, GrantRevokedData>
  | Envelope<typeof NEXUS_WEBHOOK_EVENTS.grantFieldsChanged, GrantFieldsChangedData>
  | Envelope<typeof NEXUS_WEBHOOK_EVENTS.notificationAction, NotificationActionData>
  | Envelope<typeof NEXUS_WEBHOOK_EVENTS.permissionRequestDecided, PermissionRequestDecidedData>
  | Envelope<typeof NEXUS_WEBHOOK_EVENTS.regulatoryStatusChanged, RegulatoryStatusChangedData>
  | Envelope<typeof NEXUS_WEBHOOK_EVENTS.accountErased, AccountErasedData>
  | Envelope<typeof NEXUS_WEBHOOK_EVENTS.privacyRequestCreated, PrivacyRequestCreatedData>
  | Envelope<typeof NEXUS_WEBHOOK_EVENTS.privacyRequestCancelled, PrivacyRequestCancelledData>
  | Envelope<typeof NEXUS_WEBHOOK_EVENTS.appRolesChanged, AppRolesChangedData>;

export function isPrivacyRequestCreated(
  payload: NexusWebhookPayload,
): payload is Envelope<typeof NEXUS_WEBHOOK_EVENTS.privacyRequestCreated, PrivacyRequestCreatedData> {
  return payload.event === NEXUS_WEBHOOK_EVENTS.privacyRequestCreated;
}

export function isPrivacyRequestCancelled(
  payload: NexusWebhookPayload,
): payload is Envelope<typeof NEXUS_WEBHOOK_EVENTS.privacyRequestCancelled, PrivacyRequestCancelledData> {
  return payload.event === NEXUS_WEBHOOK_EVENTS.privacyRequestCancelled;
}

export function isAppRolesChanged(
  payload: NexusWebhookPayload,
): payload is Envelope<typeof NEXUS_WEBHOOK_EVENTS.appRolesChanged, AppRolesChangedData> {
  return payload.event === NEXUS_WEBHOOK_EVENTS.appRolesChanged;
}

/** True when `incoming` is a newer monotonic `app_roles_v` than `stored`. */
export function isNewerVersion(stored: number | undefined, incoming: number): boolean {
  if (!Number.isInteger(incoming) || incoming < 1) return false;
  if (stored === undefined || !Number.isInteger(stored)) return true;
  return incoming > stored;
}

export function isAccountErased(
  payload: NexusWebhookPayload,
): payload is Envelope<typeof NEXUS_WEBHOOK_EVENTS.accountErased, AccountErasedData> {
  return payload.event === NEXUS_WEBHOOK_EVENTS.accountErased;
}
