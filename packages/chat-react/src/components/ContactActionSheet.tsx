import { useEffect, useState } from 'react';
import type { ChatContact, CommandClient, NexusChat } from '@nexus/chat-core';
import { loadConversationHistory, openContactThread } from '../utils/openContactFlow.js';

export type ContactActionSheetProps = {
  contact: ChatContact | null;
  chat: NexusChat;
  client?: CommandClient;
  onClose: () => void;
};

type HistoryRow = {
  conversationId: string;
  title?: string | null;
  lastActivityAt?: string | null;
  status?: string | null;
};

export function ContactActionSheet({ contact, chat, client, onClose }: ContactActionSheetProps) {
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (!contact) return;
    void (async () => {
      try {
        if (typeof chat.history === 'function') {
          const rows = await chat.history(contact, { includeArchived: true });
          setHistory(
            rows.map((r) => ({
              conversationId: r.conversationId,
              title: r.title,
              lastActivityAt: r.lastActivityAt,
              status: r.status,
            })),
          );
          return;
        }
        if (!client) return;
        const res = await client.send('anx.communicate.conversations.list', {
          contactId: contact.id,
          limit: 20,
        });
        const data =
          res && typeof res === 'object' && 'data' in res
            ? (res as { data: Record<string, unknown> }).data
            : (res as Record<string, unknown>);
        const items = Array.isArray(data?.items)
          ? (data.items as HistoryRow[])
          : Array.isArray(data?.conversations)
            ? (data.conversations as HistoryRow[])
            : [];
        setHistory(items);
      } catch {
        setHistory([]);
      }
    })();
  }, [chat, client, contact]);

  if (!contact) return null;

  const latestId =
    history.find((h) => String(h.status || 'active').toLowerCase() !== 'archived')?.conversationId ||
    history[0]?.conversationId;
  const panelConversationId =
    chat.getState().panels[chat.getState().activePanelIndex]?.conversationId ||
    chat.getState().conversationId;

  return (
    <div className="nexus-chat__sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="nexus-chat__sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Contact actions"
      >
        <strong>{contact.name}</strong>
        <div style={{ color: 'var(--nx-chat-muted)', fontSize: 12 }}>{contact.type}</div>
        {detailsOpen ? (
          <pre
            style={{
              fontSize: 11,
              overflow: 'auto',
              maxHeight: 160,
              marginTop: 8,
              background: 'var(--nx-chat-bg)',
              padding: 8,
              borderRadius: 8,
            }}
          >
            {JSON.stringify(contact, null, 2)}
          </pre>
        ) : null}
        {history.length ? (
          <ul style={{ margin: '12px 0', paddingLeft: 18, fontSize: 13 }}>
            {history.map((h) => (
              <li key={h.conversationId}>
                <button
                  type="button"
                  className="nexus-chat__btn"
                  style={{ marginBottom: 4 }}
                  onClick={() => {
                    if (client) {
                      void loadConversationHistory(client, chat, h.conversationId).then(onClose);
                    } else {
                      void chat.listMessages(h.conversationId).then((messages) => {
                        chat.rehydrateTurns(
                          (messages as Array<Record<string, unknown>>).map((m) => ({
                            id: m.id as string | undefined,
                            role: String(m.role || 'assistant'),
                            content: String(m.content ?? m.text ?? ''),
                          })),
                          { conversationId: h.conversationId, detachStream: true },
                        );
                        onClose();
                      });
                    }
                  }}
                >
                  Open {h.title || h.conversationId}
                  {h.status && h.status !== 'active' ? ` (${h.status})` : ''}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--nx-chat-muted)' }}>No conversation history loaded.</p>
        )}
        <div className="nexus-chat__sheet-actions">
          <button type="button" className="nexus-chat__btn" onClick={() => setDetailsOpen((v) => !v)}>
            Details
          </button>
          <button
            type="button"
            className="nexus-chat__btn"
            onClick={() => void openContactThread(chat, contact.id, contact).then(onClose)}
          >
            Open latest
          </button>
          <button
            type="button"
            className="nexus-chat__btn"
            disabled={!latestId}
            onClick={() => {
              if (!latestId) return;
              void chat.archiveConversation(latestId).then(onClose);
            }}
          >
            Archive
          </button>
          <button
            type="button"
            className="nexus-chat__btn"
            disabled={!latestId}
            onClick={() => {
              if (!latestId) return;
              void chat.deleteConversation(latestId).then(onClose);
            }}
          >
            Delete
          </button>
          <button
            type="button"
            className="nexus-chat__btn"
            onClick={() =>
              void chat
                .resetConversation(contact, panelConversationId || latestId || null)
                .then(async (res) => {
                  chat.rehydrateTurns([], { conversationId: res.conversationId, detachStream: true });
                  await chat.streamInit({ conversationId: res.conversationId, contactId: contact.id });
                  onClose();
                })
            }
          >
            Reset thread
          </button>
          <button type="button" className="nexus-chat__btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
