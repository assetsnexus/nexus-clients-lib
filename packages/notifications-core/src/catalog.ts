import type { NotificationRouteRule } from './types.js';

/**
 * Starter catalog. Portal asset detail and conversation detail are intentionally
 * absent: those rows stay on the section path until dedicated routes exist.
 * App asset and conversation rows still open a native screen when the id is present.
 */
export const NOTIFICATION_ROUTE_RULES: readonly NotificationRouteRule[] = [
  {
    id: 'crm-contact',
    match: { resource: 'crm_contact', eventKeys: ['crm.*'], categoryKeys: ['crm.*'] },
    params: ['contactId'],
    portal: { path: '/sp/crm/contacts/:contactId', sectionPath: '/sp/crm' },
    app: { portalWeb: true },
  },
  {
    id: 'crm-lead',
    match: { resource: 'crm_lead', eventKeys: ['crm.*'], categoryKeys: ['crm.*'] },
    params: ['leadId'],
    portal: { path: '/sp/crm/leads/:leadId', sectionPath: '/sp/crm' },
    app: { portalWeb: true },
  },
  {
    id: 'crm-campaign',
    match: { resource: 'crm_campaign', eventKeys: ['crm.*'], categoryKeys: ['crm.*'] },
    params: ['campaignId'],
    portal: { path: '/sp/crm/campaigns/:campaignId', sectionPath: '/sp/crm' },
    app: { portalWeb: true },
  },
  {
    id: 'crm-project',
    match: { resource: 'crm_project', eventKeys: ['crm.*'], categoryKeys: ['crm.*'] },
    params: ['projectId'],
    portal: { path: '/sp/crm/projects/:projectId', sectionPath: '/sp/crm' },
    app: { portalWeb: true },
  },
  {
    id: 'crm-section',
    match: { eventKeys: ['crm.*'], categoryKeys: ['crm.*'] },
    portal: { sectionPath: '/sp/crm' },
    app: { portalWeb: true },
  },
  {
    id: 'marketplace-product',
    match: { resource: 'marketplace_product' },
    params: ['productId'],
    portal: {
      path: '/sp/products-marketplace/products/:productId',
      sectionPath: '/sp/products-marketplace/dashboard',
    },
    app: { portalWeb: true },
  },
  {
    id: 'cluster',
    match: { resource: 'cluster' },
    params: ['clusterId'],
    portal: { path: '/clusters/editor/:clusterId', sectionPath: '/b2b/clusters/list' },
    app: { portalWeb: true },
  },
  {
    id: 'asset',
    match: {
      resource: 'asset',
      eventKeys: ['assets.lifecycle.state_changed', 'assets.lifecycle.offline'],
      categoryKeys: ['assets.lifecycle'],
    },
    params: ['assetId'],
    portal: { sectionPath: '/b2b/assets/list' },
    app: { screen: 'AssetDiscovery', params: { assetId: ':assetId' } },
  },
  {
    id: 'conversation',
    match: {
      resource: 'conversation',
      eventKeys: ['messages.inbox.received', 'messages.mentions.received'],
      categoryKeys: ['messages.inbox'],
    },
    params: ['conversationId'],
    portal: { sectionPath: '/user/ai-employees/conversations' },
    app: { screen: 'ChatContact', params: { contactId: ':conversationId' } },
  },
  {
    id: 'accounting-proof',
    match: {
      resource: 'transaction',
      eventKeys: [
        'finance.accounting.proof_required',
        'finance.accounting.proof_extraction_failed',
        'finance.accounting.proof_submitted',
        'finance.accounting.proof_deadline_passed',
      ],
      categoryKeys: ['finance.accounting'],
    },
    params: ['transactionId'],
    portal: {
      path: '/user/accounting/proof-tasks/:transactionId',
      sectionPath: '/user/accounting/proof-tasks',
    },
    app: { portalWeb: true },
  },
  {
    id: 'registrations-event',
    match: { eventKeys: ['auth.registration.*'] },
    portal: { sectionPath: '/sp/region-node-admin/access/registrations' },
    app: { portalWeb: true },
  },
  {
    id: 'registrations-tags',
    match: { tagsAll: ['registration', 'admin'] },
    portal: { sectionPath: '/sp/region-node-admin/access/registrations' },
    app: { portalWeb: true },
  },
  {
    id: 'org-membership',
    match: { eventKeys: ['org.membership.*'], categoryKeys: ['org.membership'] },
    portal: { sectionPath: '/b2b/org/members/list', preserveConsole: true },
    app: { portalWeb: true },
  },
  {
    id: 'data-access-approval',
    match: { eventKeys: ['security.data_access.*'], categoryKeys: ['security.approvals'] },
    params: ['grantId'],
    portal: {
      path: '/user/ai-employees/approvals?grantId=:grantId',
      sectionPath: '/user/ai-employees/approvals',
    },
    app: { portalWeb: true },
  },
  {
    id: 'ai-approvals',
    match: {
      eventKeys: [
        'ai.approval.required',
        'ai.approval.approved',
        'ai.approval.denied',
        'ai.approval.cancelled',
      ],
      categoryKeys: ['ai_employees.approvals'],
    },
    portal: { sectionPath: '/user/ai-employees/approvals' },
    app: { portalWeb: true },
  },
  {
    id: 'wake-2fa',
    match: { types: ['2fa_approval'] },
    app: { screen: 'PendingApprovals' },
  },
  {
    id: 'wake-key-share',
    match: { types: ['key_share'] },
    app: { screen: 'KeyShareIncoming' },
  },
  {
    id: 'wake-action-inbox',
    match: { types: ['action_inbox'] },
    app: { screen: 'ActionInbox' },
  },
  {
    id: 'wake-permission',
    match: { types: ['permission_request'] },
    app: { screen: 'ConnectedApps' },
  },
];

/** Exact key, or a `prefix.*` pattern (the prefix plus a dot). */
export function keyMatches(patterns: readonly string[] | undefined, value: string): boolean {
  if (!patterns?.length || !value) return false;
  for (const pattern of patterns) {
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -1);
      if (value.startsWith(prefix)) return true;
    } else if (pattern === value) {
      return true;
    }
  }
  return false;
}
