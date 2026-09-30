import { useCallback, useMemo, useRef, useState } from 'react';
import type { ChatContact, ChatModelOverride, IoDescriptor, NexusChat } from '@nexus/chat-core';
import { parseMentions, uploadOptsForChatFileDestination } from '@nexus/chat-core';
import type { ChatSlots } from '../slots.js';
import type { SendQueue } from '../utils/sendQueue.js';
import { ModelPicker } from './ModelPicker.js';
import type { ViewerFileRef } from '../viewer/load-preview.js';

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
  showModelPicker?: boolean;
  onOpenFile?: (file: ViewerFileRef) => void;
  /** When true, hide the compact button (lives in context panel). */
  hideCompact?: boolean;
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
  models = [],
  modelsLoading,
  selectedModelId,
  onSelectModel,
  modelOverride,
  showModelPicker,
  onOpenFile,
  hideCompact = true,
}: ComposerProps) {
  const [text, setText] = useState('');
  const [pendingFiles, setPendingFiles] = useState<IoDescriptor[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const queued = sendQueue.list();

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

  return (
    <div className="nexus-chat__composer">
      {showModelPicker ? (
        <ModelPicker
          models={models}
          value={selectedModelId || null}
          loading={modelsLoading}
          onChange={(id) => onSelectModel?.(id)}
        />
      ) : null}
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
        <div className="nexus-chat__composer-row">
          <textarea
            className="nexus-chat__input"
            value={text}
            placeholder={streaming ? 'Queued until the current turn finishes…' : 'Message…'}
            rows={2}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              type="button"
              className="nexus-chat__btn"
              onClick={() => fileRef.current?.click()}
              aria-label="Attach files"
            >
              📎
            </button>
            <button
              type="button"
              className="nexus-chat__btn nexus-chat__btn--primary"
              onClick={() => void sendNow()}
            >
              {streaming ? 'Queue' : 'Send'}
            </button>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
            Cancel
          </button>
        ) : null}
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
      </div>
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
