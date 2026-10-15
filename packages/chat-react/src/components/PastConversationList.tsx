import { pastConversationViews } from '../inbox/past-conversation-row.js';
import type { ConversationRow } from '@nexus/chat-core';

export function PastConversationList({
  rows,
  activeId,
  locale,
  loading,
  error,
  onOpen,
  onRetry,
}: {
  rows: ConversationRow[];
  activeId: string | null;
  locale: string;
  loading: boolean;
  error: string | null;
  onOpen: (conversationId: string) => void;
  onRetry: () => void;
}) {
  const views = pastConversationViews(rows, new Date(), locale || 'en');
  return (
    <div className="nexus-chat__inbox-list" role="list">
      {error ? (
        <div className="nexus-chat__banner" role="alert">
          <span>{error}</span>
          <button type="button" className="nexus-chat__btn" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : null}
      {loading ? <p className="nexus-chat__past-note">Loading conversations…</p> : null}
      {!loading && !views.length ? <p className="nexus-chat__past-note">No conversations yet.</p> : null}
      {views.map((row) => (
        <button
          key={row.id}
          type="button"
          role="listitem"
          className={`nexus-chat__past-row${activeId === row.id ? ' nexus-chat__past-row--active' : ''}`}
          aria-current={activeId === row.id ? 'true' : undefined}
          onClick={() => onOpen(row.id)}
        >
          <span className="nexus-chat__past-row-main">
            <span className="nexus-chat__past-row-title">{row.title}</span>
            {row.timeLabel ? (
              <time className="nexus-chat__past-row-time" dateTime={row.timeIso || undefined}>
                {row.timeLabel}
              </time>
            ) : null}
          </span>
          {row.summary ? <span className="nexus-chat__past-row-summary">{row.summary}</span> : null}
        </button>
      ))}
    </div>
  );
}
