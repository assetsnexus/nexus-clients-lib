import { describe, expect, it, vi } from 'vitest';
import {
  readEmbodimentProfile,
  resolveEmbodimentFace,
  embodimentLipSyncEnabled,
  bindCompanionHost,
  playAssistantEmbodiment,
  playSessionRoutine,
  unplayedAssistantTurns,
} from './embodiment-playback.js';

describe('readEmbodimentProfile', () => {
  it('reads the top-level embodiment object', () => {
    expect(readEmbodimentProfile({ v: 1, embodiment: { zen: { preferFaceOnly: true } } })).toEqual({
      zen: { preferFaceOnly: true },
    });
  });

  it('reads a nested settings.embodiment profile', () => {
    expect(
      readEmbodimentProfile({
        v: 1,
        settings: { embodiment: { defaultMood: 'calm' } },
      } as never),
    ).toEqual({ defaultMood: 'calm' });
  });

  it('returns null when absent (fallback to current behaviour)', () => {
    expect(readEmbodimentProfile(null)).toBeNull();
    expect(readEmbodimentProfile({ v: 1 })).toBeNull();
    expect(readEmbodimentProfile({ v: 1, embodiment: null })).toBeNull();
  });
});

describe('embodimentLipSyncEnabled', () => {
  it('honours an explicit false', () => {
    expect(embodimentLipSyncEnabled({ lipSyncEnabled: false })).toBe(false);
  });
  it('is undefined when absent (keep current)', () => {
    expect(embodimentLipSyncEnabled({})).toBeUndefined();
    expect(embodimentLipSyncEnabled(null)).toBeUndefined();
  });
});

describe('resolveEmbodimentFace', () => {
  it('defaults to owner and honours an explicit face', () => {
    expect(resolveEmbodimentFace({ v: 1 })).toBe('owner');
    expect(resolveEmbodimentFace({ v: 1, embodimentFace: 'public' } as never)).toBe('public');
  });
});

describe('playAssistantEmbodiment', () => {
  it('prefers the embodiment-aware host method', () => {
    const host = {
      playEmbodimentInlineTags: vi.fn(),
      playInlineTags: vi.fn(),
    };
    expect(playAssistantEmbodiment(host, '[wave] hello', { face: 'public' })).toBe(true);
    expect(host.playEmbodimentInlineTags).toHaveBeenCalledWith(
      '[wave] hello',
      expect.objectContaining({ face: 'public', source: 'chat', enabled: true }),
    );
    expect(host.playInlineTags).not.toHaveBeenCalled();
  });

  it('falls back to plain playInlineTags when no embodiment method exists', () => {
    const host = { playInlineTags: vi.fn() };
    expect(playAssistantEmbodiment(host, '[wave] hello')).toBe(true);
    expect(host.playInlineTags).toHaveBeenCalledWith(
      '[wave] hello',
      expect.objectContaining({ source: 'chat', enabled: true }),
    );
  });

  it('no-ops on empty text or a host with no playback methods', () => {
    expect(playAssistantEmbodiment({ playInlineTags: vi.fn() }, '   ')).toBe(false);
    expect(playAssistantEmbodiment({}, '[wave]')).toBe(false);
    expect(playAssistantEmbodiment(null, '[wave]')).toBe(false);
  });
});

describe('playSessionRoutine', () => {
  it('fires greeting and farewell when supported', () => {
    const host = { playEmbodimentRoutine: vi.fn() };
    expect(playSessionRoutine(host, 'greeting')).toBe(true);
    expect(playSessionRoutine(host, 'farewell')).toBe(true);
    expect(host.playEmbodimentRoutine).toHaveBeenNthCalledWith(
      1,
      'greeting',
      expect.objectContaining({ source: 'session' }),
    );
  });

  it('no-ops without routine support', () => {
    expect(playSessionRoutine({}, 'greeting')).toBe(false);
    expect(playSessionRoutine(null, 'farewell')).toBe(false);
  });
});

