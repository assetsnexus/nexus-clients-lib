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

describe('parseHostMessage appRoute / wakeUnlock (plan Part C11 / W3)', () => {
  it('keeps a structure-only appRoute context and clears on null', () => {
    expect(
      parseHostMessage({
        type: 'appRoute',
        context: { route: '/wallet/1', screen: 'Wallet', capturedAt: 'now' },
      }),
    ).toEqual({
      type: 'appRoute',
      context: { route: '/wallet/1', screen: 'Wallet', capturedAt: 'now' },
    });
    expect(parseHostMessage({ type: 'appRoute', context: null })).toEqual({
      type: 'appRoute',
      context: null,
    });
    expect(parseHostMessage({ type: 'appRoute', context: 'nope' })).toEqual({
      type: 'appRoute',
      context: null,
    });
  });

  it('treats wakeUnlock as a boolean gate, defaulting to unlocked', () => {
    expect(parseHostMessage({ type: 'wakeUnlock', unlocked: false })).toEqual({
      type: 'wakeUnlock',
      unlocked: false,
    });
    expect(parseHostMessage({ type: 'wakeUnlock', unlocked: true })).toEqual({
      type: 'wakeUnlock',
      unlocked: true,
    });
    // Missing/other values must default to "unlocked" (fail-open gate only for
    // the lock signal; wake itself still never authorizes anything).
    expect(parseHostMessage({ type: 'wakeUnlock' })).toEqual({
      type: 'wakeUnlock',
      unlocked: true,
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

describe('parseHostMessage page tools', () => {
  it('parses a sitemap, dropping entries without a path', () => {
    expect(
      parseHostMessage({
        type: 'pageSitemap',
        pages: [
          { path: '/wallet', title: 'Wallet', summary: 'Balances' },
          { path: '  ' },
        ],
      }),
    ).toEqual({
      type: 'pageSitemap',
      pages: [{ path: '/wallet', title: 'Wallet', summary: 'Balances' }],
    });
    expect(parseHostMessage({ type: 'pageSitemap' })).toEqual({ type: 'pageSitemap', pages: [] });
  });

  it('parses a screen pack with tools and clears on null', () => {
    expect(
      parseHostMessage({
        type: 'pageScreen',
        screen: {
          path: '/wallet',
          title: 'Wallet',
          instructions: 'Show balance',
          tools: [{ name: 'app.wallet.scroll_to', description: 'Scroll', parameters: { type: 'object' } }],
        },
      }),
    ).toEqual({
      type: 'pageScreen',
      screen: {
        path: '/wallet',
        title: 'Wallet',
        instructions: 'Show balance',
        tools: [{ name: 'app.wallet.scroll_to', description: 'Scroll', parameters: { type: 'object', properties: {}, required: undefined } }],
      },
    });
    expect(parseHostMessage({ type: 'pageScreen', screen: null })).toEqual({
      type: 'pageScreen',
      screen: null,
    });
  });

  it('clears the screen when the pack has no usable path', () => {
    expect(parseHostMessage({ type: 'pageScreen', screen: { title: 'No path' } })).toEqual({
      type: 'pageScreen',
      screen: null,
    });
  });

  it('parses a client-tool result and requires a requestId', () => {
    expect(
      parseHostMessage({ type: 'clientToolResult', requestId: 'r1', result: { ok: true } }),
    ).toEqual({ type: 'clientToolResult', requestId: 'r1', result: { ok: true } });
    expect(
      parseHostMessage({ type: 'clientToolResult', requestId: 'r2', error: 'boom' }),
    ).toEqual({ type: 'clientToolResult', requestId: 'r2', error: 'boom', result: undefined });
    expect(parseHostMessage({ type: 'clientToolResult' })).toBeNull();
  });

  it('does not coalesce client-tool results or prefills in the stash', () => {
    stashHostMessage({ type: 'clientToolResult', requestId: 'a', result: 1 });
    stashHostMessage({ type: 'clientToolResult', requestId: 'b', result: 2 });
    stashHostMessage({ type: 'pageScreen', screen: { path: '/a', title: 'A' } });
    stashHostMessage({ type: 'pageScreen', screen: { path: '/b', title: 'B' } });
    const drained = drainStashedHostMessages();
    expect(drained.filter((m) => m.type === 'pageScreen')).toEqual([
      { type: 'pageScreen', screen: { path: '/b', title: 'B' } },
    ]);
  });
});
