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

export type NexusWebhookEvent =
  | 'grant.revoked'
  | 'grant.fields_changed'
  | 'notification.action'
  | 'permission_request.decided'
  | 'regulatory.status_changed'
  | 'account.erased';

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
  | Envelope<'account.erased', AccountErasedData>;