describe('bindCompanionHost', () => {
  const makeHost = () => ({
    playEmbodimentInlineTags: vi.fn(),
    playInlineTags: vi.fn(),
    playEmbodimentRoutine: vi.fn(),
    setMood: vi.fn(() => true),
  });

  it('applies a mood that arrives with no new turn', () => {
    const host = makeHost();
    const update = bindCompanionHost(host, { now: () => 0 });
    update({ presenceMood: 'worried', phase: 'idle' });
    expect(host.setMood).toHaveBeenCalledWith('worried', 'agent', 'emotion');
  });

  it('does not re-apply an unchanged mood (idempotent)', () => {
    const host = makeHost();
    const update = bindCompanionHost(host, { now: () => 0 });
    update({ presenceMood: 'worried' });
    update({ presenceMood: 'worried' });
    expect(host.setMood).toHaveBeenCalledTimes(1);
  });

  it('plays a reaction beat once per seq and never re-plays a re-delivery', () => {
    const host = makeHost();
    const played: number[] = [];
    const update = bindCompanionHost(host, {
      now: () => 0,
      onBeatPlayed: (seq) => played.push(seq),
    });
    update({ presenceMood: 'annoyed', lastReactionBeat: { seq: 4, cue: '[disagree|angry=30]' } });
    expect(host.playEmbodimentInlineTags).toHaveBeenCalledWith(
      '[disagree|angry=30]',
      expect.objectContaining({ enabled: true, source: 'chat' }),
    );
    expect(played).toEqual([4]);

    // Same seq → no second dispatch.
    update({ presenceMood: 'annoyed', lastReactionBeat: { seq: 4, cue: '[disagree|angry=30]' } });
    expect(host.playEmbodimentInlineTags).toHaveBeenCalledTimes(1);
  });

  it('fires onThink on generationStart and onListen on a listening phase (cooldown-gated)', () => {
    const host = makeHost();
    let clock = 1_000;
    const update = bindCompanionHost(host, { now: () => clock, listenCooldownMs: 4_000 });
    update({ phase: 'thinking' });
    expect(host.playEmbodimentRoutine).toHaveBeenCalledWith(
      'onThink',
      expect.objectContaining({ source: 'companion' }),
    );
    update({ phase: 'idle' });
    update({ phase: 'listening' });
    expect(host.playEmbodimentRoutine).toHaveBeenCalledWith(
      'onListen',
      expect.objectContaining({ source: 'companion' }),
    );
    // A second listen inside the cooldown must not re-fire.
    host.playEmbodimentRoutine.mockClear();
    update({ phase: 'idle' });
    update({ phase: 'listening' });
    expect(host.playEmbodimentRoutine).not.toHaveBeenCalled();
    // Past the cooldown it fires again.
    clock += 5_000;
    update({ phase: 'idle' });
    update({ phase: 'listening' });
    expect(host.playEmbodimentRoutine).toHaveBeenCalledWith(
      'onListen',
      expect.objectContaining({ source: 'companion' }),
    );
  });

  it('restores the emotion mood (never neutral) when a busy phase ends', () => {
    const host = makeHost();
    const update = bindCompanionHost(host, { now: () => 0 });
    update({ presenceMood: 'worried', phase: 'thinking' });
    host.setMood.mockClear();
    update({ presenceMood: 'worried', phase: 'idle' });
    expect(host.setMood).toHaveBeenCalledWith('worried', 'agent', 'emotion');
    expect(host.setMood).not.toHaveBeenCalledWith('neutral', expect.anything(), expect.anything());
  });

  it('restores the profile default mood when no emotion mood is live', () => {
    const host = makeHost();
    const update = bindCompanionHost(host, { now: () => 0 });
    update({ presenceMood: 'happy', phase: 'thinking' });
    host.setMood.mockClear();
    update({ presenceMood: null, defaultMood: 'calm', phase: 'idle' });
    expect(host.setMood).toHaveBeenCalledWith('calm', 'agent', 'emotion');
  });

  it('no-ops for a null host or a null state', () => {
    const update = bindCompanionHost(null);
    expect(() => update({ presenceMood: 'happy' })).not.toThrow();
    const host = makeHost();
    bindCompanionHost(host)(null);
    expect(host.setMood).not.toHaveBeenCalled();
  });
});

describe('unplayedAssistantTurns', () => {
  it('returns only assistant turns not yet played, in order', () => {
    const seen = new Set<string>();
    const turns = [
      { id: 'u1', role: 'user', text: 'hi' },
      { id: 'a1', role: 'assistant', text: '[wave] hello' },
      { id: 'a2', role: 'assistant', text: '' },
      { id: 'a3', role: 'assistant', text: '[smile] ok' },
    ];
    const first = unplayedAssistantTurns(turns, seen);
    expect(first.map((t) => t.key)).toEqual(['a1', 'a3']);
    expect(unplayedAssistantTurns(turns, seen)).toEqual([]);
    // A new turn is picked up on the next render.
    const next = unplayedAssistantTurns([...turns, { id: 'a4', role: 'assistant', text: 'bye' }], seen);
    expect(next.map((t) => t.key)).toEqual(['a4']);
  });
});
