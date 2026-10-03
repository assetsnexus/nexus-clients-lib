import { describe, expect, it } from 'vitest';
import { createTestClient, fixtureOk } from '../testing/index.js';
import { OrgAdminNamespace } from './namespace.js';

describe('OrgAdminNamespace', () => {
  it('reads password enforcement and org compliance from the region commands', async () => {
    const client = createTestClient({
      'anx.compliance.security-policy.get': () => fixtureOk({
        orgId: 'org-1',
        enabled: true,
        requirePersonalPassword: true,
        membershipLoginPassword: 'membership_password',
        minTwoFactorFactors: 2,
        enforcementMode: 'grace_then_block',
        requireBiometric: false,
        graceDays: 14,
      }),
      'anx.compliance.org-overview.get': () => fixtureOk({
        orgId: 'org-1',
        securityPolicyEnabled: true,
        activations: [{ slug: 'iso-27001', name: 'ISO 27001', status: 'ACTIVE', green: true }],
        regulatoryBundles: [{ slug: 'identification-l1', status: 'VERIFIED' }],
        requiredGaps: [{ standard: 'iso-27001', reason: 'not_green' }],
        suggestions: [],
      }),
    });
    const admin = new OrgAdminNamespace(client);
    const policy = await admin.securityPolicy();
    expect(policy.requirePersonalPassword).toBe(true);
    expect(policy.membershipLoginPassword).toBe('membership_password');
    const overview = await admin.complianceOverview();
    expect(overview.regulatoryBundles[0]?.slug).toBe('identification-l1');
    expect(overview.requiredGaps[0]?.reason).toBe('not_green');
  });
});
