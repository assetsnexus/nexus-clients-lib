import { describe, expect, it, vi } from 'vitest';
import { COMPLIANCE_COMMANDS, createComplianceKit } from './compliance.js';
import type { ComplianceCommandClient } from './compliance.js';

function client(responses: Record<string, unknown>): ComplianceCommandClient {
  return {
    command: vi.fn(async (name: string) => {
      if (!(name in responses)) throw new Error(`unexpected command ${name}`);
      return responses[name];
    }),
  } as unknown as ComplianceCommandClient;
}

const dueDoc = {
  kind: 'terms',
  version: '2026-01',
  hash: 'h',
  accepted: false,
  acceptedAt: null,
  dueAt: '2026-12-01T00:00:00.000Z',
  state: 'due',
};
const acceptedDoc = { ...dueDoc, kind: 'privacy', accepted: true, state: 'accepted' };

describe('createComplianceKit', () => {
  it('reads terms status and keeps the policy', async () => {
    const command = client({
      [COMPLIANCE_COMMANDS.TERMS_STATUS]: {
        documents: [dueDoc, acceptedDoc],
        policy: { graceDays: 30, onExpiry: 'pause_app', tracking: 'required' },
      },
    });
    const kit = createComplianceKit({ command });

    const status = await kit.termsStatus();

    expect(status.documents).toHaveLength(2);
    expect(status.policy.tracking).toBe('required');
  });

  it('returns only the documents that need action from pending()', async () => {
    const command = client({
      [COMPLIANCE_COMMANDS.TERMS_STATUS]: { documents: [dueDoc, acceptedDoc], policy: {} },
      [COMPLIANCE_COMMANDS.PRICE_CHANGE_LIST]: {
        items: [
          { changeId: 'c1', state: 'consent_required' },
          { changeId: 'c2', state: 'auto_accepted' },
        ],
        needsDecision: 1,
      },
    });
    const kit = createComplianceKit({ command });

    const pending = await kit.pending();

    expect(pending.terms.map((d) => d.kind)).toEqual(['terms']);
    expect(pending.priceChanges.map((c) => c.changeId)).toEqual(['c1']);
  });

  it('does not let one failing read hide the other', async () => {
    const command = {
      command: vi.fn(async (name: string) => {
        if (name === COMPLIANCE_COMMANDS.TERMS_STATUS) throw new Error('down');
        return { items: [{ changeId: 'c1', state: 'consent_required' }], needsDecision: 1 };
      }),
    } as unknown as ComplianceCommandClient;
    const kit = createComplianceKit({ command });

    const pending = await kit.pending();

    expect(pending.terms).toEqual([]);
    expect(pending.priceChanges).toHaveLength(1);
  });

  it('accepts terms and reports whether the app resumed', async () => {
    const command = client({
      [COMPLIANCE_COMMANDS.TERMS_ACCEPT]: {
        acceptanceId: 'a1',
        kind: 'terms',
        version: '2026-01',
        hash: 'h',
        resumed: true,
      },
    });
    const kit = createComplianceKit({ command });

    const result = await kit.acceptTerms({ kind: 'terms', version: '2026-01', hash: 'h' });

    expect(result.resumed).toBe(true);
    expect(command.command).toHaveBeenCalledWith(COMPLIANCE_COMMANDS.TERMS_ACCEPT, {
      kind: 'terms',
      version: '2026-01',
      hash: 'h',
    });
  });

  it('decides a price change and toggles auto-accept', async () => {
    const command = client({
      [COMPLIANCE_COMMANDS.PRICE_CHANGE_DECIDE]: { changeId: 'c1', state: 'accepted' },
      [COMPLIANCE_COMMANDS.PRICE_CHANGE_AUTO_ACCEPT]: { autoAccept: true },
    });
    const kit = createComplianceKit({ command });

    await expect(kit.decidePriceChange('c1', 'accepted')).resolves.toMatchObject({
      state: 'accepted',
    });
    await expect(kit.setPriceChangeAutoAccept('sub-1', true)).resolves.toEqual({ autoAccept: true });
  });
});
