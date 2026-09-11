import { describe, expect, it } from 'vitest';
import { collectSubAgentRuns, activeSubAgentCountFromTurns } from './collect-runs.js';
import { rehydrateToolRunsFromHistory } from '../stream/tool-events.js';
import type { ChatTurn } from '../state.js';

describe('collectSubAgentRuns', () => {
  it('aggregates run_sub_agent tool events across turns', () => {
    const turns: ChatTurn[] = [
      {
        id: 't1',
        role: 'assistant',
        text: '',
        toolEvents: [
          {
            id: 'call-1',
            tool: 'run_sub_agent',
            label: 'run_sub_agent',
            status: 'running',
            args: { mission: 'Research solar' },
            kind: 'sub_agent',
            subAgentRunId: 'run-1',
            linkedConversationId: 'child-1',
          },
        ],
      },
    ];
    const items = collectSubAgentRuns(turns);
    expect(items).toHaveLength(1);
    expect(items[0].mission).toBe('Research solar');
    expect(items[0].runId).toBe('run-1');
    expect(items[0].linkedConversationId).toBe('child-1');
    expect(activeSubAgentCountFromTurns(turns)).toBe(1);
  });

  it('reads linkedConversationId from nested tool result when not promoted', () => {
    const turns: ChatTurn[] = [
      {
        id: 't1',
        role: 'assistant',
        text: '',
        toolEvents: [
          {
            id: 'call-2',
            tool: 'run_sub_agent',
            label: 'run_sub_agent',
            status: 'running',
            args: { mission: 'Nested link' },
            kind: 'sub_agent',
            result: {
              status: 'running',
              runId: 'run-nested',
              linkedConversationId: 'child-nested',
            },
          },
        ],
      },
    ];
    const items = collectSubAgentRuns(turns);
    expect(items).toHaveLength(1);
    expect(items[0].runId).toBe('run-nested');
    expect(items[0].linkedConversationId).toBe('child-nested');
  });

  it('rehydrates subagent fidelity from history rows', () => {
    const runs = rehydrateToolRunsFromHistory([
      {
        callId: 'sa1',
        name: 'run_sub_agent',
        kind: 'sub_agent',
        arguments: { mission: 'Find X' },
        subAgentRunId: 'run-42',
        linkedConversationId: 'conv-child',
        subAgentFinalStatus: 'completed',
        subAgentSummary: { result: 'ok' },
        subAgentText: 'answer text',
        status: 'success',
      },
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0].kind).toBe('sub_agent');
    expect(runs[0].subAgentRunId).toBe('run-42');
    expect(runs[0].linkedConversationId).toBe('conv-child');
    expect(runs[0].subAgentFinalStatus).toBe('completed');
    expect(runs[0].subAgentText).toContain('answer text');
  });
});
