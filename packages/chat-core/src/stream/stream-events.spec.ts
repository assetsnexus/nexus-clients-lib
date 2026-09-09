import { describe, expect, it } from 'vitest';
import { applyStreamEventToTurns, parseStreamMessage } from './stream-events.js';
import { mergeToolStreamEvents, rehydrateToolRunsFromHistory, patchToolRunStatus } from './tool-events.js';
import type { ChatTurn } from '../state.js';

describe('stream-events', () => {
  it('parses JSON stream messages', () => {
    expect(parseStreamMessage('{"type":"token","data":{"text":"hi"}}')).toEqual({
      type: 'token',
      data: { text: 'hi' },
    });
    expect(parseStreamMessage('not-json')).toBeNull();
  });

  it('merges tool_call + tool_result by callId and keeps tokens', () => {
    let turns: ChatTurn[] = [
      { id: 'u1', role: 'user', text: 'hello' },
      { id: 'a1', role: 'assistant', text: '', toolEvents: [] },
    ];
    turns = applyStreamEventToTurns(turns, 'a1', { type: 'token', data: { text: 'Hi' } });
    turns = applyStreamEventToTurns(turns, 'a1', {
      type: 'tool_call',
      data: { name: 'search', callId: 't1', arguments: '{"q":"x"}' },
    });
    turns = applyStreamEventToTurns(turns, 'a1', {
      type: 'tool_result',
      data: { name: 'search', callId: 't1', result: { hits: 1 }, status: 'needs_approval', approvalId: 'ap1' },
    });
    expect(turns[1].text).toBe('Hi');
    expect(turns[1].toolEvents).toHaveLength(1);
    expect(turns[1].toolEvents?.[0]).toMatchObject({
      id: 't1',
      tool: 'search',
      status: 'needs_approval',
      approvalId: 'ap1',
      args: { q: 'x' },
    });
  });

  it('clears stale assistant text on generationStart', () => {
    let turns: ChatTurn[] = [{ id: 'a1', role: 'assistant', text: 'Hello again!' }];
    turns = applyStreamEventToTurns(turns, 'a1', {
      type: 'conversation',
      data: { conversationId: 'c1', generationStart: true },
    });
    expect(turns[0].text).toBe('');
  });

  it('records usage and compaction on the turn', () => {
    let turns: ChatTurn[] = [{ id: 'a1', role: 'assistant', text: '' }];
    turns = applyStreamEventToTurns(turns, 'a1', {
      type: 'usage',
      data: { tokensUsed: 10, maxContextTokens: 100, costCents: 1, creditsCents: 1 },
    });
    turns = applyStreamEventToTurns(turns, 'a1', {
      type: 'conversation',
      data: { compaction: { beforeTokens: 90, afterTokens: 40, summary: 'trimmed' } },
    });
    expect(turns[0].usage?.tokensUsed).toBe(10);
    expect(turns[0].usage?.creditsCents).toBe(1);
    expect(turns[0].compaction?.afterTokens).toBe(40);
  });

  it('WP23: sub_agent_token routes to rawToolStream, not parent text', () => {
    let turns: ChatTurn[] = [
      { id: 'a1', role: 'assistant', text: 'Before', toolEvents: [], rawToolStream: [] },
    ];
    turns = applyStreamEventToTurns(turns, 'a1', {
      type: 'sub_agent_token',
      data: { text: 'sub text', parentCallId: 'sa1' },
    });
    // Text must NOT be appended to parent bubble
    expect(turns[0].text).toBe('Before');
    // Must be routed to rawToolStream
    expect(turns[0].rawToolStream).toHaveLength(1);
    expect(turns[0].rawToolStream![0].type).toBe('sub_agent_token');
    // Must create a tool event for the sub-agent
    expect(turns[0].toolEvents).toHaveLength(1);
    expect(turns[0].toolEvents![0].kind).toBe('sub_agent');
    expect(turns[0].toolEvents![0].subAgentText).toBe('sub text');
  });

  it('WP23: sub_agent_done captures finalStatus and summary', () => {
    let turns: ChatTurn[] = [
      { id: 'a1', role: 'assistant', text: '', toolEvents: [], rawToolStream: [] },
    ];
    // Start with a tool_call for run_sub_agent
    turns = applyStreamEventToTurns(turns, 'a1', {
      type: 'tool_call',
      data: { callId: 'sa1', name: 'run_sub_agent', arguments: '{"mission":"research"}' },
    });
    turns = applyStreamEventToTurns(turns, 'a1', {
      type: 'sub_agent_token',
      data: { text: 'answer', parentCallId: 'sa1', tokensUsed: 42 },
    });
    turns = applyStreamEventToTurns(turns, 'a1', {
      type: 'sub_agent_done',
      data: { callId: 'sa1', summary: { result: 'found' }, finalStatus: 'completed' },
    });
    const run = turns[0].toolEvents!.find((e) => e.id === 'sa1');
    expect(run).toBeDefined();
    expect(run!.subAgentText).toBe('answer');
    expect(run!.subAgentTokensUsed).toBe(42);
    expect(run!.subAgentFinalStatus).toBe('completed');
    expect(run!.subAgentSummary).toEqual({ result: 'found' });
    expect(run!.status).toBe('success');
    // Text must still NOT be in parent bubble
    expect(turns[0].text).toBe('');
  });

  it('skips [Error] text for billing stream codes', () => {
    let turns: ChatTurn[] = [{ id: 'a1', role: 'assistant', text: '' }];
    turns = applyStreamEventToTurns(turns, 'a1', {
      type: 'error',
      data: { code: 'INSUFFICIENT_CREDITS', message: 'Insufficient credits' },
    });
    expect(turns[0].text).toBe('');
    turns = applyStreamEventToTurns(turns, 'a1', {
      type: 'error',
      data: { message: 'Model exploded' },
    });
    expect(turns[0].text).toContain('[Error: Model exploded]');
  });
});

describe('tool-events', () => {
  it('rehydrates history toolCalls', () => {
    const runs = rehydrateToolRunsFromHistory([
      { callId: 'c1', name: 'echo', arguments: { text: 'hi' }, result: { ok: true }, status: 'success' },
    ]);
    expect(runs[0]).toMatchObject({ id: 'c1', tool: 'echo', status: 'success', args: { text: 'hi' } });
  });

  it('patches approval status', () => {
    const runs = mergeToolStreamEvents([
      { type: 'tool_call', data: { callId: 'c1', name: 'x', arguments: '{}' } },
      { type: 'tool_result', data: { callId: 'c1', name: 'x', status: 'needs_approval', result: {} } },
    ]);
    const patched = patchToolRunStatus(runs, 'c1', { status: 'approved', approvalRequired: false });
    expect(patched[0].status).toBe('approved');
  });
});
