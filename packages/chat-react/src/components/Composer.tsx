import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatContact, ChatModelOverride, IoDescriptor, NexusChat } from '@nexus/chat-core';
import { parseMentions, transcribeOrNull, uploadOptsForChatFileDestination } from '@nexus/chat-core';
import type { ChatSlots } from '../slots.js';
import { appendComposerDraft } from '../utils/composerDraft.js';
import type { SendQueue } from '../utils/sendQueue.js';
import type { ViewerFileRef } from '../viewer/load-preview.js';
import type { DictationMethod } from '../dictation/dictationPlan.js';
import { holdReleaseAction, pointerLeftTarget } from '../dictation/dictationPlan.js';
import {
  cancelNativeRecognition,
  nativeSpeechBridgeAvailable,
  startNativeRecognition,
  startWebRecognition,
  stopNativeRecognition,
  webSpeechAvailable,
} from '../dictation/phoneStt.js';
import { blobToInlineAudio, startMicCapture } from '../dictation/recordAudio.js';

export type ComposerProps = {
  chat: NexusChat;
  contacts: ChatContact[];
  conversationId?: string | null;
  contactId?: string | null;
  streaming?: boolean;
  slots?: ChatSlots;
  sendQueue: SendQueue;
  onFlushQueue?: () => void;
  models?: import('../models/picker-types.js').PickerModel[];
  modelsLoading?: boolean;
  selectedModelId?: string | null;
  onSelectModel?: (id: string | null) => void;
  modelOverride?: ChatModelOverride | null;
  /** Ignored. The model picker lives in the config sheet. */
  showModelPicker?: boolean;
  dictationMethod?: DictationMethod;
  sttModelId?: string | null;
  dictationNote?: string | null;
  commandClient?: { send: (command: string, payload?: Record<string, unknown>) => Promise<unknown> };
  onOpenFile?: (file: ViewerFileRef) => void;
  /** When true, hide the compact button (lives in context panel). */
  hideCompact?: boolean;
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
  onFlushQueue,
  modelOverride,
  dictationMethod = 'phone',
  sttModelId = null,
  dictationNote = null,
  commandClient,
  onOpenFile,
  hideCompact = true,
  onRegisterDraftSetter,
}: ComposerProps) {
  const [text, setText] = useState('');
  const [pendingFiles, setPendingFiles] = useState<IoDescriptor[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [holdPhase, setHoldPhase] = useState<'idle' | 'recording' | 'cancel' | 'working'>('idle');
  const fileRef = useRef<HTMLInputElement>(null);
  const holdRef = useRef<HTMLButtonElement>(null);
  const sessionRef = useRef<{
    cancel: () => void;
    finish: (commit: boolean) => Promise<void>;
  } | null>(null);
  const releasedRef = useRef<'commit' | 'cancel' | null>(null);
  const queued = sendQueue.list();

  useEffect(() => {
    if (!onRegisterDraftSetter) return;
    onRegisterDraftSetter((incoming) => {
      setText((prev) => appendComposerDraft(prev, incoming));
    });
    return () => onRegisterDraftSetter(null);
  }, [onRegisterDraftSetter]);

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
    if (streaming) {
      sendQueue.enqueue({
        text: payloadText,
        attachmentRefs: pendingFiles,
        modelOverride: modelOverride || undefined,
      });
      setText('');
      setPendingFiles([]);
      return;
    }
    const result = await chat.sendMessage(payloadText, {
      conversationId: conversationId || undefined,
      contactId: contactId || undefined,
      attachments: pendingFiles.length ? pendingFiles : undefined,
      ...(modelOverride ? { modelOverride } : {}),
    });
    if (result.ok) {
      setText('');
      setPendingFiles([]);
      return;
    }
    const qid = sendQueue.enqueue({
      text: payloadText,
      attachmentRefs: pendingFiles,
      modelOverride: modelOverride || undefined,
    });
    sendQueue.markError(qid, result.message);
  }, [chat, contactId, conversationId, modelOverride, pendingFiles, sendQueue, streaming, text]);

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
      const capture = await startMicCapture();
      sessionRef.current = {
        cancel: () => capture.cancel(),
        finish: async (commit) => {
          if (!commit) {
            capture.cancel();
            return;
          }
          const blob = await capture.stop();
          if (!blob.size) throw new Error('The recording was empty.');
          if (dictationMethod === 'direct') {
            const audio = await blobToInlineAudio(blob, 'voice-message.webm');
            const result = await chat.sendMessage('Voice message', {
              conversationId: conversationId || undefined,
              contactId: contactId || undefined,
              attachments: [audio],
              ...(modelOverride ? { modelOverride } : {}),
            });
            if (!result.ok) throw new Error(result.message || 'Could not send the recording.');
            return;
          }
          if (!commandClient || !sttModelId) {
            throw new Error(dictationNote || 'No speech model is available on this subscription.');
          }
          setHoldPhase('working');
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
    modelOverride,
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
    const rect = holdRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = pointerLeftTarget(rect, event.clientX, event.clientY);
    setHoldPhase(left ? 'cancel' : 'recording');
  };

  const onHoldPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const rect = holdRef.current?.getBoundingClientRect();
    const left = rect ? pointerLeftTarget(rect, event.clientX, event.clientY) : false;
    void endHold(holdReleaseAction({ leftTarget: left }) === 'commit');
  };

  if (slots?.composer) {
    const Custom = slots.composer;
    return (
      <Custom
        chat={chat}
        text={text}
        setText={setText}
        send={sendNow}
        streaming={streaming}
      />
    );
  }

  const holdLabel = holdPhase === 'cancel' ? 'Cancel' : holdPhase === 'working' ? '…' : 'Hold';

  return (
    <div className="nexus-chat__composer">
      {queued.length ? (
        <div className="nexus-chat__queue">
          <span>
            {queued.length} queued message{queued.length > 1 ? 's' : ''}
            {queued[0]?.lastError ? ` — ${queued[0].lastError}` : ''}
          </span>
          <button type="button" className="nexus-chat__btn" onClick={() => onFlushQueue?.()}>
            Retry
          </button>
        </div>
      ) : null}
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
        <div className="nexus-chat__composer-row">
          <button
            type="button"
            className="nexus-chat__btn"
            onClick={() => fileRef.current?.click()}
            aria-label="Attach files"
          >
            +
          </button>
          <textarea
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
          <button
            ref={holdRef}
            type="button"
            className={`nexus-chat__btn nexus-chat__hold${holdPhase === 'recording' ? ' nexus-chat__hold--recording' : ''}${holdPhase === 'cancel' ? ' nexus-chat__hold--cancel' : ''}`}
            aria-label="Hold to talk"
            disabled={holdPhase === 'working'}
            onPointerDown={onHoldPointerDown}
            onPointerMove={onHoldPointerMove}
            onPointerUp={onHoldPointerUp}
            onPointerCancel={() => void endHold(false)}
            onContextMenu={(event) => event.preventDefault()}
          >
            {holdLabel}
          </button>
          {conversationId && streaming ? (
            <button
              type="button"
              className="nexus-chat__btn"
              onClick={() => {
                setActionError(null);
                void chat
                  .cancelConversation({ conversationId })
                  .catch((e) => setActionError(e instanceof Error ? e.message : String(e)));
              }}
            >
              Stop
            </button>
          ) : null}
          <button
            type="button"
            className="nexus-chat__btn nexus-chat__btn--primary"
            onClick={() => void sendNow()}
          >
            {streaming ? 'Queue' : 'Send'}
          </button>
        </div>
      </div>
      {!hideCompact && conversationId ? (
          <button
            type="button"
            className="nexus-chat__btn"
            onClick={() => {
              setActionError(null);
              void chat
                .compactConversation({ conversationId })
                .catch((e) => setActionError(e instanceof Error ? e.message : String(e)));
            }}
          >
            Compact
          </button>
        ) : null}
      {actionError ? <div className="nexus-chat__error">{actionError}</div> : null}
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        onChange={(e) => void onPickFiles(e.target.files)}
      />
    </div>
  );
}
