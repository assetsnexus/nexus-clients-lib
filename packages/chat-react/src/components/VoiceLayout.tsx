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
import { VoiceAvatarCanvas } from './VoiceAvatarCanvas.js';
import { CachedAvatarImage } from './CachedAvatarImage.js';
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
}: VoiceLayoutProps) {
  const voiceMode = useMemo(() => createVoiceModeState({ layout: 'split', splitRatio: 0.45 }), []);
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

  const presence =
    presenceProp ||
    (contact ? presenceStore.get(contact.id) || readPresenceFromProfile(contact) : null);

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

  const startCall = useCallback(async () => {
    if (!contact || (contact.type !== 'agent' && contact.type !== 'asset_agent')) return;
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
      // TTS fallback when WebRTC is unavailable: speak last assistant turn (or greeting).
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

  useEffect(() => {
    const live = surface.status === 'live' || surface.status === 'connecting';
    onVoiceActive?.(live);
    const current = voiceMode.get();
    if (current.active !== live) {
      voiceMode.set({ active: live });
    }
  }, [onVoiceActive, surface.status, voiceMode]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const pct = Math.min(75, Math.max(25, (e.clientY / window.innerHeight) * 100));
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
  }, [voiceMode]);

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
    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
      {(['avatar', 'transcript', 'split'] as VoiceLayoutMode[]).map((layout) => (
        <button
          key={layout}
          type="button"
          className={`nexus-chat__btn${modeState.layout === layout ? ' nexus-chat__btn--primary' : ''}`}
          onClick={() => setLayout(layout)}
        >
          {layout}
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
            {surface.errorMessage || `Status: ${surface.status}`}
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
    <div className="nexus-chat__voice" style={{ ['--nx-voice-split' as string]: `${splitPct}%` }}>
      <div className="nexus-chat__voice-pane">
        {avatarPane}
        {controls}
        <div style={{ fontSize: 12, color: 'var(--nx-chat-muted)', marginTop: 8 }}>
          {surface.errorMessage || `Status: ${surface.status}`}
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
