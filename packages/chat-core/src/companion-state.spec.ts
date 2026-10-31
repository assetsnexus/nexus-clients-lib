import { describe, expect, it } from 'vitest';
import {
  INITIAL_COMPANION_STATE,
  applyCompanionMood,
  applyTurnsToCompanionState,
  moodFromTurns,
  pendingReactionBeat,
  phaseFromPanel,
  readMoodFields,
  restoreCompanionMood,
  setCompanionDefaultMood,
  setCompanionPhase,
} from './companion-state.js';
import type { ChatTurn } from './state.js';

const turn = (patch: Partial<ChatTurn>): ChatTurn => ({
  id: patch.id ?? 't',
  role: patch.role ?? 'assistant',
  text: patch.text ?? 'hi',
  ...patch,
});

describe('readMoodFields', () => {
  it('reads and trims the three mood fields', () => {
    expect(readMoodFields({ presenceMood: ' worried ', voiceStyleHint: 'soft', reactionBeat: '[look_around|surprised=35]' }))
      .toEqual({
        presenceMood: 'worried',
        voiceStyleHint: 'soft',
        reactionBeat: '[look_around|surprised=35]',
      });
  });

  it('treats a blank / missing / non-object payload as empty', () => {
    const empty = { presenceMood: null, voiceStyleHint: null, reactionBeat: null };
    expect(readMoodFields({ presenceMood: '   ' })).toEqual(empty);
    expect(readMoodFields(null)).toEqual(empty);
    expect(readMoodFields('worried')).toEqual(empty);
  });
});

describe('applyCompanionMood', () => {
  it('applies a mood + voice hint from a silent frame (no new turn)', () => {
    const next = applyCompanionMood(INITIAL_COMPANION_STATE, {
      presenceMood: 'worried',
      voiceStyleHint: 'soft',
    });
    expect(next.presenceMood).toBe('worried');
    expect(next.voiceStyleHint).toBe('soft');
  });

  it('returns the identical object when the frame carries no mood (no re-render)', () => {
    const state = applyCompanionMood(INITIAL_COMPANION_STATE, { presenceMood: 'worried' });
    expect(applyCompanionMood(state, { content: 'just text' })).toBe(state);
  });

  it('never clears a mood the frame omits', () => {
    const state = applyCompanionMood(INITIAL_COMPANION_STATE, {
      presenceMood: 'worried',
      voiceStyleHint: 'soft',
    });
    const next = applyCompanionMood(state, { presenceMood: 'calm' });
    expect(next.voiceStyleHint).toBe('soft');
    expect(next.presenceMood).toBe('calm');
  });

  it('records a reaction beat once per cue and ignores a re-delivery', () => {
    const first = applyCompanionMood(INITIAL_COMPANION_STATE, {
      presenceMood: 'annoyed',
      reactionBeat: '[disagree|angry=30]',
    }, { seq: 7, at: '2026-01-01T00:00:00.000Z' });
    expect(first.lastReactionBeat).toEqual({
      seq: 7,
      cue: '[disagree|angry=30]',
      mood: 'annoyed',
      at: '2026-01-01T00:00:00.000Z',
    });

    // Same cue replayed → the state object is untouched (the gesture must not
    // fire twice for one server-side beat).
    const replay = applyCompanionMood(first, { reactionBeat: '[disagree|angry=30]' });
    expect(replay).toBe(first);

    // A different cue is a new beat.
    const second = applyCompanionMood(replay, { reactionBeat: '[look_around|surprised=35]' });
    expect(second.lastReactionBeat?.cue).toBe('[look_around|surprised=35]');
    expect(second.lastReactionBeat?.seq).toBe(8);
  });

  it('assigns a monotonic seq when the caller does not supply one', () => {
    const a = applyCompanionMood(INITIAL_COMPANION_STATE, { reactionBeat: '[a]' });
    const b = applyCompanionMood(a, { reactionBeat: '[b]' });
    expect(a.lastReactionBeat?.seq).toBe(1);
    expect(b.lastReactionBeat?.seq).toBe(2);
  });
});

