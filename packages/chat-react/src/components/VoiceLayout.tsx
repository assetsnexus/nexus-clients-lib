import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createSpeakTurnController,
  createVoiceModeState,
  type ChatContact,
  type CommandClient,
  type NexusChat,
  type VoiceLayoutMode,
} from '@nexus/chat-core';
import { ThreadView } from './ThreadView.js';
import { VoiceAvatarCanvas, type VoiceAvatarHost } from './VoiceAvatarCanvas.js';
import { CachedAvatarImage } from './CachedAvatarImage.js';
import { IconMic, IconPhone, IconSpeaker } from './icons.js';
import {
  applyTurnPresenceMood,
  playAssistantEmbodiment,
  playSessionRoutine,
  resolveEmbodimentFace,
  unplayedAssistantTurns,
} from './embodiment-playback.js';
import { WakeMicIndicator } from './WakeMicIndicator.js';
import { readWakeWordConfig, type WakeSurfaceStateSnapshot } from './wake-word-chrome.js';
import {
  createPresenceStore,
  readPresenceFromProfile,
  type ParticipantPresenceV1,
} from '../presence/participant-presence.js';

export type VoiceLayoutProps = {
  chat: NexusChat;
  contact: ChatContact | null;
  turns: import('@nexus/chat-core').ChatTurn[];
  streaming?: boolean;
  collapsed?: boolean;
  client?: CommandClient;
  /** Override slot; when omitted, lazy CompanionCanvas loads for avatar/split. */
  avatarSlot?: React.ReactNode;
  presence?: ParticipantPresenceV1 | null;
  onPlaybackStream?: (
    stream: MediaStream | null,
    ctx: {
      agentId: string;
      conversationId: string | null;
      audioContext?: AudioContext | null;
      source: 'webrtc' | 'tts';
    },
  ) => void;
  onVoiceActive?: (active: boolean) => void;
  view?: 'background' | 'transcript' | 'avatar';
  onView?: (view: 'background' | 'transcript' | 'avatar') => void;
  onVoiceState?: (state: { active: boolean; muted: boolean; status: string; errorMessage: string | null }) => void;
  autoStart?: boolean;
  /**
   * Render the walkable companion scene ({@link CompanionSceneCanvas}) instead of
   * the flat stage, so locomotion (`character_walk` / `approach` / `turn_to`) is
   * visibly meaningful. Desktop-only opt-in (Settings → Companion debug).
   */
  sceneMode?: boolean;
  /**
   * Fired whenever the mounted 3D avatar host changes (mount, host-ready, swap,
   * unmount). The desktop binds the character tool pack + debug panels to it.
   */
  onAvatarHost?: (host: VoiceAvatarHost | null) => void;
  /**
   * Which axis the split view uses. `vertical` (default) stacks the avatar above
   * the transcript; `horizontal` puts the chat *beside* the 3D avatar — the
   * desktop DM stage mode. Only affects the `split` layout.
   */
  splitAxis?: 'vertical' | 'horizontal';
  /** Initial layout; `split` by default (matches the portal chat). */
  initialLayout?: VoiceLayoutMode;
  /**
   * Hide the `WakeMicIndicator` chip. The wake engine is owned by a single
   * surface (the desktop main window), so hosts that embed this layout without a
   * wake engine (e.g. the immersive companion window) pass `true` to avoid a
   * misleading "Wake off" chip. Defaults to `false` (indicator shown).
   */
  hideWakeIndicator?: boolean;
  /**
   * Whether this surface may capture the microphone (start/keep a live call).
   * Exactly one surface may own speech-to-text at a time; a host with several
   * windows open (e.g. the desktop's companion windows) passes `false` to a
   * demoted window so it renders its avatar in parallel but never opens a
   * second, competing capture. Defaults to `true` (a normal single surface).
   */
  captureEnabled?: boolean;
};

const presenceStore = createPresenceStore('nexus-chat-react');

