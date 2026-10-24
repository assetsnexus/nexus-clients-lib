/**
 * VoiceLayout control-row regressions.
 *
 * The immersive companion window renders <VoiceLayout> WITHOUT `view`/`onView`,
 * so these tests pin the contract that:
 *  - Background/Transcript/Avatar still switch the rendered pane (no no-ops) and
 *    the highlight follows the real pane;
 *  - `hideWakeIndicator` removes the wake chip on hosts with no wake engine;
 *  - Speak / Mute / Pause are disabled (never a silent no-op) with no live call /
 *    no assistant turn, and surface an explanatory notice instead.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ChatContact, ChatTurn, NexusChat } from '@nexus/chat-core';
import { VoiceLayout } from './VoiceLayout.js';

// The stage lazily imports Three/@nexus/character-react; stub it so the DOM test
// stays fast and deterministic (we only assert on pane switching).
vi.mock('./VoiceAvatarCanvas.js', async () => {
  const React = await import('react');
  return {
    VoiceAvatarCanvas: () =>
      React.createElement('div', { 'data-nexus-surface': 'voice-avatar' }),
  };
});

// Same for the wake chip: the assertions only need its surface marker.
vi.mock('./WakeMicIndicator.js', async () => {
  const React = await import('react');
  return {
    WakeMicIndicator: (props: { snapshot: unknown }) =>
      props.snapshot
        ? React.createElement('div', { 'data-nexus-surface': 'wake-mic' })
        : null,
  };
});

// CachedAvatarImage pulls the optional `@nexus/character-kit` peer dep, which is
// not installed for this package's unit tests.
vi.mock('./CachedAvatarImage.js', async () => {
  const React = await import('react');
  return {
    CachedAvatarImage: () => React.createElement('img', { alt: '' }),
  };
});

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const AGENT_CONTACT = {
  id: 'contact-1',
  type: 'agent',
  agentId: 'agent-9',
  virtualEmployeeId: null,
  name: 'Selene',
  avatarUrl: null,
} as unknown as ChatContact;

const ASSISTANT_TURN = {
  id: 'turn-1',
  role: 'assistant',
  text: 'Hello from the agent.',
} as unknown as ChatTurn;

type FakeChat = NexusChat & {
  setSurface: (patch: Record<string, unknown>) => void;
  getState: () => { conversationId: string | null };
};

function makeFakeChat(): FakeChat {
  let surface: Record<string, unknown> = {
    status: 'idle',
    elapsedSec: 0,
    muted: false,
    paused: false,
    errorMessage: null,
    agentId: null,
    callSid: null,
    mode: null,
  };
  const listeners = new Set<() => void>();
  const toggleMute = vi.fn();
  const pauseOrResumeCall = vi.fn();

  const chat = {
    getVoiceSurface: () => surface,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getState: () => ({ conversationId: 'conv-1' }),
    subscribeWakeState: () => () => {},
    getWakeState: () => ({
      state: 'off',
      listening: false,
      micActive: false,
      optedIn: false,
      phrase: null,
      message: null,
      surface: 'app',
    }),
    setWakeSurfaceOpen: () => {},
    setWakeAgentId: () => {},
    configureWake: () => {},
    subscribeRemotePlaybackStream: () => () => {},
    getRemotePlaybackStream: () => null,
    createSpeakTurn: () => ({ speak: () => Promise.resolve() }),
    toggleMute,
    pauseOrResumeCall,
    startBrowserCall: () => Promise.resolve(),
    endCall: () => Promise.resolve(true),
    optInWake: () => Promise.resolve(true),
    optOutWake: () => {},
    setSurface: (patch: Record<string, unknown>) => {
      surface = { ...surface, ...patch };
      listeners.forEach((l) => l());
    },
  } as unknown as FakeChat;

  return chat;
}

type Mounted = { container: HTMLElement; root: Root; unmount: () => void };
const mounted: Mounted[] = [];

function mount(props: Partial<React.ComponentProps<typeof VoiceLayout>> & { chat: NexusChat }): Mounted {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<VoiceLayout contact={AGENT_CONTACT} turns={[]} {...props} />);
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

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount();
  vi.clearAllMocks();
});

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === label,
  );
  if (!found) throw new Error(`button not found: ${label}`);
  return found as HTMLButtonElement;
}

function click(container: HTMLElement, label: string): void {
  const el = button(container, label);
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('VoiceLayout view buttons without a host onView', () => {
  it('switches the rendered pane and highlight (Background/Transcript/Avatar are not no-ops)', () => {
    const chat = makeFakeChat();
    const { container } = mount({ chat, initialLayout: 'avatar', turns: [ASSISTANT_TURN] });

    // Starts in the avatar-only pane: no transcript thread rendered.
    expect(container.querySelector('.nexus-chat__voice--avatar-only')).not.toBeNull();
    expect(container.querySelector('.nexus-chat__thread')).toBeNull();
    expect(button(container, 'Avatar').getAttribute('aria-pressed')).toBe('true');

    click(container, 'Avatar');
    expect(container.querySelector('.nexus-chat__thread')).toBeNull();

    click(container, 'Transcript');
    // The transcript-only layout renders ThreadView with the assistant text.
    expect(container.querySelector('.nexus-chat__voice--transcript-only')).not.toBeNull();
    expect(container.querySelector('.nexus-chat__thread')).not.toBeNull();
    expect(container.textContent).toContain('Hello from the agent.');
    expect(button(container, 'Transcript').getAttribute('aria-pressed')).toBe('true');
    expect(button(container, 'Avatar').getAttribute('aria-pressed')).toBe('false');

    click(container, 'Background');
    // A bare host (no onView) keeps the stage visible rather than vanishing.
    expect(container.querySelector('.nexus-chat__thread')).toBeNull();
    expect(container.querySelector('.nexus-chat__voice--avatar-only')).not.toBeNull();
    expect(button(container, 'Background').getAttribute('aria-pressed')).toBe('true');

    click(container, 'Avatar');
    expect(container.querySelector('.nexus-chat__thread')).toBeNull();
    expect(button(container, 'Avatar').getAttribute('aria-pressed')).toBe('true');
  });

  it('lets the host view prop win over the internal fallback', () => {
    const chat = makeFakeChat();
    const onView = vi.fn();
    const { container } = mount({
      chat,
      initialLayout: 'avatar',
      view: 'avatar',
      onView,
      turns: [ASSISTANT_TURN],
    });
    // Host says avatar => avatar-only pane + highlight, without a click.
    expect(container.querySelector('.nexus-chat__voice--avatar-only')).not.toBeNull();
    expect(button(container, 'Avatar').getAttribute('aria-pressed')).toBe('true');

    click(container, 'Avatar');
    expect(onView).toHaveBeenCalledWith('avatar');
  });
});

describe('VoiceLayout hideWakeIndicator', () => {
  it('renders the wake chip by default', () => {
    const chat = makeFakeChat();
    const { container } = mount({ chat });
    expect(container.querySelector('[data-nexus-surface="wake-mic"]')).not.toBeNull();
  });

  it('removes the wake chip when hideWakeIndicator is set', () => {
    const chat = makeFakeChat();
    const { container } = mount({ chat, hideWakeIndicator: true });
    expect(container.querySelector('[data-nexus-surface="wake-mic"]')).toBeNull();
  });
});

describe('VoiceLayout host callbacks never drive a render loop', () => {
  /**
   * Host that mirrors the reported voice state into React state, exactly like the
   * companion window (`onVoiceState={(s) => setVoiceStatus({...})}`). It uses
   * inline arrows so their identity changes every render.
   */
  function mountMirroringHost(chat: NexusChat): { container: HTMLElement; renders: () => number } {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let renders = 0;

    function Host(): React.ReactElement {
      const [, setVoiceStatus] = useState({ active: false, status: 'idle' });
      renders += 1;
      return (
        <VoiceLayout
          chat={chat}
          contact={AGENT_CONTACT}
          turns={[]}
          initialLayout="avatar"
          // Inline arrows: new identity every render (the trigger).
          onVoiceState={(state) => setVoiceStatus({ active: state.active, status: state.status })}
          onVoiceActive={() => undefined}
        />
      );
    }

    act(() => {
      root.render(<Host />);
    });
    mounted.push({
      container,
      root,
      unmount: () => {
        act(() => root.unmount());
        container.remove();
      },
    });
    return { container, renders: () => renders };
  }

  /**
   * Regression: `onVoiceState`/`onVoiceActive` used to sit in the reporting
   * effect's dependency array. With inline-arrow hosts the effect re-ran on every
   * render, the host stored a fresh object literal in state (React never bails
   * out on a new object), and the window span forever — "Maximum update depth
   * exceeded" (~159 errors / 6s idle in the live companion), with the 3D avatar
   * stuck and every control janky. The callbacks are now refs and emission is
   * change-gated.
   */
  it('does not loop when the host stores the payload in state', () => {
    const chat = makeFakeChat();
    const { renders } = mountMirroringHost(chat);
    // A bounded, small render count proves it settled instead of looping
    // (the buggy version renders without bound / throws the React warning).
    expect(renders()).toBeLessThan(10);
  });

  it('still reports a real voice-state transition to the host', () => {
    const chat = makeFakeChat();
    const onVoiceState = vi.fn();
    mount({ chat, onVoiceState });

    const before = onVoiceState.mock.calls.length;
    act(() => {
      chat.setSurface({ status: 'live', callSid: 'CA1', muted: false });
    });
    expect(onVoiceState.mock.calls.length).toBeGreaterThan(before);
    expect(onVoiceState).toHaveBeenLastCalledWith(
      expect.objectContaining({ active: true, status: 'live' }),
    );
  });
});

