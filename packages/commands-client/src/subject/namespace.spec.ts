import { describe, expect, it } from 'vitest';
import { createTestClient, fixtureOk } from '../testing/index.js';
import { FieldClaimValidationError } from './field-catalog.js';
import { NexusError } from '../errors/nexus-error.js';

describe('subject namespace', () => {
  it('lists consented identities and reads regulatory status', async () => {
    const client = createTestClient({
      'anx.oauth2.subject.identities.list': () =>
        fixtureOk({
          identities: [
            { subjectType: 'user', sub: 'p-user', grantId: 'g-user' },
            {
              subjectType: 'org_member',
              sub: 'p-org',
              grantId: 'g-org',
              organization: { orgId: 'org-1', name: 'Acme' },
            },
          ],
        }),
      'anx.oauth2.subject.regulatory-status.get': () =>
        fixtureOk({
          statuses: [{ bundleSlug: 'identification-l1', kind: 'identity', target: 'user', status: 'verified' }],
          attestation: 'header.payload.sig',
          attestationExpiresAt: '2026-10-02T12:05:00.000Z',
        }),
    });
    const identities = await client.subject.identities();
    expect(identities.identities).toHaveLength(2);
    expect(identities.identities[1]?.organization?.name).toBe('Acme');
    const status = await client.subject.regulatoryStatus();
    expect(status.statuses[0]?.status).toBe('verified');
    expect(status.attestation).toBe('header.payload.sig');
  });

  it('rejects a regulatory response without an attestation', async () => {
    const client = createTestClient({
      'anx.oauth2.subject.regulatory-status.get': () => fixtureOk({ statuses: [] }),
    });
    await expect(client.subject.regulatoryStatus()).rejects.toBeInstanceOf(NexusError);
  });

  it('requests catalog fields and refuses unknown names before send', async () => {
    const seen: unknown[] = [];
    const client = createTestClient({
      'anx.oauth2.subject.fields.get': () =>
        fixtureOk({
          fields: { email: 'a@b.c', email_verified: true },
          omitted: [{ field: 'phone', reason: 'not_verified' }],
        }),
      'anx.oauth2.subject.fields.request': (envelope) => {
        seen.push(envelope.payload.fields);
        return fixtureOk({ requestId: 'fr-1', alreadyGranted: ['email'], pending: ['phone'] });
      },
    });
    const current = await client.subject.fields.get();
    expect(current.fields.email).toBe('a@b.c');
    const requested = await client.subject.fields.request([
      { field: 'phone', purpose: '<b>SMS login</b>' },
      { field: 'age_over:18' },
    ]);
    expect(requested.pending).toEqual(['phone']);
    expect(seen[0]).toEqual([{ field: 'phone', purpose: 'SMS login' }, { field: 'age_over:18' }]);
    await expect(client.subject.fields.request([{ field: 'passport' }])).rejects.toBeInstanceOf(
      FieldClaimValidationError,
    );
  });
});
