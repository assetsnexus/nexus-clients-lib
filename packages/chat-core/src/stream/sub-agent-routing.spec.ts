import { describe, expect, it } from 'vitest';
import type { ChatTurn } from '../state.js';
import { applyStreamEventToTurns } from './stream-events.js';
import { mergeToolStreamEvents, rehydrateToolRunsFromHistory } from './tool-events.js';

function rehydratedTurns(): ChatTurn[] {
  const toolEvents = rehydrateToolRunsFromHistory([
    {
      callId: 'call_parent',
      name: 'run_sub_agent',
      kind: 'sub_agent',
      subAgentRunId: 'run_1',
      status: 'running',
      arguments: {},
    },
  ]);
  return [
    { id: 'u1', role: 'user', text: 'research' },
    { id: 'a1', role: 'assistant', text: 'Kicked off', toolEvents, rawToolStream: [] },
    { id: 'u2', role: 'user', text: 'thanks' },
    { id: 'a2', role: 'assistant', text: 'ok', toolEvents: [], rawToolStream: [] },
  ] as ChatTurn[];
}

describe('sub-agent stream routing', () => {
  it('child tool calls never become top-level rows', () => {
    const rows = mergeToolStreamEvents([
      { type: 'tool_call', data: { callId: 'call_parent', name: 'run_sub_agent', arguments: {} } },
      {
        type: 'sub_agent_tool_call',
        data: { callId: 'child_1', name: 'anx_command', subAgentRunId: 'run_1', parentCallId: 'call_parent' },
      },
      {
        type: 'sub_agent_tool_result',
        data: { callId: 'child_1', name: 'anx_command', subAgentRunId: 'run_1', result: {} },
      },
    ]);
    expect(rows.map((r) => r.id)).toEqual(['call_parent']);
  });

  it('engine progress without callId routes to the rehydrated owner turn by run id', () => {
    const turns = rehydratedTurns();
    const next = applyStreamEventToTurns(turns, '__observer__', {
      type: 'sub_agent_progress',
      data: {
        subAgentRunId: 'run_1',
        status: 'awaiting_approval',
        approvalKind: 'permission_elevation',
        elevationId: 'elev_1',
        pack: 'ai-agents',
        command: 'anx.ai-agents.web-search',
      },
    });
    const owner = next[1]!;
    const row = owner.toolEvents!.find((r) => r.id === 'call_parent')!;
    expect(row.subAgentPhase).toBe('awaiting_approval');
    expect(row.subAgentPendingApproval?.elevationId).toBe('elev_1');
    expect(owner.rawToolStream).toHaveLength(1);
    expect(next[3]).toBe(turns[3]);
  });

  it('live child tool calls land in the owner turn raw stream for the widget tail', () => {
    let turns = rehydratedTurns();
    turns = applyStreamEventToTurns(turns, '__observer__', {
      type: 'sub_agent_tool_call',
      data: { callId: 'child_1', name: 'anx_command', subAgentRunId: 'run_1' },
    });
    turns = applyStreamEventToTurns(turns, '__observer__', {
      type: 'sub_agent_token',
      data: { subAgentRunId: 'run_1', text: 'Searching…' },
    });
    const owner = turns[1]!;
    expect(owner.toolEvents!.map((r) => r.id)).toEqual(['call_parent']);
    expect(owner.rawToolStream!.map((e) => e.type)).toEqual(['sub_agent_tool_call', 'sub_agent_token']);
  });

  it('events for an unknown run are dropped when no turn owns them', () => {
    const turns = rehydratedTurns();
    const next = applyStreamEventToTurns(turns, '__observer__', {
      type: 'sub_agent_token',
      data: { subAgentRunId: 'unknown', text: 'x' },
    });
    expect(next).toBe(turns);
  });
});