describe('VoiceLayout control feedback (no silent no-ops)', () => {
  it('disables Speak (TTS) with no assistant turn and explains why when clicked', () => {
    const chat = makeFakeChat();
    const { container } = mount({ chat, turns: [], initialLayout: 'avatar' });
    expect(button(container, 'Speak (TTS)').getAttribute('aria-disabled')).toBe('true');

    click(container, 'Speak (TTS)');
    expect(container.textContent).toContain('Nothing to speak yet');
  });

  it('enables Speak (TTS) when a speakable assistant turn exists', () => {
    const chat = makeFakeChat();
    const { container } = mount({ chat, turns: [ASSISTANT_TURN] });
    expect(button(container, 'Speak (TTS)').getAttribute('aria-disabled')).toBe('false');
  });

  it('surfaces a notice instead of silently ignoring Mute/Pause with no live call', () => {
    const chat = makeFakeChat();
    const { container } = mount({ chat, initialLayout: 'avatar' });

    expect(button(container, 'Mute').getAttribute('aria-disabled')).toBe('true');
    expect(button(container, 'Pause').getAttribute('aria-disabled')).toBe('true');

    click(container, 'Mute');
    expect(container.textContent).toContain('No live call to mute.');
    expect(chat.toggleMute).not.toHaveBeenCalled();

    click(container, 'Pause');
    expect(container.textContent).toContain('No live call to pause.');
    expect(chat.pauseOrResumeCall).not.toHaveBeenCalled();
  });

  it('reflects live-call state and forwards Mute once connected', () => {
    const chat = makeFakeChat();
    const { container } = mount({ chat, initialLayout: 'avatar' });

    expect(button(container, 'Start call').disabled).toBe(false);

    act(() => {
      chat.setSurface({ status: 'live', callSid: 'CA1', muted: false });
    });

    const start = button(container, 'Connected');
    expect(start.disabled).toBe(true);
    expect(button(container, 'Mute').getAttribute('aria-disabled')).toBe('false');

    click(container, 'Mute');
    expect(chat.toggleMute).toHaveBeenCalledTimes(1);
  });
});
