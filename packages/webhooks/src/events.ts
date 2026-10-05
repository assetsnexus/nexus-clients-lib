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

export type NexusWebhookEvent =
  | 'grant.revoked'
  | 'grant.fields_changed'
  | 'notification.action'
  | 'permission_request.decided'
  | 'regulatory.status_changed'
  | 'account.erased'
  | 'privacy_request.created'
  | 'privacy_request.cancelled'
  | 'app_roles.changed';

type Envelope<E extends string, D> = {
  eventId: string;
  event: E;
  eventVersion: number;
  clientId: string;
  data: D;
  at: string;
};

export type NexusWebhookPayload =
  | Envelope<'grant.revoked', GrantRevokedData>
  | Envelope<'grant.fields_changed', GrantFieldsChangedData>
  | Envelope<'notification.action', NotificationActionData>
  | Envelope<'permission_request.decided', PermissionRequestDecidedData>
  | Envelope<'regulatory.status_changed', RegulatoryStatusChangedData>
  | Envelope<'account.erased', AccountErasedData>
  | Envelope<'privacy_request.created', PrivacyRequestCreatedData>
  | Envelope<'privacy_request.cancelled', PrivacyRequestCancelledData>
  | Envelope<'app_roles.changed', AppRolesChangedData>;

export function isPrivacyRequestCreated(
  payload: NexusWebhookPayload,
): payload is Envelope<'privacy_request.created', PrivacyRequestCreatedData> {
  return payload.event === 'privacy_request.created';
}

export function isPrivacyRequestCancelled(
  payload: NexusWebhookPayload,
): payload is Envelope<'privacy_request.cancelled', PrivacyRequestCancelledData> {
  return payload.event === 'privacy_request.cancelled';
}

export function isAppRolesChanged(
  payload: NexusWebhookPayload,
): payload is Envelope<'app_roles.changed', AppRolesChangedData> {
  return payload.event === 'app_roles.changed';
}

/** True when `incoming` is a newer monotonic `app_roles_v` than `stored`. */
export function isNewerVersion(stored: number | undefined, incoming: number): boolean {
  if (!Number.isInteger(incoming) || incoming < 1) return false;
  if (stored === undefined || !Number.isInteger(stored)) return true;
  return incoming > stored;
}

export function isAccountErased(
  payload: NexusWebhookPayload,
): payload is Envelope<'account.erased', AccountErasedData> {
  return payload.event === 'account.erased';
}
