import { describe, expect, it } from 'vitest';
import type { ChatToolRun } from '@nexus/chat-core';
import { normalizeToolRun, resolveSubAgentWidgetStatus } from './shared';

const base = { id: 'call_parent', tool: 'run_sub_agent', label: 'Subagent', status: 'running' } as ChatToolRun;

describe('normalizeToolRun keeps sub-agent widget fields', () => {
  it('preserves run id, linked chat, live text and approval state', () => {
    const run = normalizeToolRun({
      ...base,
      kind: 'sub_agent',
      subAgentRunId: 'run_1',
      linkedConversationId: 'child',
      subAgentText: 'Searching…',
      startedAtMs: 123,
      subAgentPhase: 'awaiting_approval',
      subAgentPendingApproval: { approvalKind: 'permission_elevation', elevationId: 'e1' },
    } as ChatToolRun);
    expect(run.subAgentRunId).toBe('run_1');
    expect(run.linkedConversationId).toBe('child');
    expect(run.subAgentText).toBe('Searching…');
    expect(run.startedAtMs).toBe(123);
    expect(run.subAgentPhase).toBe('awaiting_approval');
    expect(run.subAgentPendingApproval?.elevationId).toBe('e1');
    expect(run.tool).toBe('run_sub_agent');
  });
});

describe('resolveSubAgentWidgetStatus', () => {
  it('server phase wins over the raw event tail', () => {
    const events = [{ type: 'sub_agent_token', data: {} }];
    expect(resolveSubAgentWidgetStatus({ ...base, subAgentPhase: 'awaiting_approval' }, events)).toBe(
      'awaiting_approval',
    );
    expect(resolveSubAgentWidgetStatus({ ...base, subAgentPhase: 'paused' }, events)).toBe('paused');
  });

  it('derives running / final status from events and row state', () => {
    expect(resolveSubAgentWidgetStatus(base, [{ type: 'sub_agent_token', data: {} }])).toBe('running');
    expect(
      resolveSubAgentWidgetStatus(base, [{ type: 'sub_agent_done', data: { status: 'failed' } }]),
    ).toBe('error');
    expect(resolveSubAgentWidgetStatus({ ...base, status: 'success' }, [])).toBe('completed');
    expect(
      resolveSubAgentWidgetStatus({ ...base, status: 'success', subAgentFinalStatus: 'cancelled' }, []),
    ).toBe('cancelled');
    expect(resolveSubAgentWidgetStatus({ ...base, status: 'success', subAgentPhase: 'running' }, [])).toBe(
      'running',
    );
  });
});
