/**
 * ThreadView auto-scroll (item 7).
 *
 * The thread must follow the conversation — jump to the bottom on open/switch
 * and on every appended turn — while never yanking the viewport away from a
 * reader who has scrolled up. jsdom does not lay out elements (every geometry
 * value is 0), so these tests drive `scrollHeight`/`clientHeight`/`scrollTop`
 * directly and assert on the writes the component makes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ChatTurn } from '@nexus/chat-core';
import { ThreadView, THREAD_STICK_TO_BOTTOM_PX } from './ThreadView.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function turns(...ids: string[]): ChatTurn[] {
  return ids.map((id) => ({ id, role: 'user', text: id }) as unknown as ChatTurn);
}

/**
 * Give an element a fake scroll geometry. `scrollTop` is a plain property in
 * jsdom, so the component's reads/writes work once we define the sizes.
 */
function giveGeometry(el: HTMLElement, scrollHeight: number, clientHeight: number): void {
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
}

type Mounted = { container: HTMLElement; root: Root; unmount: () => void };
const mounted: Mounted[] = [];

function mount(props: React.ComponentProps<typeof ThreadView>): Mounted {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<ThreadView {...props} />);
  });
  const entry: Mounted = {
    container,
    root,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
  mounted.push(entry);
  return entry;
}

function rerender(entry: Mounted, props: React.ComponentProps<typeof ThreadView>): void {
  act(() => {
    entry.root.render(<ThreadView {...props} />);
  });
}

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount();
  vi.clearAllMocks();
});

function threadEl(container: HTMLElement): HTMLElement {
  const el = container.querySelector('.nexus-chat__thread');
  if (!el) throw new Error('thread not found');
  return el as HTMLElement;
}

function scrollEvent(el: HTMLElement): void {
  act(() => {
    el.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
}

describe('ThreadView auto-scroll', () => {
  it('jumps to the bottom on initial render (a freshly opened conversation)', () => {
    const entry = mount({ turns: turns('a', 'b', 'c'), conversationId: 'conv-1' });
    const el = threadEl(entry.container);
    giveGeometry(el, 1000, 300);
    el.scrollTop = 0; // as if the browser had left it at the top
    // No conversation change: the initial "stick" state alone must get us to
    // the bottom, so an already-open thread does not sit at the top.
    rerender(entry, { turns: turns('a', 'b', 'c'), conversationId: 'conv-1' });
    expect(el.scrollTop).toBe(1000);
  });

  it('jumps to the bottom when a different conversation is opened', () => {
    const entry = mount({ turns: turns('a'), conversationId: 'conv-1' });
    const el = threadEl(entry.container);
    giveGeometry(el, 2000, 300);
    el.scrollTop = 1200; // reader had scrolled up in conv-1
    rerender(entry, { turns: turns('x', 'y'), conversationId: 'conv-2' });
    // A switch always lands at the bottom, regardless of the old position.
    expect(el.scrollTop).toBe(2000);
  });

  it('follows new turns while the reader is at the bottom', () => {
    const entry = mount({ turns: turns('a'), conversationId: 'conv-1' });
    const el = threadEl(entry.container);
    giveGeometry(el, 1000, 300);
    el.scrollTop = 900; // within THREAD_STICK_TO_BOTTOM_PX of the bottom
    scrollEvent(el);
    giveGeometry(el, 1200, 300);
    rerender(entry, { turns: turns('a', 'b'), conversationId: 'conv-1' });
    expect(el.scrollTop).toBe(1200);
  });

  it('does not fight a reader who has scrolled up', () => {
    const entry = mount({ turns: turns('a'), conversationId: 'conv-1' });
    const el = threadEl(entry.container);
    giveGeometry(el, 1000, 300);
    el.scrollTop = 100; // far from the bottom (1000 - 100 - 300 = 600 > 80)
    scrollEvent(el);
    rerender(entry, { turns: turns('a', 'b'), conversationId: 'conv-1' });
    expect(el.scrollTop).toBe(100);
  });

  it('re-sticks once the reader returns to the bottom', () => {
    const entry = mount({ turns: turns('a'), conversationId: 'conv-1' });
    const el = threadEl(entry.container);
    giveGeometry(el, 1000, 300);
    el.scrollTop = 100;
    scrollEvent(el); // scrolled up: detached
    giveGeometry(el, 1400, 300);
    rerender(entry, { turns: turns('a', 'b'), conversationId: 'conv-1' });
    expect(el.scrollTop).toBe(100); // still detached
    // Reader scrolls back down to the bottom.
    el.scrollTop = 1100;
    scrollEvent(el);
    giveGeometry(el, 1600, 300);
    rerender(entry, { turns: turns('a', 'b', 'c'), conversationId: 'conv-1' });
    expect(el.scrollTop).toBe(1600); // following again
  });

  it('uses an 80px proximity window for "at the bottom"', () => {
    const entry = mount({ turns: turns('a'), conversationId: 'conv-1' });
    const el = threadEl(entry.container);
    giveGeometry(el, 1000, 300);
    el.scrollTop = 1000 - 300 - THREAD_STICK_TO_BOTTOM_PX; // exactly on the boundary
    scrollEvent(el);
    giveGeometry(el, 1200, 300);
    rerender(entry, { turns: turns('a', 'b'), conversationId: 'conv-1' });
    expect(el.scrollTop).toBe(1200);
  });
});
