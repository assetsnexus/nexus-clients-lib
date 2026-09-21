import { describe, expect, it } from 'vitest';
import {
  collectSubAgentRuns,
  activeSubAgentCountFromTurns,
  visibleSubAgentStripRuns,
} from './collect-runs.js';
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

  it('copies error text onto strip items', () => {
    const turns: ChatTurn[] = [
      {
        id: 't1',
        role: 'assistant',
        text: '',
        toolEvents: [
          {
            id: 'call-err',
            tool: 'run_sub_agent',
            label: 'run_sub_agent',
            status: 'error',
            args: { mission: 'Boom' },
            kind: 'sub_agent',
            subAgentRunId: 'run-err',
            subAgentFinalStatus: 'failed',
            error: 'Quota exceeded for web search',
          },
        ],
      },
    ];
    const items = collectSubAgentRuns(turns);
    expect(items[0].error).toBe('Quota exceeded for web search');
    expect(items[0].status).toBe('failed');
  });

  it('hides completed when any run is active; dismiss filters completed', () => {
    const runs = [
      {
        id: 'old',
        runId: 'run-old',
        parentCallId: 'c-old',
        mission: 'Old',
        status: 'completed',
      },
      {
        id: 'live',
        runId: 'run-live',
        parentCallId: 'c-live',
        mission: 'Live',
        status: 'running',
      },
      {
        id: 'wait',
        runId: 'run-wait',
        parentCallId: 'c-wait',
        mission: 'Needs grant',
        status: 'awaiting_approval',
      },
    ];
    const whileLive = visibleSubAgentStripRuns(runs);
    expect(whileLive.map((r) => r.id).sort()).toEqual(['live', 'wait']);

    const doneOnly = visibleSubAgentStripRuns(
      runs.map((r) => (r.id === 'live' || r.id === 'wait' ? { ...r, status: 'completed' } : r)),
      ['old'],
    );
    expect(doneOnly.map((r) => r.id)).toEqual(['live', 'wait']);
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
