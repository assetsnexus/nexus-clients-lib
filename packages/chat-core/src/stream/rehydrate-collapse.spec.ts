import { describe, expect, it } from 'vitest';
import { collapseRepeatedToolRows, isToolOnlyPlaceholderText } from './rehydrate-collapse.js';
import type { ChatTurn } from '../state.js';

const row = (id: string, status: string, extra: Record<string, unknown> = {}) =>
  ({ id, tool: 'anx_command', label: 'anx_command', status, args: {}, ...extra }) as never;

describe('collapseRepeatedToolRows', () => {
  it('folds a later row into the original call (later state wins) and drops the placeholder turn', () => {
    const turns: ChatTurn[] = [
      { id: 'u1', role: 'user', text: 'read lead' },
      {
        id: 'a1',
        role: 'assistant',
        text: 'I need access.',
        toolEvents: [row('c1', 'needs_approval', { args: { command: 'anx.crm.lead.get' }, round: 1 })],
      },
      { id: 'a2', role: 'assistant', text: '[tool update]', toolEvents: [row('c1', 'reverted')] },
    ];
    const out = collapseRepeatedToolRows(turns);
    expect(out.map((t) => t.id)).toEqual(['u1', 'a1']);
    expect(out[1].toolEvents?.[0]).toMatchObject({
      id: 'c1',
      status: 'reverted',
      args: { command: 'anx.crm.lead.get' },
      round: 1,
    });
  });

  it('keeps a later turn that has real text and strips only the duplicate rows', () => {
    const turns: ChatTurn[] = [
      { id: 'a1', role: 'assistant', text: 'Checking', toolEvents: [row('c1', 'paused')] },
      {
        id: 'a2',
        role: 'assistant',
        text: 'Here it is.',
        toolEvents: [row('c1', 'success'), row('c2', 'success')],
      },
    ];
    const out = collapseRepeatedToolRows(turns);
    expect(out).toHaveLength(2);
    expect(out[0].toolEvents?.[0].status).toBe('success');
    expect(out[1].toolEvents?.map((r) => r.id)).toEqual(['c2']);
  });

  it('clears the placeholder text but keeps a tool-only turn with new rows', () => {
    const out = collapseRepeatedToolRows([
      { id: 'a1', role: 'assistant', text: '[tools]', toolEvents: [row('c9', 'success')] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('');
  });

  it('does not mutate the input turns', () => {
    const turns: ChatTurn[] = [
      { id: 'a1', role: 'assistant', text: 'x', toolEvents: [row('c1', 'needs_approval')] },
      { id: 'a2', role: 'assistant', text: '[tool update]', toolEvents: [row('c1', 'success')] },
    ];
    collapseRepeatedToolRows(turns);
    expect(turns[0].toolEvents?.[0].status).toBe('needs_approval');
    expect(turns).toHaveLength(2);
  });

  it('recognises only the backend placeholders', () => {
    expect(isToolOnlyPlaceholderText(' [tool update] ')).toBe(true);
    expect(isToolOnlyPlaceholderText('[tools]')).toBe(true);
    expect(isToolOnlyPlaceholderText('[tools] done')).toBe(false);
  });
});
