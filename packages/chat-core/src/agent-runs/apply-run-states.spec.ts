import { describe, expect, it } from 'vitest';
import type { ChatTurn } from '../state.js';
import { applySubAgentRunStatesToTurns, subAgentPhaseForRunStatus } from './apply-run-states.js';

function turnsWithSubAgent(row: Record<string, unknown> = {}): ChatTurn[] {
  return [
    { id: 'u1', role: 'user', text: 'search' },
    {
      id: 'a1',
      role: 'assistant',
      text: 'Started',
      toolEvents: [
        { id: 'call_x', tool: 'web_fetch', label: 'web_fetch', status: 'success' },
        {
          id: 'call_parent',
          tool: 'run_sub_agent',
          label: 'Subagent',
          status: 'running',
          kind: 'sub_agent',
          ...row,
        },
      ],
    },
  ] as ChatTurn[];
}

const pendingApproval = {
  approvalKind: 'permission_elevation',
  elevationId: 'elev_1',
  pack: 'ai-agents',
  command: 'anx.ai-agents.web-search',
  reason: 'No roles assigned',
};

describe('applySubAgentRunStatesToTurns', () => {
  it('maps run statuses to widget phases', () => {
    expect(subAgentPhaseForRunStatus('awaiting_approval')).toBe('awaiting_approval');
    expect(subAgentPhaseForRunStatus('paused')).toBe('paused');
    expect(subAgentPhaseForRunStatus('queued')).toBe('running');
    expect(subAgentPhaseForRunStatus('completed')).toBeNull();
  });

  it('marks a row awaiting approval by parent call id and fills the run + linked ids', () => {
    const turns = turnsWithSubAgent();
    const next = applySubAgentRunStatesToTurns(turns, [
      {
        runId: 'run_1',
        status: 'awaiting_approval',
        parentCallId: 'call_parent',
        linkedConversationId: 'child_conv',
        pendingApproval,
      },
    ]);
    expect(next).not.toBe(turns);
    const row = next[1]!.toolEvents!.find((r) => r.id === 'call_parent')!;
    expect(row.subAgentRunId).toBe('run_1');
    expect(row.linkedConversationId).toBe('child_conv');
    expect(row.subAgentPhase).toBe('awaiting_approval');
    expect(row.subAgentPendingApproval).toEqual(pendingApproval);
    expect(next[1]!.toolEvents![0]).toBe(turns[1]!.toolEvents![0]);
  });

  it('matches by sub-agent run id and clears the approval once running again', () => {
    const turns = turnsWithSubAgent({
      subAgentRunId: 'run_1',
      subAgentPhase: 'awaiting_approval',
      subAgentPendingApproval: pendingApproval,
    });
    const next = applySubAgentRunStatesToTurns(turns, [{ runId: 'run_1', status: 'running' }]);
    const row = next[1]!.toolEvents![1]!;
    expect(row.subAgentPhase).toBe('running');
    expect(row.subAgentPendingApproval).toBeNull();
  });

  it('settles a stale running row when the run finished in the background', () => {
    const turns = turnsWithSubAgent({ subAgentRunId: 'run_1' });
    const next = applySubAgentRunStatesToTurns(turns, [{ runId: 'run_1', status: 'failed' }]);
    const row = next[1]!.toolEvents![1]!;
    expect(row.status).toBe('error');
    expect(row.subAgentFinalStatus).toBe('error');
    expect(row.subAgentPhase).toBeNull();
  });

  it('returns the same array when nothing matches or changes', () => {
    const turns = turnsWithSubAgent({ subAgentRunId: 'run_1', subAgentPhase: 'running' });
    expect(applySubAgentRunStatesToTurns(turns, [{ runId: 'other', status: 'running' }])).toBe(turns);
    expect(applySubAgentRunStatesToTurns(turns, [{ runId: 'run_1', status: 'running' }])).toBe(turns);
    expect(applySubAgentRunStatesToTurns(turns, [])).toBe(turns);
  });

  it('never touches non sub-agent rows even when ids collide', () => {
    const turns = turnsWithSubAgent();
    const next = applySubAgentRunStatesToTurns(turns, [
      { runId: 'run_1', status: 'awaiting_approval', parentCallId: 'call_x' },
    ]);
    expect(next).toBe(turns);
  });
});
