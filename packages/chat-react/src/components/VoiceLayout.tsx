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
}: VoiceLayoutProps) {
  const voiceMode = useMemo(
    () => createVoiceModeState({ layout: initialLayout, splitRatio: 0.45 }),
    [initialLayout],
  );
  const [modeState, setModeState] = useState(voiceMode.get());
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
  }, [chat, client, contact, emitPlayback, onVoiceActive, turns, voiceMode]);

  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    autoStarted.current = true;
    void startCall();
  }, [autoStart, startCall]);

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

  useEffect(() => {
    const live = surface.status === 'live' || surface.status === 'connecting';
    onVoiceState?.({
      active: live,
      muted: Boolean(surface.muted),
      status: surface.status,
      errorMessage: notice || surface.errorMessage || null,
    });
    onVoiceActive?.(live);
    const current = voiceMode.get();
    if (current.active !== live) {
      voiceMode.set({ active: live });
    }
  }, [notice, onVoiceActive, onVoiceState, surface.errorMessage, surface.muted, surface.status, voiceMode]);

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

  const controls = (
    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      {wakeSnapshot ? (
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
          className={`nexus-chat__btn${(view || 'avatar') === id ? ' nexus-chat__btn--primary' : ''}`}
          onClick={() => {
            if (id === 'background') onView?.('background');
            if (id === 'transcript') {
              onView?.('transcript');
              setLayout('transcript');
            }
            if (id === 'avatar') {
              onView?.('avatar');
              setLayout('avatar');
            }
          }}
        >
          {label}
        </button>
      ))}
      <button type="button" className="nexus-chat__btn nexus-chat__btn--primary" onClick={() => void startCall()}>
        {surface.status === 'live' ? 'Connected' : 'Start call'}
      </button>
      <button
        type="button"
        className="nexus-chat__btn"
        onClick={() => {
          const agentId = contact?.agentId || contact?.id || '';
          const conversationId = chat.getState().conversationId;
          const lastAssistant = [...turns].reverse().find((t) => t.role === 'assistant' && t.text?.trim());
          if (!lastAssistant?.text || typeof chat.createSpeakTurn !== 'function') return;
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
          void speak.speak(lastAssistant.text);
        }}
      >
        Speak (TTS)
      </button>
      <button type="button" className="nexus-chat__btn" onClick={() => chat.toggleMute()}>
        {surface.muted ? 'Unmute' : 'Mute'}
      </button>
      <button type="button" className="nexus-chat__btn" onClick={() => chat.pauseOrResumeCall()}>
        {surface.paused ? 'Resume' : 'Pause'}
      </button>
      {surface.callSid ? (
        <button
          type="button"
          className="nexus-chat__btn"
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
