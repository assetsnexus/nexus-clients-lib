/** Partner webhook event names. Payload `data` matches the region outbox where R3–R5 already emit it. */

export interface GrantRevokedData {
  grantId: string;
  clientId: string;
  sub: string;
  reason: string;
}

export interface GrantAccessRevokedData {
  grantId: string;
  clientId: string;
  sub: string;
  entryId?: string;
  reason?: string;
}

export interface GrantFieldsChangedData {
  grantId: string;
  clientId: string;
  sub: string;
  grantedFields: string[];
}

export interface GrantResourceScopeChangedData {
  grantId: string;
  clientId: string;
  sub: string;
  domain: 'storage' | 'contacts';
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

/** No subscription ids. Apps only learn whether funding is in place. */
export interface AgentFundingChangedData {
  grantId: string;
  clientId: string;
  sub: string;
  funded: boolean;
  mode: 'user_brings' | 'app_offer' | 'either';
  tierSlug?: string;
}

export type AppSubscriptionEvent =
  | 'app_subscription.activated'
  | 'app_subscription.renewed'
  | 'app_subscription.tier_changed'
  | 'app_subscription.payment_failed'
  | 'app_subscription.past_due'
  | 'app_subscription.canceled'
  | 'app_subscription.expired';

export const APP_SUBSCRIPTION_EVENTS: readonly AppSubscriptionEvent[] = [
  'app_subscription.activated',
  'app_subscription.renewed',
  'app_subscription.tier_changed',
  'app_subscription.payment_failed',
  'app_subscription.past_due',
  'app_subscription.canceled',
  'app_subscription.expired',
];

export interface AppSubscriptionData {
  clientId: string;
  sub?: string;
  grantId?: string;
  tierSlug?: string;
  status: string;
  periodEnd?: string;
}

export interface AppRolesChangedData {
  sub: string;
  grantId: string;
  roles: string[];
  rolesVersion: number;
}

export interface AppUserBlockedData {
  sub: string;
  blockedBy: string;
  at: string;
}

export interface AppUserUnblockedData {
  sub: string;
  at: string;
}

export interface AppConfigChangedData {
  configVersion: string;
  changed: string[];
}

type Loose = Record<string, unknown>;

export type NexusWebhookEvent =
  | 'grant.revoked'
  | 'grant.updated'
  | 'grant.access_revoked'
  | 'grant.fields_changed'
  | 'grant.resource_scope_changed'
  | 'permission_request.decided'
  | 'regulatory.status_changed'
  | 'agent_funding.changed'
  | AppSubscriptionEvent
  | 'app_roles.changed'
  | 'app_user.blocked'
  | 'app_user.unblocked'
  | 'app.config_changed'
  | 'privacy.export_requested'
  | 'privacy.erasure_requested'
  | 'account.erased'
  | 'subscription.created'
  | 'subscription.updated'
  | 'subscription.canceled'
  | 'invoice.payment_succeeded'
  | 'invoice.payment_failed';

type Envelope<E extends string, D> = {
  eventId: string;
  event: E;
  eventVersion: number;
  clientId: string;
  data: D;
  at: string;
};

export type AppSubscriptionPayload = {
  [E in AppSubscriptionEvent]: Envelope<E, AppSubscriptionData>;
}[AppSubscriptionEvent];

export type NexusWebhookPayload =
  | Envelope<'grant.revoked', GrantRevokedData>
  | Envelope<'grant.updated', Loose>
  | Envelope<'grant.access_revoked', GrantAccessRevokedData>
  | Envelope<'grant.fields_changed', GrantFieldsChangedData>
  | Envelope<'grant.resource_scope_changed', GrantResourceScopeChangedData>
  | Envelope<'permission_request.decided', PermissionRequestDecidedData>
  | Envelope<'regulatory.status_changed', RegulatoryStatusChangedData>
  | Envelope<'agent_funding.changed', AgentFundingChangedData>
  | AppSubscriptionPayload
  | Envelope<'app_roles.changed', AppRolesChangedData>
  | Envelope<'app_user.blocked', AppUserBlockedData>
  | Envelope<'app_user.unblocked', AppUserUnblockedData>
  | Envelope<'app.config_changed', AppConfigChangedData>
  | Envelope<'privacy.export_requested', Loose>
  | Envelope<'privacy.erasure_requested', Loose>
  | Envelope<'account.erased', Loose>
  | Envelope<'subscription.created', Loose>
  | Envelope<'subscription.updated', Loose>
  | Envelope<'subscription.canceled', Loose>
  | Envelope<'invoice.payment_succeeded', Loose>
  | Envelope<'invoice.payment_failed', Loose>;

export function isAppSubscriptionEvent(event: string): event is AppSubscriptionEvent {
  return (APP_SUBSCRIPTION_EVENTS as readonly string[]).includes(event);
}