describe('setCompanionPhase / setCompanionDefaultMood', () => {
  it('is idempotent for an unchanged phase', () => {
    const state = setCompanionPhase(INITIAL_COMPANION_STATE, 'thinking');
    expect(setCompanionPhase(state, 'thinking')).toBe(state);
    expect(setCompanionPhase(state, 'idle').phase).toBe('idle');
  });

  it('trims and dedupes the default mood', () => {
    const state = setCompanionDefaultMood(INITIAL_COMPANION_STATE, '  calm ');
    expect(state.defaultMood).toBe('calm');
    expect(setCompanionDefaultMood(state, 'calm')).toBe(state);
    expect(setCompanionDefaultMood(state, '').defaultMood).toBeNull();
  });
});

describe('restoreCompanionMood', () => {
  it('prefers the live emotion mood over the profile default', () => {
    const state = { ...INITIAL_COMPANION_STATE, presenceMood: 'worried', defaultMood: 'calm' };
    expect(restoreCompanionMood(state)).toBe('worried');
  });

  it('falls back to the profile default when no emotion mood is live', () => {
    const state = { ...INITIAL_COMPANION_STATE, presenceMood: null, defaultMood: 'calm' };
    expect(restoreCompanionMood(state)).toBe('calm');
  });

  it('never invents a mood when neither is known', () => {
    expect(restoreCompanionMood(INITIAL_COMPANION_STATE)).toBeNull();
  });
});

describe('moodFromTurns / applyTurnsToCompanionState', () => {
  it('takes the newest assistant turn that carries a mood', () => {
    const turns = [
      turn({ id: 'a1', presenceMood: 'happy' }),
      turn({ id: 'u1', role: 'user', text: 'ok' }),
      turn({ id: 'a2', presenceMood: 'worried', voiceStyleHint: 'soft' }),
    ];
    expect(moodFromTurns(turns)).toEqual({ presenceMood: 'worried', voiceStyleHint: 'soft' });
  });

  it('skips user turns and mood-less assistant turns', () => {
    const turns = [turn({ id: 'u1', role: 'user', presenceMood: 'ignored' }), turn({ id: 'a1' })];
    expect(moodFromTurns(turns)).toEqual({ presenceMood: null, voiceStyleHint: null });
  });

  it('rehydrates a companion state from history', () => {
    const next = applyTurnsToCompanionState(INITIAL_COMPANION_STATE, [
      turn({ id: 'a1', presenceMood: 'annoyed' }),
    ]);
    expect(next.presenceMood).toBe('annoyed');
  });

  it('is a no-op when no turn carries a mood', () => {
    const state = { ...INITIAL_COMPANION_STATE, presenceMood: 'happy' };
    expect(applyTurnsToCompanionState(state, [turn({ id: 'a1' })])).toBe(state);
  });
});

describe('pendingReactionBeat', () => {
  it('returns a beat that has not been played yet', () => {
    const state = applyCompanionMood(INITIAL_COMPANION_STATE, { reactionBeat: '[a]' }, { seq: 3 });
    expect(pendingReactionBeat(state, null)?.seq).toBe(3);
  });

  it('returns null once the host has played that seq', () => {
    const state = applyCompanionMood(INITIAL_COMPANION_STATE, { reactionBeat: '[a]' }, { seq: 3 });
    expect(pendingReactionBeat(state, 3)).toBeNull();
  });

  it('returns null when there is no beat', () => {
    expect(pendingReactionBeat(INITIAL_COMPANION_STATE, null)).toBeNull();
  });
});

describe('phaseFromPanel', () => {
  it('maps a streaming / generating panel to thinking', () => {
    expect(phaseFromPanel({ streaming: true, generationInProgress: false })).toBe('thinking');
    expect(phaseFromPanel({ streaming: false, generationInProgress: true })).toBe('thinking');
  });

  it('maps an idle panel (or no panel) to idle', () => {
    expect(phaseFromPanel({ streaming: false, generationInProgress: false })).toBe('idle');
    expect(phaseFromPanel(null)).toBe('idle');
  });
});
