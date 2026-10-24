import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ChatContact,
  ChatModelOverride,
  IoDescriptor,
  NexusChat,
  OutgoingSendQueue,
  ReasoningEffortLevel,
} from '@nexus/chat-core';
import { isRetryableOutgoingFailure, latestUnsentUserTurnId } from '@nexus/chat-core';
import {
  connectLiveSttWebSocket,
  createLiveSttSession,
  parseMentions,
  transcribeOrNull,
  uploadOptsForChatFileDestination,
} from '@nexus/chat-core';
import { holdSttCommands } from '../dictation/holdStt.js';
import type { ChatSlots } from '../slots.js';
import { appendComposerDraft } from '../utils/composerDraft.js';
import type { ViewerFileRef } from '../viewer/load-preview.js';
import type { DictationMethod } from '../dictation/dictationPlan.js';
import { holdReleaseAction, pointerLeftTarget } from '../dictation/dictationPlan.js';
import {
  attachmentDisplayName,
  composerCallSnapshot,
  resolveComposerCallTarget,
  type ComposerCallMode,
  type ComposerControls,
} from './composerHost.js';
import { useChatState } from '../hooks/useChatState.js';
import {
  cancelNativeRecognition,
  nativeSpeechBridgeAvailable,
  startNativeRecognition,
  startWebRecognition,
  stopNativeRecognition,
  webSpeechAvailable,
} from '../dictation/phoneStt.js';
import { blobToInlineAudio, startMicCapture } from '../dictation/recordAudio.js';
import {
  IconMic,
  IconPaperclip,
  IconPhone,
  IconQueue,
  IconSend,
  IconSpeaker,
  IconStop,
} from './icons.js';
import { reasoningEffortLabel } from '../chrome/reasoning-slider.js';
import { spokenTurnKey } from '../chrome/auto-voice.js';

export type ComposerProps = {
  chat: NexusChat;
  contacts: ChatContact[];
  conversationId?: string | null;
  contactId?: string | null;
  streaming?: boolean;
  slots?: ChatSlots;
  sendQueue: OutgoingSendQueue;
  threadKey: string;
  /** Queued copy for this thread. Empty hides the bar. */
  queueBannerText?: string;
  queueCount?: number;
  /** Host flag is set, so the send must hit Nexus and not the host chat fallback. */
  bypassFallback?: boolean;
  onFlushQueue?: () => void;
  onCancelQueue?: () => void;
  onQueued?: () => void;
  onNexusReply?: () => void;
  onTransportFailure?: () => void;
  models?: import('../models/picker-types.js').PickerModel[];
  modelsLoading?: boolean;
  selectedModelId?: string | null;
  onSelectModel?: (id: string | null) => void;
  modelOverride?: ChatModelOverride | null;
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | null;
  /** Reasoning stops the selected model allows; `null` = agent default. */
  reasoningLevels?: readonly ReasoningEffortLevel[] | null;
  onReasoningEffort?: (next: ReasoningEffortLevel) => void;
  /** Ignored. The model picker lives in the config sheet. */
  showModelPicker?: boolean;
  /** Auto-play new assistant replies with TTS. */
  autoVoice?: boolean;
  onToggleAutoVoice?: () => void;
  /** Chat text scale stepper (`-a` / `+A`). */
  textScaleDelta?: number;
  onTextScaleDelta?: (next: number) => void;
  dictationMethod?: DictationMethod;
  sttModelId?: string | null;
  /** Speech model accepts a live session while the button is held. */
  sttLive?: boolean;
  /** Grant is missing. Hold must not record or send. */
  grantMissing?: boolean;
  dictationNote?: string | null;
  commandClient?: { send: (command: string, payload?: Record<string, unknown>) => Promise<unknown> };
  onOpenFile?: (file: ViewerFileRef) => void;
  /** @deprecated Ignored. The composer has no separate compact button any more. */
  hideCompact?: boolean;
  /** Library call control. Hosts skin it; the default composer shows the same modes. */
  callsEnabled?: boolean;
  /**
   * Registers the existing draft setter so host prefill can append text.
   * Null on unmount. Does not send.
   */
  onRegisterDraftSetter?: (setter: ((text: string) => void) | null) => void;
};

