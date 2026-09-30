import { describe, expect, it } from 'vitest';
import type { ChatTurn } from '@nexus/chat-core';
import {
  subAgentChipLabel,
  summarizeSubAgentChip,
  worstSubAgentStatus,
} from './sub-agent-chip.js';

function turnWithRuns(
  runs: Array<{ id: string; status: string; mission?: string; error?: string }>,
): ChatTurn {
  return {
    id: 't1',
    role: 'assistant',
    text: '',
    toolEvents: runs.map((r) => ({
      id: r.id,
      tool: 'run_sub_agent',
      label: r.mission || 'Subagent',
      status: r.status as 'running',
      args: { mission: r.mission || 'Subagent' },
      kind: 'sub_agent' as const,
      subAgentRunId: r.id,
      error: r.error || null,
    })),
  };
}

describe('sub-agent chip aggregation', () => {
  it('aggregates count and worst status into one chip', () => {
    const summary = summarizeSubAgentChip([
      turnWithRuns([
        { id: 'a', status: 'running', mission: 'A' },
        { id: 'b', status: 'error', mission: 'B', error: 'boom' },
      ]),
    ]);
    expect(summary).not.toBeNull();
    expect(summary!.count).toBe(1);
    expect(summary!.worstStatus).toBe('running');
    // Only active runs when any are active.
    expect(subAgentChipLabel(summary!)).toContain('1 sub-agent');
  });

  it('picks worst among visible completed when none active', () => {
    const summary = summarizeSubAgentChip([
      turnWithRuns([
        { id: 'a', status: 'completed', mission: 'A' },
        { id: 'b', status: 'error', mission: 'B', error: 'x' },
      ]),
    ]);
    expect(summary!.count).toBe(2);
    expect(worstSubAgentStatus(summary!.runs)).toBe('error');
    expect(summary!.hasError).toBe(true);
  });
});
