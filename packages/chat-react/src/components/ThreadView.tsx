import type { ReactNode } from 'react';
import type { ChatTurn, IoDescriptor, NexusChat } from '@nexus/chat-core';
import { CHAT_MARKDOWN_ROOT_CLASS, renderChatMarkdown } from '../markdown.js';
import { ToolTimelineRow } from './ToolTimelineRow.js';
import type { ViewerFileRef } from '../viewer/load-preview.js';

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
  if (!turns.length && !streaming) {
    return <div className="nexus-chat__empty">{empty ?? 'Select a contact to start chatting.'}</div>;
  }
  return (
    <div className="nexus-chat__thread" role="log" aria-live="polite">
      {turns.map((turn) => {
        const isUser = turn.role === 'user';
        const isStreamingBubble =
          !isUser && streaming && turn === turns[turns.length - 1] && !turn.text?.trim();
        return (
          <div
            key={turn.id}
            className={`nexus-chat__turn nexus-chat__turn--${isUser ? 'user' : 'assistant'}${isStreamingBubble ? ' nexus-chat__turn--streaming' : ''}`}
          >
            {turn.senderName ? (
              <div style={{ fontSize: 11, color: 'var(--nx-chat-muted)', marginBottom: 4 }}>
                {turn.senderName}
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
            {(turn.toolEvents || []).map((run) => (
              <ToolTimelineRow
                key={run.id}
                run={run}
                chat={chat}
                conversationId={conversationId}
                onOpenFile={onOpenFile}
              />
            ))}
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
