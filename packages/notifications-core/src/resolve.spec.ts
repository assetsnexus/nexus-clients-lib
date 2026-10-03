import { describe, expect, it } from 'vitest';
import { explain, resolveNotificationTarget } from './index.js';
import type { NotificationRouteInput } from './types.js';

const portal = { surface: 'portal' as const };
const app = { surface: 'app' as const };

function row(partial: NotificationRouteInput): NotificationRouteInput {
  return { ...partial, id: partial.id || 'n1' };
}

describe('resolveNotificationTarget precedence', () => {
  it('walks presentation, deep link, event id, object id, section, category, tags, type, then none', () => {
    const linked = row({
      id: 'n-link',
      presentation: { link: { kind: 'url', url: 'https://app.example/inbox' } },
      data: { deepLink: '/sp/crm/leads/L1' },
      eventKey: 'crm.stage_changed',
    });
    expect(resolveNotificationTarget(linked, portal)).toMatchObject({
      kind: 'url',
      value: 'https://app.example/inbox',
      grade: 'detail',
    });
    expect(explain(linked, portal).step).toBe('presentation.link');

    const deep = row({
      id: 'n-deep',
      eventKey: 'crm.stage_changed',
      data: { deepLink: '/sp/crm/leads/from-link', leadId: 'L-from-id' },
    });
    expect(resolveNotificationTarget(deep, portal).value).toBe('/sp/crm/leads/from-link');
    expect(explain(deep, portal).step).toBe('deepLink');

    const eventDetail = row({
      id: 'n-event',
      eventKey: 'crm.stage_changed',
      categoryKey: 'crm.leads',
      data: { leadId: 'L1' },
    });
    expect(resolveNotificationTarget(eventDetail, portal)).toMatchObject({
      kind: 'path',
      value: '/sp/crm/leads/L1',
      grade: 'detail',
      ruleId: 'crm-lead',
    });
    expect(explain(eventDetail, portal).step).toBe('eventKey');

    const objectOnly = row({ id: 'n-obj', data: { clusterId: 'c1' } });
    expect(resolveNotificationTarget(objectOnly, portal)).toMatchObject({
      kind: 'path',
      value: '/clusters/editor/c1',
      grade: 'detail',
      ruleId: 'cluster',
    });
    expect(explain(objectOnly, portal).step).toBe('objectId');

    const categoryOnly = row({ id: 'n-cat', categoryKey: 'crm.activities' });
    expect(resolveNotificationTarget(categoryOnly, portal)).toMatchObject({
      kind: 'path',
      value: '/sp/crm',
      grade: 'section',
    });
    expect(explain(categoryOnly, portal).step).toBe('category');

    const tagged = row({ id: 'n-tags', tags: ['admin', 'registration'] });
    expect(resolveNotificationTarget(tagged, portal)).toMatchObject({
      kind: 'path',
      value: '/sp/region-node-admin/access/registrations',
      grade: 'section',
      ruleId: 'registrations-tags',
    });

    const wake = row({ id: 'n-wake', data: { type: '2fa_approval' } });
    expect(resolveNotificationTarget(wake, app)).toMatchObject({
      kind: 'screen',
      value: 'PendingApprovals',
      grade: 'section',
      ruleId: 'wake-2fa',
    });
    expect(explain(wake, app).step).toBe('type');
    expect(resolveNotificationTarget(wake, portal).kind).toBe('none');

    expect(resolveNotificationTarget(row({ id: 'n-none', title: 'Hello' }), portal)).toMatchObject({
      kind: 'none',
      grade: 'none',
      value: '',
    });

    expect(resolveNotificationTarget(row({
      id: 'n-phish',
      data: { deepLink: 'https://evil.example/phish' },
    }), portal).kind).toBe('none');
  });

  it('degrades a missing id to the section', () => {
    const target = resolveNotificationTarget(row({
      id: 'n-miss',
      eventKey: 'crm.stage_changed',
      categoryKey: 'crm.leads',
    }), portal);
    expect(target).toMatchObject({
      kind: 'path',
      value: '/sp/crm',
      grade: 'section',
    });
    expect(target.missingParams.length).toBeGreaterThan(0);
    expect(explain(row({ id: 'n-miss', eventKey: 'crm.stage_changed' }), portal).step).toBe('eventKeySection');
  });

  it('rejects an unsafe id', () => {
    const rejected = resolveNotificationTarget(row({
      id: 'n-bad-link',
      presentation: { link: { kind: 'route', resource: 'crm_lead', id: '../evil' } },
      data: { deepLink: '/sp/crm/leads/safeLead' },
    }), portal);
    expect(rejected.kind).toBe('none');
    expect(rejected.value).not.toContain('..');
    expect(rejected.value).not.toContain('safeLead');

    const degraded = resolveNotificationTarget(row({
      id: 'n-bad-id',
      eventKey: 'crm.stage_changed',
      data: { leadId: 'bad/id' },
    }), portal);
    expect(degraded).toMatchObject({ kind: 'path', value: '/sp/crm', grade: 'section' });
    expect(degraded.value).not.toContain('bad/id');

    const proof = resolveNotificationTarget(row({
      id: 'n-bad-tx',
      data: { transactionId: '../tx', source: 'accounting.proof_required' },
    }), { ...portal, currentPath: '/b2b/finance' });
    expect(proof.value).toBe('/b2b/accounting/proof-tasks');
    expect(proof.value).not.toContain('..');
  });

  it('lets presentation.link beat a deep link', () => {
    const target = resolveNotificationTarget(row({
      id: 'n-beat',
      presentation: { link: { kind: 'path', path: '/sp/crm/leads/L9' } },
      data: { deepLink: '/sp/products-marketplace/dashboard', leadId: 'L1' },
      eventKey: 'crm.stage_changed',
    }), portal);
    expect(target).toMatchObject({
      kind: 'path',
      value: '/sp/crm/leads/L9',
      ruleId: 'presentation.link',
      grade: 'detail',
    });
  });

  it('aligns /user and /b2b with the current console', () => {
    const proof = row({
      id: 'n-proof',
      eventKey: 'finance.accounting.proof_required',
      data: { transactionId: 'tx-9' },
    });
    expect(resolveNotificationTarget(proof, { ...portal, currentPath: '/b2b/finance/transactions' }).value)
      .toBe('/b2b/accounting/proof-tasks/tx-9');
    expect(resolveNotificationTarget(proof, { ...portal, currentPath: '/user/home/overview' }).value)
      .toBe('/user/accounting/proof-tasks/tx-9');

    const legacy = row({
      id: 'n-legacy',
      data: { transactionId: 'tx-2', source: 'accounting.proof_required' },
    });
    expect(resolveNotificationTarget(legacy, { ...portal, currentPath: '/b2b/finance/transactions' }).value)
      .toBe('/b2b/accounting/proof-tasks/tx-2');

    expect(resolveNotificationTarget(row({
      id: 'n-align',
      presentation: { link: { kind: 'path', path: '/user/ai-employees/approvals' } },
    }), { ...portal, currentPath: '/b2b/home' }).value).toBe('/b2b/ai-employees/approvals');

    expect(resolveNotificationTarget(row({
      id: 'n-align-user',
      presentation: { link: { kind: 'path', path: '/b2b/clusters/list' } },
    }), { ...portal, currentPath: '/user/home' }).value).toBe('/user/clusters/list');
  });

  it('opens the inbox rows that previously had no page', () => {
    const home = { ...portal, currentPath: '/user/home/overview' };
    expect(resolveNotificationTarget(row({
      id: 'n-joined',
      title: 'New member joined',
      data: { membershipId: 'mem-1', orgId: 'org-1', previousStatus: 'invited', nextStatus: 'active' },
    }), home)).toMatchObject({
      kind: 'path',
      value: '/b2b/org/members/list',
      grade: 'section',
      ruleId: 'org-membership',
    });
    expect(resolveNotificationTarget(row({
      id: 'n-reg',
      title: 'New user awaiting approval',
      tags: ['registration', 'admin', 'user_pending_approval'],
    }), home)).toMatchObject({
      kind: 'path',
      value: '/sp/region-node-admin/access/registrations',
      ruleId: 'registrations-tags',
    });
    expect(resolveNotificationTarget(row({
      id: 'n-access',
      title: 'Data access approval needed',
      data: { grantId: 'grant-1', templateKey: 'security.data_access.pending' },
    }), home)).toMatchObject({
      kind: 'path',
      value: '/user/ai-employees/approvals?grantId=grant-1',
      grade: 'detail',
      ruleId: 'data-access-approval',
    });
    expect(resolveNotificationTarget(row({
      id: 'n-proof',
      title: 'Accounting proof needed',
      data: {
        transactionId: 'tx-9',
        type: 'action_inbox',
        source: 'accounting.proof_required',
        eventKey: 'finance.accounting.proof_required',
        deepLink: '/b2b/accounting/proof-tasks/tx-9',
      },
    }), home).value).toBe('/user/accounting/proof-tasks/tx-9');
  });

  it('keeps portal asset and conversation targets on the section', () => {
    const asset = row({
      id: 'n-asset',
      eventKey: 'assets.lifecycle.offline',
      data: { assetId: 'asset-1' },
    });
    expect(resolveNotificationTarget(asset, portal)).toMatchObject({
      kind: 'path',
      value: '/b2b/assets/list',
      grade: 'section',
    });
    expect(resolveNotificationTarget(asset, app)).toMatchObject({
      kind: 'screen',
      value: 'AssetDiscovery',
      grade: 'detail',
      params: { assetId: 'asset-1' },
    });
    expect(resolveNotificationTarget(asset, { ...app, appScreens: new Set() })).toMatchObject({
      kind: 'portal-web',
      value: '/b2b/assets/list',
      grade: 'section',
    });

    const conversation = row({
      id: 'n-chat',
      eventKey: 'messages.inbox.received',
      data: { conversationId: 'conv-1' },
    });
    expect(resolveNotificationTarget(conversation, portal)).toMatchObject({
      kind: 'path',
      value: '/user/ai-employees/conversations',
      grade: 'section',
    });
    expect(resolveNotificationTarget(conversation, app)).toMatchObject({
      kind: 'screen',
      value: 'ChatContact',
      grade: 'detail',
      params: { contactId: 'conv-1' },
    });
  });

  it('maps the native wake types on the app', () => {
    const screens: Record<string, string> = {
      key_share: 'KeyShareIncoming',
      action_inbox: 'ActionInbox',
      permission_request: 'ConnectedApps',
    };
    for (const [type, screen] of Object.entries(screens)) {
      expect(resolveNotificationTarget(row({ id: type, data: { type } }), app)).toMatchObject({
        kind: 'screen',
        value: screen,
      });
    }
  });
});
