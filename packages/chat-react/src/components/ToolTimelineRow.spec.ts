import { describe, expect, it } from 'vitest';
import type { ChatToolRun } from '@nexus/chat-core';
import { explainHasReason, explainInputFromRun } from './ToolTimelineRow.js';

function run(partial: Partial<ChatToolRun>): ChatToolRun {
  return {
    id: 'r1',
    tool: 'anx.crm.lead.create',
    label: 'create lead',
    status: 'success',
    args: {},
    ...partial,
  };
}

describe('explainInputFromRun (plan Part C8)', () => {
  it('reads a top-level reason', () => {
    const input = explainInputFromRun(run({ reason: 'User asked to add the lead.' } as Partial<ChatToolRun>));
    expect(input.reason).toBe('User asked to add the lead.');
    expect(input.toolName).toBe('anx.crm.lead.create');
  });

  it('reads a nested result.reason / rationale / why', () => {
    expect(explainInputFromRun(run({ result: { reason: 'matched filter' } })).reason).toBe('matched filter');
    expect(explainInputFromRun(run({ result: { rationale: 'matched filter' } })).reason).toBe('matched filter');
    expect(explainInputFromRun(run({ result: { why: 'matched filter' } })).reason).toBe('matched filter');
  });

  it('never invents a reason', () => {
    expect(explainInputFromRun(run({})).reason).toBeNull();
  });

  it('flags approval + errors as explainable', () => {
    expect(explainInputFromRun(run({ status: 'needs_approval' })).approvalRequired).toBe(true);
    expect(explainInputFromRun(run({ status: 'error', error: 'boom' })).resultSummary).toBe('boom');
  });

  it('hasReason only when the backend supplied something', () => {
    expect(explainHasReason(run({}))).toBe(false);
    expect(explainHasReason(run({ result: { reason: 'because' } }))).toBe(true);
    expect(explainHasReason(run({ status: 'needs_approval' }))).toBe(true);
  });
});