export function Composer({
  chat,
  contacts,
  conversationId,
  contactId,
  streaming,
  slots,
  sendQueue,
  threadKey,
  queueBannerText = '',
  queueCount = 0,
  bypassFallback = false,
  onFlushQueue,
  onCancelQueue,
  onQueued,
  onNexusReply,
  onTransportFailure,
  modelOverride,
  reasoningEffort = null,
  reasoningLevels = null,
  onReasoningEffort,
  autoVoice = false,
  onToggleAutoVoice,
  textScaleDelta = 0,
  onTextScaleDelta,
  dictationMethod = 'phone',
  sttModelId = null,
  sttLive = false,
  grantMissing = false,
  dictationNote = null,
  commandClient,
  onOpenFile,
  callsEnabled = true,
  onRegisterDraftSetter,
}: ComposerProps) {
  const [text, setText] = useState('');
  const [pendingFiles, setPendingFiles] = useState<IoDescriptor[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [holdPhase, setHoldPhase] = useState<'idle' | 'recording' | 'cancel' | 'working'>('idle');
  const fileRef = useRef<HTMLInputElement>(null);
  const holdRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** Assistant text already spoken by the auto-voice toggle, so a re-render never repeats it. */
  const spokenTurnsRef = useRef<Set<string>>(new Set());
  const sessionRef = useRef<{
    cancel: () => void;
    finish: (commit: boolean) => Promise<void>;
  } | null>(null);
  const releasedRef = useRef<'commit' | 'cancel' | null>(null);
  useEffect(() => {
    if (!onRegisterDraftSetter) return;
    onRegisterDraftSetter((incoming) => {
      setText((prev) => appendComposerDraft(prev, incoming));
    });
    return () => onRegisterDraftSetter(null);
  }, [onRegisterDraftSetter]);

  /**
   * Grow the composer with its content, from one line up to a short cap, so a
   * long draft never eats the thread above it. Runs on every value change
   * (including programmatic prefill/dictation, which do not fire `input`).
   */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const mentionCandidates = useMemo(() => {
    if (mentionQuery == null) return [];
    const q = mentionQuery.toLowerCase();
    return contacts.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [contacts, mentionQuery]);

  const detectMention = (value: string) => {
    const m = value.match(/@([^\s@[]*)$/);
    setMentionQuery(m ? m[1] : null);
  };

  const sendNow = useCallback(async () => {
    const body = text.trim();
    if (!body && !pendingFiles.length) return;
    const mentions = parseMentions(body);
    const payloadText = mentions.cleanText || body;
    const park = (hold: 'streaming' | 'unreachable', lastError?: string, localTurnId?: string | null) => {
      const id = sendQueue.enqueue({
        threadKey,
        text: payloadText,
        attachmentRefs: pendingFiles,
        modelOverride: modelOverride || undefined,
        reasoningEffort,
        localTurnId,
        hold,
        ...(lastError ? { lastError } : {}),
      });
      if (!id) return;
      if (localTurnId) chat.discardLocalUnsentTurns([localTurnId]);
      setText('');
      setPendingFiles([]);
      onQueued?.();
    };
    if (streaming) {
      park('streaming');
      return;
    }
    let result: Awaited<ReturnType<NexusChat['sendMessage']>>;
    try {
      result = await chat.sendMessage(payloadText, {
        conversationId: conversationId || undefined,
        contactId: contactId || undefined,
        attachments: pendingFiles.length ? pendingFiles : undefined,
        ...(modelOverride ? { modelOverride } : {}),
        ...(reasoningEffort ? { reasoningEffort } : {}),
        ...(bypassFallback ? { bypassFallback: true } : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Nexus could not be reached. Try again shortly.';
      result = { ok: false, code: 'exception', message };
    }
    if (result.ok) {
      setText('');
      setPendingFiles([]);
      if (result.transport !== 'fallback') onNexusReply?.();
      return;
    }
    if (!isRetryableOutgoingFailure({ code: result.code, message: result.message })) return;
    const localTurnId = result.localTurnId || latestUnsentUserTurnId(chat.getState().turns);
    park('unreachable', result.message, localTurnId);
    onTransportFailure?.();
  }, [
    bypassFallback,
    chat,
    contactId,
    conversationId,
    modelOverride,
    onNexusReply,
    onQueued,
    onTransportFailure,
    pendingFiles,
    reasoningEffort,
    sendQueue,
    streaming,
    text,
    threadKey,
  ]);

  const onPickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setActionError(null);
    const opts = uploadOptsForChatFileDestination('conversation', {
      conversationId: conversationId || undefined,
    });
    const uploaded: IoDescriptor[] = [];
    for (const file of Array.from(files)) {
      try {
        const res = await chat.uploadAttachment(file, opts);
        if (res?.descriptor) uploaded.push(res.descriptor);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : String(e));
      }
    }
    setPendingFiles((prev) => [...prev, ...uploaded]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const insertMention = (contact: ChatContact) => {
    const token = `@[${contact.name}](${contact.id}) `;
    setText((prev) => prev.replace(/@([^\s@[]*)$/, token));
    setMentionQuery(null);
  };

  const appendTranscript = useCallback((said: string) => {
    const next = said.trim();
    if (!next) return;
    setText((prev) => (prev ? `${prev} ${next}` : next));
  }, []);

  const beginHold = useCallback(async () => {
    if (sessionRef.current) return;
    if (grantMissing) {
      setActionError('Sign in with Nexus to chat.');
      return;
    }
    releasedRef.current = null;
    setActionError(null);
    setHoldPhase('recording');
    try {
      if (dictationMethod === 'phone' && (webSpeechAvailable() || nativeSpeechBridgeAvailable())) {
        if (webSpeechAvailable()) {
          const rec = startWebRecognition(typeof navigator !== 'undefined' ? navigator.language : 'en-US');
          sessionRef.current = {
            cancel: () => rec.abort(),
            finish: async (commit) => {
              if (!commit) {
                rec.abort();
                return;
              }
              appendTranscript(rec.stop());
            },
          };
        } else {
        const requestId = `stt_${Date.now()}`;
        const pending = startNativeRecognition(requestId);
        pending.catch((error) => {
          console.warn('anx.chat.dictation native speech ended', error);
        });
        sessionRef.current = {
          cancel: () => cancelNativeRecognition(requestId),
          finish: async (commit) => {
            if (!commit) {
              cancelNativeRecognition(requestId);
              return;
            }
            stopNativeRecognition(requestId);
            appendTranscript(await pending);
          },
        };
        }
      } else if (dictationMethod === 'phone') {
        throw new Error(dictationNote || 'Speech recognition is not available on this device.');
      } else {
      let liveText = '';
      let liveSocket: { send: (frame: ArrayBuffer) => void; close: () => void } | null = null;
      if (sttLive && commandClient && sttModelId && dictationMethod !== 'direct') {
        const session = await createLiveSttSession(commandClient, { modelId: sttModelId });
        const endpoint = Array.isArray(session.endpoints) ? session.endpoints[0] : null;
        if (session.token && endpoint) {
          liveSocket = connectLiveSttWebSocket({
            wsUrl: endpoint,
            token: session.token,
            modelId: session.modelId || sttModelId,
            onPartial: (text) => {
              liveText = text;
            },
            onFinal: (text) => {
              liveText = `${liveText} ${text}`.trim();
            },
          });
        }
      }
      const capture = await startMicCapture({
        onChunk: liveSocket ? (frame) => liveSocket?.send(frame) : undefined,
      });
      sessionRef.current = {
        cancel: () => {
          capture.cancel();
          liveSocket?.close();
        },
        finish: async (commit) => {
          if (!commit) {
            capture.cancel();
            liveSocket?.close();
            return;
          }
          const blob = await capture.stop();
          liveSocket?.close();
          if (!blob.size && !liveText.trim()) throw new Error('The recording was empty.');
          if (dictationMethod === 'direct') {
            const audio = await blobToInlineAudio(blob, 'voice-message.webm');
            const result = await chat.sendMessage('Voice message', {
              conversationId: conversationId || undefined,
              contactId: contactId || undefined,
              attachments: [audio],
              ...(modelOverride ? { modelOverride } : {}),
              ...(reasoningEffort ? { reasoningEffort } : {}),
              bypassFallback: true,
            });
            if (!result.ok) throw new Error(result.message || 'Could not send the recording.');
            return;
          }
          if (!commandClient || !sttModelId) {
            throw new Error(dictationNote || 'No speech model is available on this subscription.');
          }
          setHoldPhase('working');
          const said = liveText.trim();
          const commands = holdSttCommands({ live: Boolean(liveSocket), hasLiveText: Boolean(said) });
          if (said) {
            appendTranscript(said);
            return;
          }
          if (!commands.includes('anx.inference.stt.create')) {
            throw new Error('The speech model returned no transcript.');
          }
          const transcribed = await transcribeOrNull(commandClient, { modelId: sttModelId, audioBlob: blob });
          if (!transcribed.text) throw new Error('The speech model returned no transcript.');
          appendTranscript(transcribed.text);
        },
      };
      }
      const early = releasedRef.current;
      if (early && sessionRef.current) {
        const session = sessionRef.current;
        sessionRef.current = null;
        await session.finish(early === 'commit');
        setHoldPhase('idle');
      }
    } catch (error) {
      sessionRef.current = null;
      setHoldPhase('idle');
      const message = error instanceof Error ? error.message : 'Could not start the microphone.';
      console.warn('anx.chat.dictation start failed', message);
      setActionError(message);
    }
  }, [
    appendTranscript,
    chat,
    commandClient,
    contactId,
    conversationId,
    dictationMethod,
    dictationNote,
    grantMissing,
    modelOverride,
    sttLive,
    sttModelId,
  ]);

  const endHold = useCallback(async (commit: boolean) => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (!session) {
      releasedRef.current = commit ? 'commit' : 'cancel';
      setHoldPhase('idle');
      return;
    }
    setHoldPhase(commit ? 'working' : 'idle');
    try {
      await session.finish(commit);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Speech recognition failed.';
      console.warn('anx.chat.dictation finish failed', message);
      setActionError(message);
    } finally {
      setHoldPhase('idle');
    }
  }, []);

  const onHoldPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    void beginHold();
  };

  const onHoldPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (holdPhase !== 'recording' && holdPhase !== 'cancel') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const left = pointerLeftTarget(rect, event.clientX, event.clientY);
    setHoldPhase(left ? 'cancel' : 'recording');
  };

  const onHoldPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const left = pointerLeftTarget(rect, event.clientX, event.clientY);
    void endHold(holdReleaseAction({ leftTarget: left }) === 'commit');
  };

  const chatState = useChatState(chat);
  const [callMenuOpen, setCallMenuOpen] = useState(false);
  const callSnap = composerCallSnapshot(chatState.calls, chat.getVoiceSurface());
  const callTarget = resolveComposerCallTarget(contacts, contactId);

  /**
   * Auto voice: speak each new assistant reply once, when the toggle is on and
   * the turn has finished streaming. Keyed by turn id so a re-render (or a
   * history rehydrate) never replays audio the user already heard. A missing
   * TTS surface (or a failed synthesis) degrades to silence — it never blocks
   * the composer.
   */
  useEffect(() => {
    if (!autoVoice || streaming) return;
    if (typeof chat.createSpeakTurn !== 'function') return;
    const turns = chatState.turns;
    const last = [...turns].reverse().find((t) => t.role === 'assistant' && t.text?.trim());
    if (!last) return;
    const key = spokenTurnKey(last);
    if (spokenTurnsRef.current.has(key)) return;
    spokenTurnsRef.current.add(key);
    const agentId = (callTarget?.agentId || contactId || '').trim();
    try {
      const speak = chat.createSpeakTurn({
        agentId: agentId || null,
        virtualAgentId: callTarget?.virtualEmployeeId ?? null,
      });
      void speak.speak(last.text.trim()).catch((error) => {
        console.warn('anx.chat.auto-voice failed', error);
      });
    } catch (error) {
      console.warn('anx.chat.auto-voice unavailable', error);
    }
  }, [autoVoice, streaming, chatState.turns, chat, callTarget?.agentId, callTarget?.virtualEmployeeId, contactId]);

  const startCall = useCallback(
    async (mode: ComposerCallMode) => {
      setCallMenuOpen(false);
      if (!callsEnabled) return;
      const target = resolveComposerCallTarget(contacts, contactId);
      if (!target) {
        const message = 'Open an agent conversation before starting a call.';
        console.warn('anx.chat.call start skipped', { reason: 'no-agent' });
        setActionError(message);
        return;
      }
      setActionError(null);
      try {
        if (mode === 'browser') {
          await chat.startBrowserCall({
            agentId: target.agentId,
            conversationId: conversationId || undefined,
            virtualAgentId: target.virtualEmployeeId,
          });
        } else if (mode === 'phone') {
          await chat.createOutboundCall({
            agentId: target.agentId,
            conversationId: conversationId || undefined,
            virtualAgentId: target.virtualEmployeeId,
          });
        } else {
          await chat.prepareInboundCall(target.agentId);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The call could not start.';
        console.warn('anx.chat.call start failed', { mode, message });
        setActionError(message);
      }
    },
    [callsEnabled, chat, contactId, contacts, conversationId],
  );

  const endActiveCall = useCallback(async () => {
    setCallMenuOpen(false);
    const agentId = callSnap.agentId;
    const callSid = callSnap.callSid;
    if (!agentId || !callSid) return;
    setActionError(null);
    try {
      await chat.endCall({ agentId, callSid });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not end the call.';
      console.warn('anx.chat.call end failed', { message });
      setActionError(message);
    }
  }, [callSnap.agentId, callSnap.callSid, chat]);

  const controls: ComposerControls = {
    attachments: {
      pending: pendingFiles.map((file, index) => ({ name: attachmentDisplayName(file, index) })),
      pick: () => fileRef.current?.click(),
      remove: (index) => setPendingFiles((prev) => prev.filter((_, i) => i !== index)),
    },
    dictation: {
      phase: holdPhase,
      note: dictationNote,
      onPointerDown: onHoldPointerDown,
      onPointerMove: onHoldPointerMove,
      onPointerUp: onHoldPointerUp,
      onPointerCancel: () => void endHold(false),
    },
    call: {
      supported: Boolean(callsEnabled && callTarget),
      active: callSnap.active,
      status: callSnap.status,
      toMasked: callSnap.toMasked,
      dialIn: callSnap.dialIn,
      start: startCall,
      end: endActiveCall,
    },
    error: actionError || callSnap.error,
  };

  const queueBanner = queueCount > 0 ? (
    <div className="nexus-chat__queue" role="status" data-nexus-queue="">
      <span>{queueBannerText || `${queueCount} queued message${queueCount > 1 ? 's' : ''}`}</span>
      <span className="nexus-chat__queue-actions">
        <button type="button" className="nexus-chat__btn" onClick={() => onFlushQueue?.()}>
          Retry
        </button>
        <button type="button" className="nexus-chat__btn" aria-label="Cancel queued messages" onClick={() => onCancelQueue?.()}>
          Cancel
        </button>
      </span>
    </div>
  ) : null;

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      multiple
      hidden
      onChange={(e) => void onPickFiles(e.target.files)}
    />
  );

  if (slots?.composer) {
    const Custom = slots.composer;
    return (
      <div className="nexus-chat__composer">
        {queueBanner}
        <Custom
          chat={chat}
          text={text}
          setText={setText}
          send={sendNow}
          streaming={streaming}
          controls={controls}
        />
        {fileInput}
      </div>
    );
  }

  return (
    <div className="nexus-chat__composer">
      {queueBanner}
      {pendingFiles.length ? (
        <div className="nexus-chat__strip">
          {pendingFiles.map((f, i) => {
            const name = (f as { filename?: string }).filename || 'attachment';
            const url =
              f.kind === 'entity'
                ? f.previewUrl || f.url || f.downloadUrl || null
                : f.kind === 'inline'
                  ? `data:${f.mimeType};base64,${f.dataBase64}`
                  : null;
            return (
              <button
                key={i}
                type="button"
                className="nexus-chat__chip nexus-chat__chip--clickable"
                onClick={() =>
                  onOpenFile?.({
                    id: f.kind === 'entity' ? f.ref : `pending-${i}`,
                    name,
                    mimeType: 'mimeType' in f ? f.mimeType : null,
                    url,
                  })
                }
              >
                {name}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="nexus-chat__composer-wrap">
        {mentionCandidates.length ? (
          <div className="nexus-chat__mention-menu" role="listbox">
            {mentionCandidates.map((c) => (
              <button
                key={c.id}
                type="button"
                className="nexus-chat__mention-item"
                onClick={() => insertMention(c)}
              >
                @{c.name}
              </button>
            ))}
          </div>
        ) : null}
        {holdPhase === 'recording' || holdPhase === 'cancel' ? (
          <div className="nexus-chat__record" role="status">
            {holdPhase === 'cancel' ? 'Release to cancel' : 'Recording… release to insert, slide off to cancel'}
          </div>
        ) : null}
        {/* One bordered box: the draft on top, the action strip underneath, so
            the whole composer is two compact rows instead of a toolbar plus a
            separate input row. */}
        <div className="nexus-chat__composer-box">
          <textarea
            ref={textareaRef}
            className="nexus-chat__input"
            value={text}
            placeholder={streaming ? 'Queued until the current turn finishes…' : 'Message'}
            rows={1}
            onChange={(e) => {
              setText(e.target.value);
              detectMention(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendNow();
              }
            }}
          />
          <div className="nexus-chat__composer-bar">
            <div className="nexus-chat__composer-bar-left">
              <button
                type="button"
                className="nexus-chat__icon-btn"
                onClick={() => fileRef.current?.click()}
                aria-label="Attach files"
                title="Attach files"
              >
                <IconPaperclip />
              </button>
              <button
                ref={holdRef}
                type="button"
                className={`nexus-chat__icon-btn nexus-chat__hold${holdPhase === 'recording' ? ' nexus-chat__hold--recording' : ''}${holdPhase === 'cancel' ? ' nexus-chat__hold--cancel' : ''}`}
                aria-label="Hold to talk"
                title={holdPhase === 'recording' ? 'Recording… release to insert' : 'Hold to talk'}
                disabled={holdPhase === 'working'}
                onPointerDown={onHoldPointerDown}
                onPointerMove={onHoldPointerMove}
                onPointerUp={onHoldPointerUp}
                onPointerCancel={() => void endHold(false)}
                onContextMenu={(event) => event.preventDefault()}
              >
                <IconMic />
              </button>
              {callsEnabled ? (
                <button
                  type="button"
                  className={`nexus-chat__icon-btn${callSnap.active ? ' is-on' : ''}`}
                  aria-label={callSnap.active ? 'End call' : 'Call'}
                  title={callSnap.active ? 'End call' : 'Call'}
                  aria-expanded={callMenuOpen}
                  disabled={!controls.call.supported && !callSnap.active}
                  onClick={() => {
                    if (callSnap.active) {
                      void endActiveCall();
                      return;
                    }
                    setCallMenuOpen((open) => !open);
                  }}
                >
                  <IconPhone />
                </button>
              ) : null}
              <button
                type="button"
                className={`nexus-chat__icon-btn nexus-chat__icon-btn--label${autoVoice ? ' is-on' : ''}`}
                aria-pressed={autoVoice ? 'true' : 'false'}
                aria-label={`Auto voice: ${autoVoice ? 'on' : 'off'}`}
                title={autoVoice ? 'Auto voice: on' : 'Auto voice: off'}
                onClick={() => onToggleAutoVoice?.()}
              >
                <IconSpeaker />
                <span className="nexus-chat__icon-btn-label">Auto voice</span>
              </button>
              {onTextScaleDelta ? (
                <>
                  <button
                    type="button"
                    className="nexus-chat__icon-btn nexus-chat__icon-btn--text"
                    aria-label="Decrease chat text size"
                    title="Decrease chat text size"
                    onClick={() => onTextScaleDelta(Math.max(-2, textScaleDelta - 1))}
                  >
                    -a
                  </button>
                  <button
                    type="button"
                    className="nexus-chat__icon-btn nexus-chat__icon-btn--text"
                    aria-label="Increase chat text size"
                    title="Increase chat text size"
                    onClick={() => onTextScaleDelta(Math.min(3, textScaleDelta + 1))}
                  >
                    +A
                  </button>
                </>
              ) : null}
            </div>
            <div className="nexus-chat__composer-bar-right">
              {reasoningLevels && reasoningLevels.length && onReasoningEffort ? (
                <select
                  className="nexus-chat__select"
                  aria-label="Reasoning effort"
                  title="Reasoning effort"
                  value={reasoningEffort ?? ''}
                  onChange={(e) => onReasoningEffort(e.target.value as ReasoningEffortLevel)}
                >
                  {reasoningLevels.map((level) => (
                    <option key={level} value={level}>
                      {reasoningEffortLabel(level)}
                    </option>
                  ))}
                </select>
              ) : null}
              {conversationId && streaming ? (
                <button
                  type="button"
                  className="nexus-chat__icon-btn"
                  aria-label="Stop generating"
                  title="Stop generating"
                  onClick={() => {
                    setActionError(null);
                    void chat
                      .cancelConversation({ conversationId })
                      .catch((e) => setActionError(e instanceof Error ? e.message : String(e)));
                  }}
                >
                  <IconStop />
                </button>
              ) : null}
              <button
                type="button"
                className="nexus-chat__send"
                aria-label={streaming ? 'Queue message' : 'Send message'}
                title={streaming ? 'Queue message' : 'Send message'}
                disabled={!text.trim() && !pendingFiles.length}
                onClick={() => void sendNow()}
              >
                {streaming ? <IconQueue /> : <IconSend />}
              </button>
            </div>
          </div>
        </div>
        {callSnap.dialIn?.phone || callSnap.dialIn?.accessCode ? (
          <div className="nexus-chat__call-detail" role="status">
            {callSnap.dialIn.phone ? `Dial ${callSnap.dialIn.phone}` : 'Dial in'}
            {callSnap.dialIn.accessCode ? ` · code ${callSnap.dialIn.accessCode}` : ''}
          </div>
        ) : null}
        {callSnap.active && callSnap.toMasked ? (
          <div className="nexus-chat__call-detail" role="status">{`Calling ${callSnap.toMasked}`}</div>
        ) : null}
        {callMenuOpen && callsEnabled ? (
          <div className="nexus-chat__mention-menu" role="menu" aria-label="Call">
            <button type="button" className="nexus-chat__mention-item" onClick={() => void startCall('browser')}>
              Browser call
            </button>
            <button type="button" className="nexus-chat__mention-item" onClick={() => void startCall('phone')}>
              Call my phone
            </button>
            <button type="button" className="nexus-chat__mention-item" onClick={() => void startCall('dial-in')}>
              Dial in
            </button>
          </div>
        ) : null}
      </div>
      {actionError || callSnap.error ? (
        <div className="nexus-chat__error">{actionError || callSnap.error}</div>
      ) : null}
      {fileInput}
    </div>
  );
}