export function VoiceLayout({
  chat,
  contact,
  turns,
  streaming,
  collapsed,
  client,
  avatarSlot,
  presence: presenceProp,
  onPlaybackStream,
  onVoiceActive,
  view,
  onView,
  onVoiceState,
  autoStart,
  sceneMode = false,
  onAvatarHost,
  splitAxis = 'vertical',
  initialLayout = 'split',
  hideWakeIndicator = false,
  captureEnabled = true,
}: VoiceLayoutProps) {
  const voiceMode = useMemo(
    () => createVoiceModeState({ layout: initialLayout, splitRatio: 0.45 }),
    [initialLayout],
  );
  const [modeState, setModeState] = useState(voiceMode.get());
  /**
   * Fallback view state for hosts that omit `view`/`onView` (e.g. the immersive
   * companion window): the Background/Transcript/Avatar buttons must not become
   * no-ops, and the active highlight must reflect the real pane.
   */
  const [internalView, setInternalView] = useState<'background' | 'transcript' | 'avatar'>(
    initialLayout === 'transcript' ? 'transcript' : 'avatar',
  );
  const dragging = useRef(false);
  const [surface, setSurface] = useState(() => chat.getVoiceSurface());
  const [playbackStream, setPlaybackStream] = useState<MediaStream | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);

  useEffect(() => voiceMode.subscribe(setModeState), [voiceMode]);
  useEffect(
    () =>
      chat.subscribe(() => {
        setSurface(chat.getVoiceSurface());
      }),
    [chat],
  );

  // Plan Part W2/W3 — idle wake listening ahead of the call. A wake only opens
  // the voice session; it never authenticates or approves anything. The config
  // is opt-in and tolerant of an absent `presence.wakeWord`.
  const [wakeSnapshot, setWakeSnapshot] = useState<WakeSurfaceStateSnapshot | null>(null);
  useEffect(() => {
    if (typeof chat.subscribeWakeState !== 'function') return;
    const unsubscribe = chat.subscribeWakeState(setWakeSnapshot);
    setWakeSnapshot(chat.getWakeState());
    return unsubscribe;
  }, [chat]);

  useEffect(() => {
    if (typeof chat.setWakeSurfaceOpen !== 'function') return;
    chat.setWakeSurfaceOpen(true);
    return () => chat.setWakeSurfaceOpen(false);
  }, [chat]);

  useEffect(() => {
    const agentId = contact?.agentId || contact?.id || null;
    if (typeof chat.setWakeAgentId === 'function') chat.setWakeAgentId(agentId);
  }, [chat, contact?.agentId, contact?.id]);

  const presence =
    presenceProp ||
    (contact ? presenceStore.get(contact.id) || readPresenceFromProfile(contact) : null);

  useEffect(() => {
    if (typeof chat.configureWake !== 'function') return;
    const config = readWakeWordConfig(presence);
    // Install the agent-level config only. The on-device engine is injected by
    // the host (`webview-host.tsx` → `loadWakeEngine` → `createNexusChat`), so we
    // never replace it here (a bare engine here could downgrade a real one to a
    // stub). Absent engine => wake stays `off`/`unavailable`, which is safe.
    chat.configureWake(config ?? null);
  }, [chat, presence?.wakeWord]);

  // Plan Part C1 — embodiment playback state.
  const embodimentHostRef = useRef<import('./VoiceAvatarCanvas.js').VoiceAvatarHost | null>(null);
  const playedAssistantTurns = useRef<Set<string>>(new Set());
  const [voiceHostTick, setVoiceHostTick] = useState(0);
  const embodimentFace = resolveEmbodimentFace(presence);
  const handleVoiceHostReady = useCallback(
    (next: import('./VoiceAvatarCanvas.js').VoiceAvatarHost | null) => {
      embodimentHostRef.current = next;
      setVoiceHostTick((n) => n + 1);
      onAvatarHost?.(next);
    },
    [onAvatarHost],
  );

  // Play inline tags for each new assistant turn (greeting fires on live) and
  // apply the emotion-engine mood the turn carries (if any).
  useEffect(() => {
    const host = embodimentHostRef.current;
    if (!host) return;
    const pending = unplayedAssistantTurns(turns, playedAssistantTurns.current);
    for (const turn of pending) {
      playAssistantEmbodiment(host, turn.text, { face: embodimentFace, profile: presence?.embodiment });
    }
    if (pending.length > 0) {
      // The latest assistant turn's mood wins, so a stale earlier turn cannot
      // overwrite the current one.
      const latest = [...turns].reverse().find((t) => t.role === 'assistant');
      applyTurnPresenceMood(host, latest?.presenceMood ?? null);
    }
  }, [turns, voiceHostTick, embodimentFace, presence?.embodiment]);

  // Greeting on session open, farewell on session close.
  const prevLiveRef = useRef(false);
  useEffect(() => {
    const host = embodimentHostRef.current;
    if (!host) return;
    const live = surface.status === 'live' || surface.status === 'connecting';
    if (live && !prevLiveRef.current) {
      playSessionRoutine(host, 'greeting', { face: embodimentFace });
    } else if (!live && prevLiveRef.current) {
      playSessionRoutine(host, 'farewell', { face: embodimentFace });
    }
    prevLiveRef.current = live;
  }, [surface.status, voiceHostTick, embodimentFace]);

  const emitPlayback = useCallback(
    (
      stream: MediaStream | null,
      meta: {
        agentId: string;
        conversationId: string | null;
        audioContext?: AudioContext | null;
        source: 'webrtc' | 'tts';
      },
    ) => {
      setPlaybackStream(stream);
      setAudioContext(meta.audioContext ?? null);
      onPlaybackStream?.(stream, meta);
    },
    [onPlaybackStream],
  );

  // WebRTC remote track → lip-sync
  useEffect(() => {
    if (typeof chat.subscribeRemotePlaybackStream !== 'function') return;
    return chat.subscribeRemotePlaybackStream((stream, meta) => {
      emitPlayback(stream, {
        agentId: meta.agentId,
        conversationId: meta.conversationId,
        source: 'webrtc',
      });
    });
  }, [chat, emitPlayback]);

  const [notice, setNotice] = useState<string | null>(null);

  const startCall = useCallback(async () => {
    if (!captureEnabled) {
      setNotice('Another window owns the microphone right now. Say its wake word or focus it, then try again.');
      return;
    }
    if (!contact || (contact.type !== 'agent' && contact.type !== 'asset_agent')) {
      setNotice('Open an agent conversation before starting a call.');
      return;
    }
    setNotice(null);
    const agentId = contact.agentId || contact.id;
    const conversationId = chat.getState().conversationId;
    onVoiceActive?.(true);
    voiceMode.set({ active: true });
    try {
      await chat.startBrowserCall({
        agentId,
        conversationId,
        virtualAgentId: contact.virtualEmployeeId || null,
      });
      // Remote stream arrives via subscribeRemotePlaybackStream / ontrack.
      const existing =
        typeof chat.getRemotePlaybackStream === 'function' ? chat.getRemotePlaybackStream() : null;
      if (existing) {
        emitPlayback(existing, { agentId, conversationId, source: 'webrtc' });
      }
    } catch {
      setNotice('The call could not start. Speaking the last reply instead.');
      onVoiceActive?.(false);
      voiceMode.set({ active: false });
      const lastAssistant = [...turns].reverse().find((t) => t.role === 'assistant' && t.text?.trim());
      const text =
        lastAssistant?.text?.trim() ||
        `Hello${contact.name ? `, I'm ${contact.name}` : ''}. Voice call is unavailable; using text-to-speech.`;
      if (typeof chat.createSpeakTurn === 'function') {
        const speak = chat.createSpeakTurn({
          agentId,
          virtualAgentId: contact.virtualEmployeeId || null,
          onPlaybackStream: (stream, ctx) => {
            emitPlayback(stream, {
              agentId,
              conversationId,
              audioContext: ctx,
              source: 'tts',
            });
            onVoiceActive?.(Boolean(stream));
            voiceMode.set({ active: Boolean(stream) });
          },
        });
        void speak.speak(text);
      } else if (client) {
        const speak = createSpeakTurnController({
          client,
          agentId,
          virtualAgentId: contact.virtualEmployeeId || null,
          onPlaybackStream: (stream, ctx) => {
            emitPlayback(stream, {
              agentId,
              conversationId,
              audioContext: ctx,
              source: 'tts',
            });
          },
        });
        void speak.speak(text);
      }
    }
  }, [chat, client, contact, emitPlayback, onVoiceActive, turns, voiceMode, captureEnabled]);

  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    // A surface that does not own capture must never auto-open a competing mic.
    if (!captureEnabled) return;
    autoStarted.current = true;
    void startCall();
  }, [autoStart, startCall, captureEnabled]);

  // Losing capture ownership demotes this surface to display-only: end any live
  // call so the newly-elected owner is the single microphone.
  useEffect(() => {
    if (captureEnabled) return;
    const callSid = surface.callSid;
    if (!callSid) return;
    const agentId = contact?.agentId || contact?.id || '';
    if (!agentId) return;
    void chat.endCall({ agentId, callSid });
  }, [captureEnabled, chat, contact?.agentId, contact?.id, surface.callSid]);

  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      const data = event.data as { type?: string; action?: string } | null;
      if (!data || data.type !== 'voiceCommand') return;
      if (data.action === 'mute') chat.toggleMute();
      if (data.action === 'expand') onView?.('transcript');
      if (data.action === 'hangup') {
        const agentId = contact?.agentId || contact?.id || '';
        if (surface.callSid) void chat.endCall({ agentId, callSid: surface.callSid });
        onVoiceActive?.(false);
        onView?.('background');
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [chat, contact, onView, onVoiceActive, surface.callSid]);

  // Report voice state to the host. The callbacks are held in refs (not effect
  // deps) because hosts commonly pass inline arrows — `onVoiceState={(s) =>
  // setVoiceStatus(s)}`. Depending on their identity would re-run this effect on
  // every render, and a host that stores the payload in state (a fresh object
  // literal every time, so React never bails out) would re-render forever
  // ("Maximum update depth exceeded"). Emission is also change-gated: the
  // callback is a change notification, not a per-render heartbeat, so a host can
  // set state from it without risking a feedback loop.
  const onVoiceStateRef = useRef(onVoiceState);
  onVoiceStateRef.current = onVoiceState;
  const onVoiceActiveRef = useRef(onVoiceActive);
  onVoiceActiveRef.current = onVoiceActive;
  const lastVoiceReport = useRef<string | null>(null);

  useEffect(() => {
    const live = surface.status === 'live' || surface.status === 'connecting';
    const errorMessage = notice || surface.errorMessage || null;
    const muted = Boolean(surface.muted);
    const signature = `${live}|${muted}|${surface.status}|${errorMessage ?? ''}`;
    if (signature !== lastVoiceReport.current) {
      lastVoiceReport.current = signature;
      onVoiceStateRef.current?.({ active: live, muted, status: surface.status, errorMessage });
      onVoiceActiveRef.current?.(live);
    }
    const current = voiceMode.get();
    if (current.active !== live) {
      voiceMode.set({ active: live });
    }
  }, [notice, surface.errorMessage, surface.muted, surface.status, voiceMode]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const pct =
        splitAxis === 'horizontal'
          ? Math.min(75, Math.max(25, (e.clientX / window.innerWidth) * 100))
          : Math.min(75, Math.max(25, (e.clientY / window.innerHeight) * 100));
      voiceMode.set({ splitRatio: pct / 100, layout: 'split' });
    };
    const onUp = () => {
      dragging.current = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [voiceMode, splitAxis]);

  const setLayout = (layout: VoiceLayoutMode) => voiceMode.set({ layout });

  // The host `view` wins when provided; otherwise the internal fallback drives
  // both the rendered pane and the button highlight.
  const activeView = view ?? internalView;
  const handleView = (next: 'background' | 'transcript' | 'avatar') => {
    setInternalView(next);
    onView?.(next);
    if (next === 'transcript') setLayout('transcript');
    else if (next === 'avatar') setLayout('avatar');
    // 'background' keeps the host's own layout decision; for a bare host it
    // behaves like 'avatar' so the stage stays visible rather than vanishing.
    else if (!onView) setLayout('avatar');
  };

  const showAvatar = modeState.layout === 'avatar' || modeState.layout === 'split';

  const avatarPane = (
    <div className="nexus-chat__voice-avatar" style={{ flex: 1, minHeight: 0 }}>
      {avatarSlot ||
        (showAvatar ? (
          <VoiceAvatarCanvas
            presence={presence}
            playbackStream={playbackStream}
            audioContext={audioContext}
            sceneMode={sceneMode}
            onHostReady={handleVoiceHostReady}
          />
        ) : contact?.avatarUrl ? (
          <CachedAvatarImage
            src={contact.avatarUrl}
            alt=""
            style={{ maxHeight: '100%', borderRadius: 12 }}
            fallback="🎙️"
          />
        ) : (
          '🎙️'
        ))}
    </div>
  );

  // A call counts as reachable when its surface is connecting or up; Mute/Pause
  // only ever act on a live session, so they must not pretend to work otherwise.
  const callLive =
    surface.status === 'live' || surface.status === 'paused' || surface.status === 'connecting';
  const lastAssistantTurn = [...turns].reverse().find((t) => t.role === 'assistant' && t.text?.trim());
  const canSpeakManager = typeof chat.createSpeakTurn === 'function';
  const canSpeak = Boolean(lastAssistantTurn?.text) && canSpeakManager;

  /*
   * One tight row of compact, icon-first controls.
   *
   * The buttons reuse the composer's `nexus-chat__icon-btn` primitives (30px,
   * 12px text, 8px radius, `.is-on` accent) instead of the chunky
   * `nexus-chat__btn` (36px tall, 8/12 padding) they used to render, so the
   * voice chrome matches the rest of the chat. View toggles are text pills (the
   * bundled icon set has no background/transcript/avatar glyph); the call
   * controls lead with their icon. Labels are unchanged, so the visible copy
   * and the `aria-label`/`title`/`textContent` contract still hold.
   */
  const controls = (
    <div className="nexus-chat__voice-bar" role="group" aria-label="Voice controls">
      {!hideWakeIndicator && wakeSnapshot ? (
        <WakeMicIndicator
          snapshot={wakeSnapshot}
          onOptIn={() => {
            void chat.optInWake?.();
          }}
          onOptOut={() => chat.optOutWake?.()}
        />
      ) : null}
      {(
        [
          ['background', 'Background'],
          ['transcript', 'Transcript'],
          ['avatar', 'Avatar'],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          className={`nexus-chat__icon-btn nexus-chat__icon-btn--text${activeView === id ? ' is-on' : ''}`}
          aria-pressed={activeView === id}
          title={label}
          onClick={() => handleView(id)}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        className="nexus-chat__icon-btn nexus-chat__icon-btn--label nexus-chat__voice-btn--primary"
        disabled={surface.status === 'live' || surface.status === 'connecting'}
        title={
          captureEnabled
            ? undefined
            : 'Another window owns the microphone. Focus it (or say its wake word) to take over.'
        }
        onClick={() => void startCall()}
      >
        <IconPhone />
        <span className="nexus-chat__icon-btn-label">
          {surface.status === 'live'
            ? 'Connected'
            : surface.status === 'connecting'
              ? 'Calling…'
              : 'Start call'}
        </span>
      </button>
      {/* `aria-disabled` (not native `disabled`) so clicking still explains why
          nothing can be spoken instead of swallowing the click silently. */}
      <button
        type="button"
        className="nexus-chat__icon-btn nexus-chat__icon-btn--label"
        aria-disabled={!canSpeak}
        title="Speak (TTS)"
        onClick={() => {
          const agentId = contact?.agentId || contact?.id || '';
          const conversationId = chat.getState().conversationId;
          if (!lastAssistantTurn?.text || typeof chat.createSpeakTurn !== 'function') {
            setNotice('Nothing to speak yet — send or receive a reply first.');
            return;
          }
          setNotice(null);
          const speak = chat.createSpeakTurn({
            agentId,
            virtualAgentId: contact?.virtualEmployeeId || null,
            onPlaybackStream: (stream, ctx) => {
              emitPlayback(stream, {
                agentId,
                conversationId,
                audioContext: ctx,
                source: 'tts',
              });
            },
          });
          void speak.speak(lastAssistantTurn.text);
        }}
      >
        <IconSpeaker />
        <span className="nexus-chat__icon-btn-label">Speak (TTS)</span>
      </button>
      {/*
        Mute/Pause use `aria-disabled` rather than the native `disabled`
        attribute: a native-disabled button swallows the click, so the user gets
        no explanation. Keeping it focusable lets the handler say *why* nothing
        happened (no silent no-op) while the styling/semantics still read as
        disabled — and they keep working exactly as today once a call is live.
        `aria-pressed` mirrors the active mute/pause state (the portal's
        `RealtimeCallPanel` does the same) and drives the `.is-on` highlight.
      */}
      <button
        type="button"
        className={`nexus-chat__icon-btn nexus-chat__icon-btn--label${surface.muted ? ' is-on' : ''}`}
        aria-disabled={!callLive}
        aria-pressed={Boolean(surface.muted)}
        title={surface.muted ? 'Unmute' : 'Mute'}
        onClick={() => {
          if (!callLive) {
            setNotice('No live call to mute.');
            return;
          }
          setNotice(null);
          chat.toggleMute();
        }}
      >
        <IconMic />
        <span className="nexus-chat__icon-btn-label">{surface.muted ? 'Unmute' : 'Mute'}</span>
      </button>
      <button
        type="button"
        className={`nexus-chat__icon-btn nexus-chat__icon-btn--text${surface.paused ? ' is-on' : ''}`}
        aria-disabled={!callLive}
        aria-pressed={Boolean(surface.paused)}
        title={surface.paused ? 'Resume' : 'Pause'}
        onClick={() => {
          if (!callLive) {
            setNotice('No live call to pause.');
            return;
          }
          setNotice(null);
          chat.pauseOrResumeCall();
        }}
      >
        {surface.paused ? 'Resume' : 'Pause'}
      </button>
      {surface.callSid ? (
        <button
          type="button"
          className="nexus-chat__icon-btn nexus-chat__icon-btn--text"
          title="End call"
          onClick={() =>
            void chat.endCall({ agentId: contact?.agentId || contact?.id || '', callSid: surface.callSid! })
          }
        >
          End
        </button>
      ) : null}
    </div>
  );

  if (collapsed) {
    return (
      <div className="nexus-chat__header" style={{ flexWrap: 'wrap' }}>
        <span>Voice · {surface.status}</span>
        {showAvatar ? (
          <div style={{ width: '100%', height: 160 }}>{avatarPane}</div>
        ) : null}
        {controls}
      </div>
    );
  }

  if (modeState.layout === 'avatar') {
    return (
      <div className="nexus-chat__voice nexus-chat__voice--avatar-only">
        <div className="nexus-chat__voice-pane">
          {avatarPane}
          {controls}
          <div style={{ fontSize: 12, color: 'var(--nx-chat-muted)', marginTop: 8 }}>
            {notice || surface.errorMessage || `Status: ${surface.status}`}
          </div>
        </div>
      </div>
    );
  }

  if (modeState.layout === 'transcript') {
    return (
      <div className="nexus-chat__voice nexus-chat__voice--transcript-only">
        <div className="nexus-chat__voice-pane">
          {controls}
          <ThreadView turns={turns} streaming={streaming} empty="Transcript will appear here." />
        </div>
      </div>
    );
  }

  const splitPct = Math.round(modeState.splitRatio * 100);

  return (
    <div
      className={`nexus-chat__voice${splitAxis === 'horizontal' ? ' nexus-chat__voice--hsplit' : ''}`}
      style={{ ['--nx-voice-split' as string]: `${splitPct}%` }}
    >
      <div className="nexus-chat__voice-pane">
        {avatarPane}
        {controls}
        <div style={{ fontSize: 12, color: 'var(--nx-chat-muted)', marginTop: 8 }}>
          {notice || surface.errorMessage || `Status: ${surface.status}`}
        </div>
      </div>
      <div
        className="nexus-chat__voice-handle"
        onMouseDown={() => {
          dragging.current = true;
        }}
        aria-hidden
      />
      <div className="nexus-chat__voice-pane">
        <ThreadView turns={turns} streaming={streaming} empty="Transcript will appear here." />
      </div>
    </div>
  );
}
