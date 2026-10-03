import { describe, expect, it } from 'vitest';
import {
  drainStashedHostMessages,
  dropStashedHostMessage,
  HOST_PREFILL_TEXT_MAX,
  parseHostMessage,
  stashHostMessage,
} from './host-bridge.js';

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

describe('parseHostMessage prefillComposer', () => {
  it('keeps contactId and truncates text to 4000 characters', () => {
    const text = `${'a'.repeat(HOST_PREFILL_TEXT_MAX)}TAIL`;
    const msg = parseHostMessage({ type: 'prefillComposer', text, contactId: '  agent-1  ' });
    expect(msg).toEqual({
      type: 'prefillComposer',
      text: 'a'.repeat(HOST_PREFILL_TEXT_MAX),
      contactId: 'agent-1',
    });
  });

  it('accepts a prefill without contactId', () => {
    expect(parseHostMessage({ type: 'prefillComposer', text: 'hello' })).toEqual({
      type: 'prefillComposer',
      text: 'hello',
    });
  });

  it('ignores empty, whitespace, and non-string text', () => {
    expect(parseHostMessage({ type: 'prefillComposer', text: '' })).toBeNull();
    expect(parseHostMessage({ type: 'prefillComposer', text: '   \n' })).toBeNull();
    expect(parseHostMessage({ type: 'prefillComposer', text: 12 })).toBeNull();
    expect(parseHostMessage(JSON.stringify({ type: 'prefillComposer' }))).toBeNull();
  });

  it('drops a blank contactId', () => {
    expect(parseHostMessage({ type: 'prefillComposer', text: 'hi', contactId: '  ' })).toEqual({
      type: 'prefillComposer',
      text: 'hi',
    });
    expect(parseHostMessage({ type: 'prefillComposer', text: 'hi', contactId: 4 })).toEqual({
      type: 'prefillComposer',
      text: 'hi',
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

  it('keeps the latest prefill after the first drain until the chat app drops it', () => {
    stashHostMessage({ type: 'prefillComposer', text: 'one' });
    stashHostMessage({ type: 'prefillComposer', text: 'two', contactId: 'c1' });
    expect(drainStashedHostMessages()).toEqual([
      { type: 'prefillComposer', text: 'two', contactId: 'c1' },
    ]);
    expect(drainStashedHostMessages()).toEqual([
      { type: 'prefillComposer', text: 'two', contactId: 'c1' },
    ]);
    dropStashedHostMessage('prefillComposer');
    expect(drainStashedHostMessages()).toEqual([]);
  });
});
