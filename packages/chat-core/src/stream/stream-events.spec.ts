import { describe, expect, it } from 'vitest';
import { applyStreamEventToTurns, isEmptyAssistantTurn, parseStreamMessage } from './stream-events.js';
import { mergeToolStreamEvents, rehydrateToolRunsFromHistory, patchToolRunStatus } from './tool-events.js';
import type { ChatTurn } from '../state.js';

describe('stream-events', () => {
  it('turn_snapshot replaces the live bubble text (reattach replay)', () => {
    const turns: ChatTurn[] = [{ id: 'a1', role: 'assistant', text: 'stale tail' }];
    const next = applyStreamEventToTurns(turns, 'a1', {
      type: 'turn_snapshot',
      data: { text: 'Full answer so far' },
    });
    expect(next[0]!.text).toBe('Full answer so far');
    const after = applyStreamEventToTurns(next, 'a1', { type: 'token', data: { text: '!' } });
    expect(after[0]!.text).toBe('Full answer so far!');
  });

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

  it('promotes anx_command onto args from denormalized tool_result.command', () => {
    const runs = mergeToolStreamEvents([
      {
        type: 'tool_call',
        data: {
          callId: 'c1',
          name: 'anx_command',
          arguments: '{}',
        },
      },
      {
        type: 'tool_result',
        data: {
          callId: 'c1',
          name: 'anx_command',
          command: 'anx.crm.campaign.strategy.update',
          result: { status: 'ok' },
          status: 'success',
        },
      },
    ]);
    expect(runs[0]).toMatchObject({
      tool: 'anx_command',
      status: 'success',
      args: { command: 'anx.crm.campaign.strategy.update' },
    });
  });

  it('rehydrates anx_command from result.command when history args were stripped', () => {
    const runs = rehydrateToolRunsFromHistory([
      {
        id: 'c1',
        name: 'anx_command',
        arguments: {},
        result: { status: 'ok', command: 'anx.notes.create' },
        status: 'success',
      },
    ]);
    expect(runs[0]?.args?.command).toBe('anx.notes.create');
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

  it('paused preserves real tool name (no synthetic TOOL pause TOOL)', () => {
    let turns: ChatTurn[] = [
      { id: 'a1', role: 'assistant', text: '', toolEvents: [], rawToolStream: [] },
    ];
    turns = applyStreamEventToTurns(turns, 'a1', {
      type: 'tool_call',
      data: {
        callId: 'cb1',
        name: 'schedule_check_back',
        arguments: '{"delaySec":60,"reason":"wait"}',
      },
    });
    turns = applyStreamEventToTurns(turns, 'a1', {
      type: 'tool_result',
      data: {
        callId: 'cb1',
        name: 'schedule_check_back',
        result: {
          scheduled: true,
          delaySec: 60,
          reason: 'wait',
          wakeAt: new Date().toISOString(),
          watchIds: [],
          iteration: 1,
          message: 'ok',
        },
      },
    });
    turns = applyStreamEventToTurns(turns, 'a1', {
      type: 'paused',
      data: { conversationId: 'c1', callId: 'cb1', reason: 'check_back' },
    });
    const run = turns[0].toolEvents!.find((e) => e.id === 'cb1');
    expect(run?.tool).toBe('schedule_check_back');
    expect(run?.label).toBe('schedule_check_back');
    expect(run?.status).toBe('paused');
    expect(run?.tool).not.toBe('tool');
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

  describe('continuation events for calls owned by an earlier turn', () => {
    const rehydrated = (): ChatTurn[] => [
      { id: 'u1', role: 'user', text: 'read it' },
      {
        id: 'a1',
        role: 'assistant',
        text: 'Needs approval',
        // Rehydrated from history: rows without rawToolStream.
        toolEvents: [
          { id: 'other', tool: 'search', label: 'search', status: 'success', args: {} },
          {
            id: 'c1',
            tool: 'anx_command',
            label: 'anx_command',
            status: 'needs_approval',
            args: { command: 'anx.crm.lead.get' },
          },
        ],
      },
      { id: 'a_resume', role: 'assistant', text: '', toolEvents: [], rawToolStream: [] },
    ];

    it('patches the original row in place instead of duplicating it on the resume turn', () => {
      const turns = applyStreamEventToTurns(rehydrated(), 'a_resume', {
        type: 'tool_result',
        data: { callId: 'c1', name: 'anx_command', status: 'reverted', result: { approved: false } },
      });
      expect(turns[1].toolEvents).toHaveLength(2);
      expect(turns[1].toolEvents?.[0].id).toBe('other');
      expect(turns[1].toolEvents?.[1]).toMatchObject({
        id: 'c1',
        status: 'reverted',
        args: { command: 'anx.crm.lead.get' },
      });
      expect(turns[2].toolEvents).toEqual([]);
      expect(isEmptyAssistantTurn(turns[2])).toBe(true);
    });

    it('marks an earlier-turn row paused without touching the resume turn', () => {
      const turns = applyStreamEventToTurns(rehydrated(), 'a_resume', {
        type: 'paused',
        data: { callId: 'c1' },
      });
      expect(turns[1].toolEvents?.[1].status).toBe('paused');
      expect(turns[2].toolEvents).toEqual([]);
    });

    it('still adds new calls to the streaming turn', () => {
      const turns = applyStreamEventToTurns(rehydrated(), 'a_resume', {
        type: 'tool_result',
        data: { callId: 'new', name: 'search', status: 'success', result: {} },
      });
      expect(turns[2].toolEvents?.map((r) => r.id)).toEqual(['new']);
      expect(turns[1].toolEvents).toHaveLength(2);
    });
  });

  it('assistant_final fills a non-streamed continuation but never duplicates streamed text', () => {
    let turns: ChatTurn[] = [{ id: 'a1', role: 'assistant', text: '', toolEvents: [] }];
    turns = applyStreamEventToTurns(turns, 'a1', {
      type: 'assistant_final',
      data: { content: 'Here is the lead.' },
    });
    expect(turns[0].text).toBe('Here is the lead.');
    turns = applyStreamEventToTurns(turns, 'a1', {
      type: 'assistant_final',
      data: { content: 'Here is the lead.' },
    });
    expect(turns[0].text).toBe('Here is the lead.');
  });
});
