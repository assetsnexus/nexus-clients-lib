import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import type { ChatTurn, IoDescriptor, NexusChat } from '@nexus/chat-core';
import { isPostedFromVoice, isVoiceBubble } from '@nexus/chat-core';
import { CHAT_MARKDOWN_ROOT_CLASS, renderChatMarkdown } from '../markdown.js';
import { ToolTimeline } from './ToolTimeline.js';
import type { ViewerFileRef } from '../viewer/load-preview.js';

/**
 * How close to the bottom (in px) the thread must be for a new turn to keep
 * following the conversation. Past this the reader has scrolled up on purpose
 * and we leave the viewport alone until they come back down. Same "stick to
 * bottom while near the bottom" convention the portal uses.
 */
export const THREAD_STICK_TO_BOTTOM_PX = 80;

export type ThreadViewProps = {
  turns: ChatTurn[];
  streaming?: boolean;
  empty?: ReactNode;
  chat?: NexusChat;
  conversationId?: string | null;
  onOpenFile?: (file: ViewerFileRef) => void;
};

function attachmentLabel(att: IoDescriptor): string {
  if ('filename' in att && att.filename) return att.filename;
  if (att.kind === 'entity') return att.ref || 'attachment';
  if (att.kind === 'bucket') return att.path || 'attachment';
  return 'attachment';
}

function attachmentToViewer(att: IoDescriptor, index: number): ViewerFileRef {
  const name = attachmentLabel(att);
  const mime = 'mimeType' in att ? att.mimeType || null : null;
  if (att.kind === 'entity') {
    return {
      id: att.ref || `att-${index}`,
      name,
      mimeType: mime,
      url: att.url || att.previewUrl || att.downloadUrl || null,
      downloadUrl: att.downloadUrl || att.url || null,
    };
  }
  if (att.kind === 'inline' && att.dataBase64) {
    return {
      id: `inline-${index}`,
      name,
      mimeType: att.mimeType,
      url: `data:${att.mimeType};base64,${att.dataBase64}`,
    };
  }
  return { id: `att-${index}`, name, mimeType: mime, url: null };
}

export function ThreadView({
  turns,
  streaming,
  empty,
  chat,
  conversationId,
  onOpenFile,
}: ThreadViewProps) {
  const threadRef = useRef<HTMLDivElement>(null);
  // Whether the reader is "at" the bottom. Starts true so a freshly-opened
  // conversation (or the first render) lands at the bottom, then follows the
  // reader's own scrolling.
  const stickRef = useRef(true);
  // The conversation whose turns are currently rendered, so a *switch* can be
  // told apart from an append within the same conversation.
  const conversationRef = useRef<string | null>(conversationId ?? null);

  useLayoutEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    const switched = conversationRef.current !== (conversationId ?? null);
    conversationRef.current = conversationId ?? null;
    // Jump on open/switch, and whenever the reader is already at the bottom;
    // never yank the viewport away from someone reading further up.
    if (switched || stickRef.current) {
      el.scrollTop = el.scrollHeight;
      stickRef.current = true;
    }
  }, [turns, streaming, conversationId]);

  // Follow streamed growth (an assistant turn with no new array identity yet,
  // e.g. tool cards appended inside a turn) too, once per frame.
  useEffect(() => {
    const el = threadRef.current;
    if (!el || !streaming || !stickRef.current) return;
    let raf = 0;
    const follow = () => {
      if (threadRef.current && stickRef.current) {
        threadRef.current.scrollTop = threadRef.current.scrollHeight;
        raf = requestAnimationFrame(follow);
      }
    };
    raf = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(raf);
  }, [streaming]);

  if (!turns.length && !streaming) {
    return <div className="nexus-chat__empty">{empty ?? 'Select a contact to start chatting.'}</div>;
  }
  return (
    <div
      ref={threadRef}
      className="nexus-chat__thread"
      role="log"
      aria-live="polite"
      onScroll={() => {
        const el = threadRef.current;
        if (!el) return;
        stickRef.current =
          el.scrollHeight - el.scrollTop - el.clientHeight <= THREAD_STICK_TO_BOTTOM_PX;
      }}
    >
      {turns.map((turn) => {
        const isUser = turn.role === 'user';
        const isStreamingBubble =
          !isUser && streaming && turn === turns[turns.length - 1] && !turn.text?.trim();
        const isVoice = isVoiceBubble(turn);
        const isChatOnly = isPostedFromVoice(turn);
        return (
          <div
            key={turn.id}
            className={`nexus-chat__turn nexus-chat__turn--${isUser ? 'user' : 'assistant'}${isStreamingBubble ? ' nexus-chat__turn--streaming' : ''}${isVoice ? ' nexus-chat__turn--voice' : ''}${isChatOnly ? ' nexus-chat__turn--chat-only' : ''}`}
            data-nexus-modality={isVoice ? 'voice' : isChatOnly ? 'chat_only' : undefined}
          >
            {turn.senderName || isVoice ? (
              <div style={{ fontSize: 11, color: 'var(--nx-chat-muted)', marginBottom: 4 }}>
                {/* Part D item 29 — a spoken utterance carries the mic marker. */}
                {isVoice ? <span title="Spoken in a call">🎙 </span> : null}
                {turn.senderName}
              </div>
            ) : null}
            {isChatOnly ? (
              <div
                className="nexus-chat__posted-from-voice"
                style={{ fontSize: 10, fontStyle: 'italic', color: 'var(--nx-chat-muted)', marginBottom: 2 }}
              >
                posted from voice
              </div>
            ) : null}
            {turn.pending ? (
              <div style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--nx-chat-muted)', marginTop: 2 }}>
                transcribing…
              </div>
            ) : null}
            {turn.compaction ? (
              <div className="nexus-chat__compaction">
                Compacted
                {turn.compaction.beforeTokens != null || turn.compaction.afterTokens != null
                  ? ` · ${turn.compaction.beforeTokens ?? '?'} → ${turn.compaction.afterTokens ?? '?'} tok`
                  : ''}
                {turn.compaction.summary ? ` — ${turn.compaction.summary}` : ''}
              </div>
            ) : null}
            {turn.text ? (
              <div
                className={CHAT_MARKDOWN_ROOT_CLASS}
                dangerouslySetInnerHTML={{ __html: renderChatMarkdown(turn.text) }}
              />
            ) : null}
            {(turn.attachments || []).length ? (
              <div className="nexus-chat__file-chips">
                {(turn.attachments || []).map((att, i) => {
                  const ref = attachmentToViewer(att, i);
                  return (
                    <button
                      key={`${turn.id}-att-${i}`}
                      type="button"
                      className="nexus-chat__chip nexus-chat__chip--clickable"
                      onClick={() => onOpenFile?.(ref)}
                    >
                      {ref.name}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {(turn.cards || []).map((card, index) => (
              <article key={card.id || `${turn.id}-card-${index}`} className="nexus-chat__fallback-card" data-nexus-card={card.kind || 'card'}>
                {card.title ? <strong>{card.title}</strong> : null}
                {card.body ? <p>{card.body}</p> : null}
              </article>
            ))}
            <ToolTimeline
              runs={turn.toolEvents || []}
              streaming={Boolean(streaming && turn === turns[turns.length - 1] && !isUser)}
              chat={chat}
              conversationId={conversationId}
              onOpenFile={onOpenFile}
            />
            {turn.deliveryStatus === 'failed' && turn.deliveryError ? (
              <div style={{ color: '#e55353', fontSize: 12, marginTop: 6 }}>
                Send failed: {turn.deliveryError.message}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
