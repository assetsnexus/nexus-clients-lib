/**
 * Composer force-send ("steer") regression.
 *
 * While the agent streams, the composer's default send only *queues* locally —
 * the user has no way to say "stop waiting, run this next". These tests pin the
 * two force-send entry points (⌘/Ctrl+Enter and the explicit button) onto the
 * `deliveryMode: 'steer'` payload, and pin the default path to queue without
 * ever setting `steer` (a false positive would cancel a turn the user only
 * wanted to queue behind).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { NexusChat } from '@nexus/chat-core';
import { Composer } from './Composer.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type SendCall = { text: string; opts: Record<string, unknown> };

function makeFakeChat(sendMessage: (text: string, opts: Record<string, unknown>) => Promise<unknown>) {
  // A stable state object: `useChatState` subscribes through
  // `useSyncExternalStore`, so returning a fresh object each call would re-render
  // forever.
  const state = { turns: [], conversationId: 'c1', calls: [] };
  return {
    sendMessage: vi.fn(sendMessage),
    getState: () => state,
    subscribe: () => () => {},
    discardLocalUnsentTurns: vi.fn(),
    hasLiveStream: () => false,
    getVoiceSurface: () => null,
    cancelConversation: vi.fn(async () => ({ cancelled: true, generationInProgress: false })),
    registerTool: vi.fn(),
    unregisterTool: vi.fn(),
  } as unknown as NexusChat;
}

const sendQueue = {
  enqueue: vi.fn(() => 'q1'),
  items: () => [],
} as unknown as Parameters<typeof Composer>[0]['sendQueue'];

type Mounted = { container: HTMLElement; root: Root; unmount: () => void };
const mounted: Mounted[] = [];

async function mountComposer(chat: NexusChat, streaming: boolean): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Composer
        chat={chat}
        contacts={[]}
        conversationId="c1"
        streaming={streaming}
        sendQueue={sendQueue}
        threadKey="c1"
      />,
    );
  });
  mounted.push({
    container,
    root,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  });
  return container;
}

async function typeText(container: HTMLElement, text: string) {
  const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value',
    )?.set;
    setter?.call(textarea, text);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function typeAndPressEnter(container: HTMLElement, text: string, mods: { metaKey?: boolean; ctrlKey?: boolean } = {}) {
  await typeText(container, text);
  const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
  await act(async () => {
    textarea.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...mods }),
    );
  });
}

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount();
  vi.clearAllMocks();
});

describe('Composer force-send', () => {
  it('queues locally and never steers on a plain Enter while streaming', async () => {
    const chat = makeFakeChat(async () => ({ ok: true }));
    const container = await mountComposer(chat, true);

    await typeAndPressEnter(container, 'wait your turn');

    // Default path must not hit the server mid-stream at all — it parks locally.
    expect(chat.sendMessage).not.toHaveBeenCalled();
    expect(sendQueue.enqueue).toHaveBeenCalledTimes(1);
  });

  it('steers on Cmd/Ctrl+Enter while streaming', async () => {
    const calls: SendCall[] = [];
    const chat = makeFakeChat(async (text, opts) => {
      calls.push({ text, opts });
      return { ok: true, conversationId: 'c1' };
    });
    const container = await mountComposer(chat, true);

    await typeAndPressEnter(container, 'stop and do this now', { metaKey: true });

    expect(calls).toHaveLength(1);
    expect(calls[0].text).toBe('stop and do this now');
    expect(calls[0].opts.deliveryMode).toBe('steer');
    // The forced turn must not also be parked in the local queue.
    expect(sendQueue.enqueue).not.toHaveBeenCalled();
  });

  it('steers from the explicit force-send button while streaming', async () => {
    const calls: SendCall[] = [];
    const chat = makeFakeChat(async (text, opts) => {
      calls.push({ text, opts });
      return { ok: true, conversationId: 'c1' };
    });
    const container = await mountComposer(chat, true);
    await typeText(container, 'interrupt me');

    const force = container.querySelector(
      'button[aria-label="Send now and interrupt"]',
    ) as HTMLButtonElement | null;
    expect(force).not.toBeNull();
    await act(async () => {
      force!.click();
    });

    const forced = calls.filter((c) => c.opts.deliveryMode === 'steer');
    expect(forced).toHaveLength(1);
    expect(forced[0].text).toBe('interrupt me');
  });

  it('sends normally (no steer flag) when idle', async () => {
    const calls: SendCall[] = [];
    const chat = makeFakeChat(async (text, opts) => {
      calls.push({ text, opts });
      return { ok: true, conversationId: 'c1' };
    });
    const container = await mountComposer(chat, false);

    await typeAndPressEnter(container, 'normal turn');

    expect(calls).toHaveLength(1);
    expect(calls[0].opts.deliveryMode).toBeUndefined();
    expect(sendQueue.enqueue).not.toHaveBeenCalled();
  });
});
