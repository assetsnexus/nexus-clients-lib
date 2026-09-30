import { describe, expect, it } from 'vitest';
import { drainStashedHostMessages, parseHostMessage, stashHostMessage } from './host-bridge.js';

describe('parseHostMessage', () => {
  it('accepts JSON strings from the native inject script', () => {
    const msg = parseHostMessage(
      JSON.stringify({ type: 'auth', token: 't1', identity: { userId: 'u' }, apiBaseUrl: 'http://r' }),
    );
    expect(msg).toEqual({
      type: 'auth',
      token: 't1',
      identity: { userId: 'u' },
      apiBaseUrl: 'http://r',
    });
  });
});

describe('host message stash', () => {
  it('replays the latest auth after a late listener mounts', () => {
    stashHostMessage({ type: 'auth', token: 'old', identity: {} });
    stashHostMessage({ type: 'auth', token: 'new', identity: { userId: 'u2' } });
    const drained = drainStashedHostMessages();
    expect(drained).toEqual([{ type: 'auth', token: 'new', identity: { userId: 'u2' } }]);
    expect(drainStashedHostMessages()).toEqual([]);
  });
});
