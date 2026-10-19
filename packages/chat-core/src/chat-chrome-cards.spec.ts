import { describe, expect, it } from 'vitest';
import {
  buildPermissionSummary,
  permissionSummaryIsEmpty,
  maskAudience,
  summarizeArgs,
  explainLastAction,
  explainInputFromRun,
  explainHasReason,
  buildWorkingOnSummary,
} from './chat-chrome-cards.js';

describe('C5 permission summary', () => {
  it('summarizes capabilities, tool packs, channels and masked audiences', () => {
    const summary = buildPermissionSummary({
      capabilities: [{ id: 'crm:read' }, { id: 'crm:write' }],
      toolPacks: ['crm-pack'],
      outboundChannels: ['email', 'sms'],
      outboundAudiences: [{ id: 'u1', kind: 'contact', name: 'Alice' }],
      toolApprovalMode: 'per_command',
    });
    expect(summary.sections.map((s) => s.key)).toEqual([
      'capabilities',
      'toolPacks',
      'outboundChannels',
      'outboundAudiences',
    ]);
    const audiences = summary.sections.find((s) => s.key === 'outboundAudiences');
    expect(audiences?.masked).toBe(true);
    // Never leak the person's name.
    expect(JSON.stringify(summary)).not.toContain('Alice');
    expect(summary.totalItems).toBe(6);
    expect(summary.approvalMode).toBe('per_command');
  });

  it('reports empty when nothing is attached', () => {
    const summary = buildPermissionSummary({});
    expect(permissionSummaryIsEmpty(summary)).toBe(true);
    expect(summary.headline).toMatch(/no capabilities/i);
  });

  it('maskAudience never returns a raw string identity', () => {
    expect(maskAudience('alice@example.com')).not.toContain('alice');
    expect(maskAudience({ id: 'x', kind: 'group' })).toContain('group');
  });
});

describe('C8 explain last action', () => {
  it('uses the recorded reason as the why', () => {
    const out = explainLastAction({
      toolName: 'anx.crm.lead.create',
      reason: 'The user asked to add a lead.',
      args: { name: 'Acme', big: 'x'.repeat(60) },
      status: 'ok',
    });
    expect(out.title).toBe('lead create');
    expect(out.why).toBe('The user asked to add a lead.');
    expect(out.argSummary).toContain('name=Acme');
    expect(out.argSummary).toContain('…');
  });

  it('does not invent a reason when none is supplied', () => {
    const out = explainLastAction({ toolName: 'anx.tasks.create' });
    expect(out.why).toMatch(/no explanation/i);
  });

  it('flags approval-required actions', () => {
    const out = explainLastAction({ toolName: 'x.y', approvalRequired: true });
    expect(out.needsApproval).toBe(true);
    expect(out.reasons.join(' ')).toMatch(/approval/i);
  });

  it('summarizeArgs truncates long strings and types containers', () => {
    expect(summarizeArgs({ a: [1, 2, 3], b: { deep: true }, c: null })).toBe('a[3], b={…}, c=—');
    expect(summarizeArgs(null)).toBeNull();
    expect(summarizeArgs({})).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// C8 adapter — explainInputFromRun / explainHasReason (shared by React + Vue2)
// ---------------------------------------------------------------------------

describe('C8 explainInputFromRun', () => {
  it('reads a nested result reason/rationale/why', () => {
    expect(explainInputFromRun({ tool: 'anx.tasks.create', result: { rationale: 'user asked' } }).reason).toBe(
      'user asked',
    );
    expect(explainInputFromRun({ tool: 'x', result: { why: 'because' } }).reason).toBe('because');
  });

  it('prefers the top-level reason and reads result.summary', () => {
    const input = explainInputFromRun({
      tool: 'x',
      reason: 'top',
      result: { reason: 'nested', summary: 'did the thing' },
    });
    expect(input.reason).toBe('top');
    expect(input.resultSummary).toBe('did the thing');
  });

  it('flags approval-required and falls back to the error text', () => {
    const input = explainInputFromRun({ tool: 'x', status: 'needs_approval', error: 'boom' });
    expect(input.approvalRequired).toBe(true);
    expect(input.resultSummary).toBe('boom');
  });

  it('has no reason when the backend supplied nothing', () => {
    expect(explainHasReason({ tool: 'anx.tasks.create', status: 'success' })).toBe(false);
    expect(explainHasReason({ tool: 'x', result: { reason: 'why' } })).toBe(true);
    expect(explainHasReason({ tool: 'x', status: 'needs_approval' })).toBe(true);
  });

  it('never throws on partial / empty runs', () => {
    expect(() => explainInputFromRun({})).not.toThrow();
    expect(explainInputFromRun({}).toolName).toBeNull();
  });
});

describe('C9 working on', () => {
  it('combines active runs and open ledger items', () => {
    const summary = buildWorkingOnSummary({
      runs: [
        { id: 'r1', label: 'Research', status: 'running' },
        { id: 'r2', label: 'Done', status: 'completed' },
      ],
      ledger: [
        { id: 'l1', summary: 'Follow up with Acme', status: 'open' },
        { id: 'l2', summary: 'Closed thing', status: 'closed' },
      ],
    });
    expect(summary.items.map((i) => i.id).sort()).toEqual(['l1', 'r1']);
    expect(summary.runCount).toBe(1);
    expect(summary.ledgerCount).toBe(1);
    expect(summary.busy).toBe(true);
    expect(summary.headline).toMatch(/working on/i);
  });

  it('marks blocked runs as needing the user', () => {
    const summary = buildWorkingOnSummary({
      runs: [{ id: 'r1', label: 'Write file', status: 'needs_approval' }],
    });
    expect(summary.items[0].needsUser).toBe(true);
  });

  it('is idle with nothing to show', () => {
    const summary = buildWorkingOnSummary({});
    expect(summary.items).toEqual([]);
    expect(summary.busy).toBe(false);
    expect(summary.headline).toBe('Idle');
  });

  it('treats a run with no status as still working', () => {
    const summary = buildWorkingOnSummary({ runs: [{ id: 'r1' }] });
    expect(summary.runCount).toBe(1);
  });
});
