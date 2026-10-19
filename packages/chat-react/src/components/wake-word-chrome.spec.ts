import { describe, expect, it } from 'vitest';
import {
  WAKE_NOT_AUTH_COPY,
  readWakeWordConfig,
  wakeIndicatorFacts,
  wakeIndicatorView,
  wakeToggleVisible,
  type WakeSurfaceStateSnapshot,
} from './wake-word-chrome.js';

function snap(partial: Partial<WakeSurfaceStateSnapshot>): WakeSurfaceStateSnapshot {
  return {
    state: 'off',
    listening: false,
    micActive: false,
    optedIn: false,
    phrase: null,
    message: null,
    surface: 'app',
    ...partial,
  };
}

describe('wakeIndicatorView', () => {
  it('is inert for a null snapshot', () => {
    const view = wakeIndicatorView(null);
    expect(view.live).toBe(false);
    expect(view.canToggle).toBe(false);
    expect(view.state).toBe('off');
  });

  it('marks live only when a real detector is armed', () => {
    const view = wakeIndicatorView(
      snap({ state: 'wake_listening', listening: true, micActive: true, optedIn: true, phrase: 'Selene' }),
    );
    expect(view.live).toBe(true);
    expect(view.pulse).toBe(true);
    expect(view.label).toBe('Listening');
    expect(view.detail).toContain('Selene');
  });

  it('does not claim live listening while opted in but not detecting', () => {
    const view = wakeIndicatorView(snap({ state: 'wake_listening', optedIn: true, listening: false }));
    expect(view.live).toBe(false);
    expect(view.unavailable).toBe(false);
  });

  it('surfaces unavailability and blocks the toggle', () => {
    const view = wakeIndicatorView(snap({ state: 'unavailable', message: 'no model' }));
    expect(view.unavailable).toBe(true);
    expect(view.canToggle).toBe(false);
    expect(view.detail).toBe('no model');
  });

  it('explains the pause states', () => {
    expect(wakeIndicatorView(snap({ state: 'suspended' })).detail).toContain('paused');
    expect(wakeIndicatorView(snap({ state: 'active' })).detail).toContain('call');
  });
});

describe('wakeIndicatorFacts', () => {
  it('always states the trust boundary', () => {
    const facts = wakeIndicatorFacts(snap({ state: 'wake_listening', phrase: 'Nox' }));
    expect(facts.find((f) => f.label === 'Authentication')?.value).toContain('never');
    expect(facts.find((f) => f.label === 'Phrase')?.value).toBe('Nox');
  });

  it('returns nothing for a null snapshot', () => {
    expect(wakeIndicatorFacts(null)).toEqual([]);
  });
});

describe('wakeToggleVisible', () => {
  it('hides the toggle when unavailable', () => {
    expect(wakeToggleVisible(snap({ state: 'unavailable' }))).toBe(false);
    expect(wakeToggleVisible(snap({ state: 'off' }))).toBe(true);
    expect(wakeToggleVisible(null)).toBe(false);
  });
});

describe('readWakeWordConfig', () => {
  it('requires enabled:true', () => {
    expect(readWakeWordConfig({ wakeWord: { phrase: 'Selene' } })).toBeNull();
    expect(readWakeWordConfig(null)).toBeNull();
    expect(readWakeWordConfig({})).toBeNull();
  });

  it('reads a clamped, structure-only config', () => {
    const cfg = readWakeWordConfig({
      wakeWord: {
        enabled: true,
        phrase: '  Selene ',
        engine: 'builtin',
        sensitivity: 4,
        surfaces: ['app', 'portal', 7],
      },
    });
    expect(cfg).toEqual({
      enabled: true,
      phrase: 'Selene',
      engine: 'builtin',
      sensitivity: 1,
      surfaces: ['app', 'portal'],
    });
  });

  it('forwards private refs to the engine but never into UI copy', () => {
    const cfg = readWakeWordConfig({
      wakeWord: { enabled: true, templateRef: 'private/ref', sampleRefs: ['a'] },
    });
    // The on-device engine needs the refs to enrol a custom template…
    expect(cfg).toMatchObject({ templateRef: 'private/ref', sampleRefs: ['a'] });
    // …but the UI only ever reads a WakeSurfaceStateSnapshot (phrase + state),
    // which has no ref fields, so they cannot reach copy/logs/model context.
    const snapshot = snap({ state: 'wake_listening', listening: true, micActive: true, phrase: 'Selene' });
    const rendered = JSON.stringify([wakeIndicatorView(snapshot), wakeIndicatorFacts(snapshot)]);
    expect(rendered).not.toContain('private/ref');
    expect(rendered).not.toContain('sampleRefs');
  });
});

describe('trust copy', () => {
  it('states wake is not authentication', () => {
    expect(WAKE_NOT_AUTH_COPY).toContain('never signs you in');
    expect(WAKE_NOT_AUTH_COPY).toContain('never approves');
  });
});
