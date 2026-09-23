import { describe, expect, it } from 'vitest';
import { dataAccessApprovalInfoFrom, isDataAccessApprovalResult } from './data-access-approval.js';

describe('dataAccessApprovalInfoFrom', () => {
  it('prefers top-level fields over details', () => {
    const info = dataAccessApprovalInfoFrom({
      callId: 'c1',
      grantId: 'g1',
      access: 'write',
      resource: { kind: 'lead', id: 'l1' },
      parents: [{ kind: 'campaign', id: 'k1' }],
      details: { grantId: 'g-old', access: 'read' },
      resume: { command: 'anx.crm.lead.get' },
      message: 'Approve?',
    });
    expect(info).toMatchObject({
      callId: 'c1',
      grantId: 'g1',
      access: 'write',
      resource: { kind: 'lead', id: 'l1' },
      parents: [{ kind: 'campaign', id: 'k1' }],
      resume: { command: 'anx.crm.lead.get' },
      message: 'Approve?',
    });
  });

  it('falls back to details (region error shape) and the given callId', () => {
    const info = dataAccessApprovalInfoFrom(
      {
        needsApproval: true,
        approvalKind: 'data_access',
        details: { grantId: 'g2', access: 'read', resource: { id: 'x' }, parents: [] },
        reason: 'Owner approval required',
      },
      'call-9',
    );
    expect(info).toMatchObject({
      callId: 'call-9',
      grantId: 'g2',
      access: 'read',
      resource: { id: 'x' },
      message: 'Owner approval required',
    });
  });

  it('defaults safely for an empty payload', () => {
    expect(dataAccessApprovalInfoFrom(null)).toEqual({
      callId: null,
      grantId: null,
      resource: null,
      parents: [],
      access: 'read',
      details: {},
      resume: null,
      message: 'Data access requires your approval.',
    });
  });
});

describe('isDataAccessApprovalResult', () => {
  it('matches both the approvalKind and legacy status shapes', () => {
    expect(isDataAccessApprovalResult({ needsApproval: true, approvalKind: 'data_access' })).toBe(true);
    expect(
      isDataAccessApprovalResult({ needsApproval: true, status: 'data_access_approval_required' }),
    ).toBe(true);
    expect(isDataAccessApprovalResult({ needsApproval: true, approvalKind: 'tool_consent' })).toBe(false);
    expect(isDataAccessApprovalResult(null)).toBe(false);
  });
});
