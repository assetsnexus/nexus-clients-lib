import { describe, expect, it } from 'vitest';
import {
  applyRoomDispatchPlan,
  mergePrependedTurns,
  shouldKeepRoomAssistantPlaceholder,
} from './history-turns.js';

describe('history turns', () => {
  it('prepends older turns and keeps the streaming assistant', () => {
    const existing = [
      { id: 'u1', role: 'user' },
      { id: 'a_live', role: 'assistant', text: '' },
    ];
    const incoming = [
      { id: 'u0', role: 'user' },
      { id: 'u1', role: 'user' },
    ];
    expect(mergePrependedTurns(existing, incoming).map((t) => t.id)).toEqual(['u0', 'u1', 'a_live']);
  });

  it('drops the room placeholder when no agent will respond', () => {
    expect(shouldKeepRoomAssistantPlaceholder({ responders: [] })).toBe(false);
    expect(shouldKeepRoomAssistantPlaceholder({ responders: [{ participantId: 'a' }] })).toBe(true);
    expect(shouldKeepRoomAssistantPlaceholder(undefined)).toBe(true);
  });

  it('drops the placeholder when a dispatch plan has no responders', () => {
    const turns = [
      { id: 'u1', role: 'user' },
      { id: 'a_live', role: 'assistant', text: '' },
    ];
    const applied = applyRoomDispatchPlan(turns, 'a_live', {
      responders: [],
      skippedReason: 'no_ai_participants',
    });
    expect(applied.dropped).toBe(true);
    expect(applied.lastDispatchSkip).toBe('no_ai_participants');
    expect(applied.turns.map((turn) => turn.id)).toEqual(['u1']);
  });
});