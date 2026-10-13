import { describe, expect, it } from 'vitest';
import {
  isSubAgentDetailsOpen,
  normalizeSteerText,
  overlaySurfacePaint,
  subAgentRunControls,
} from './sub-agent-overlay.js';

describe('sub-agent details open decision', () => {
  it('stays closed until the chip is opened and a run exists', () => {
    expect(isSubAgentDetailsOpen(false, 2)).toBe(false);
    expect(isSubAgentDetailsOpen(true, 0)).toBe(false);
    expect(isSubAgentDetailsOpen(true, 1)).toBe(true);
  });
});

describe('sub-agent run controls', () => {
  const live = { status: 'running', runId: 'run-1', linkedConversationId: 'conv-1' };

  it('offers pause, cancel, view chat, and steer while a run is live', () => {
    expect(subAgentRunControls(live, { hasClient: true })).toEqual({
      pause: true,
      resume: false,
      cancel: true,
      openChat: true,
      steer: true,
    });
  });

  it('offers resume instead of pause when the run is paused', () => {
    const controls = subAgentRunControls({ ...live, status: 'paused' }, { hasClient: true });
    expect(controls.pause).toBe(false);
    expect(controls.resume).toBe(true);
    expect(controls.cancel).toBe(true);
    expect(controls.steer).toBe(true);
    expect(controls.openChat).toBe(true);
  });

  it('keeps view chat for a finished run and drops steer controls', () => {
    expect(
      subAgentRunControls(
        { status: 'completed', runId: 'run-1', linkedConversationId: 'conv-1' },
        { hasClient: true },
      ),
    ).toEqual({
      pause: false,
      resume: false,
      cancel: false,
      openChat: true,
      steer: false,
    });
  });

  it('can still open a child when only the run id is known', () => {
    const controls = subAgentRunControls(
      { status: 'completed', runId: 'run-1', linkedConversationId: null },
      { hasClient: true },
    );
    expect(controls.openChat).toBe(true);
    expect(controls.steer).toBe(false);
  });

  it('does not offer mutate controls without a command client', () => {
    const controls = subAgentRunControls(live, { hasClient: false });
    expect(controls.pause).toBe(false);
    expect(controls.resume).toBe(false);
    expect(controls.cancel).toBe(false);
    expect(controls.steer).toBe(false);
    expect(controls.openChat).toBe(true);
  });
});

describe('steer text', () => {
  it('rejects an empty message and accepts a trimmed one', () => {
    expect(normalizeSteerText('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(normalizeSteerText('  look at the notes  ')).toEqual({ ok: true, text: 'look at the notes' });
  });

  it('rejects a message past the limit', () => {
    expect(normalizeSteerText('x'.repeat(2001)).ok).toBe(false);
  });
});

describe('overlay surface paint', () => {
  it('keeps an opaque surface token', () => {
    const paint = overlaySurfacePaint({
      surface: '#1a1d27',
      text: '#e8eaef',
      border: '#2a2f3d',
    });
    expect(paint.backgroundColor).toBe('rgb(26, 29, 39)');
    expect(paint.color).toBe('rgb(232, 234, 239)');
    expect(paint.borderColor).toBe('rgb(42, 47, 61)');
  });

  it('replaces a transparent surface with a solid plate that contrasts with the text', () => {
    const light = overlaySurfacePaint({
      surface: 'transparent',
      text: 'rgba(0, 0, 0, 0.87)',
      border: 'transparent',
    });
    expect(light.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(light.color).toBe('rgb(0, 0, 0)');
    expect(light.borderColor).not.toBe(light.backgroundColor);

    const dark = overlaySurfacePaint({
      surface: 'rgba(0, 0, 0, 0)',
      text: 'rgba(255, 255, 255, 0.92)',
      border: 'transparent',
    });
    expect(dark.backgroundColor).toBe('rgb(26, 29, 39)');
    expect(dark.color).toBe('rgb(255, 255, 255)');
  });

  it('composites a glassy surface onto an opaque plate', () => {
    const paint = overlaySurfacePaint({
      surface: 'rgba(255, 255, 255, 0.1)',
      text: 'rgb(255, 255, 255)',
      border: 'rgba(255, 255, 255, 0.18)',
    });
    expect(paint.backgroundColor.startsWith('rgb(')).toBe(true);
    expect(paint.backgroundColor).not.toBe('rgb(255, 255, 255)');
    const channels = paint.backgroundColor.match(/\d+/g)?.map(Number) ?? [];
    expect(channels[0]).toBeGreaterThan(26);
    expect(channels[0]).toBeLessThan(80);
  });
});
