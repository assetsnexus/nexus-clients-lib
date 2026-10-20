/**
 * Precedent-used chip.
 *
 * Shown when the agent applied a remembered decision (M2 decisions store). It
 * names the precedent and offers a one-click "Not applicable" action that flags
 * a false positive via `chat.markPrecedentNotApplicable`.
 */

import { useState } from 'react';
import { parsePrecedentUse, type ChatToolRun, type NexusChat } from '@nexus/chat-core';

export function PrecedentUsedChip({
  run,
  chat,
  conversationId,
}: {
  run: ChatToolRun;
  chat: NexusChat;
  conversationId?: string | null;
}) {
  const precedent = parsePrecedentUse(run.result);
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!precedent) return null;

  const submit = async () => {
    if (busy || done) return;
    setBusy(true);
    setError(null);
    try {
      const res = await chat.markPrecedentNotApplicable({
        decisionId: precedent.decisionId,
        reason: reason.trim() || 'Did not fit this case',
        ...(precedent.usageId ? { usageRefId: precedent.usageId } : {}),
        conversationId: conversationId ?? undefined,
      });
      if (!res.ok) {
        setError(res.message || 'Could not mark as not applicable');
        return;
      }
      setDone(true);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="nexus-precedent-chip" style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <span className="nexus-precedent-chip__row" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span className="nexus-chat__chip nexus-precedent-chip__label" title={precedent.summary || undefined}>
          Precedent used{precedent.summary ? `: ${precedent.summary}` : ''}
        </span>
        {done ? (
          <span className="nexus-chat__muted">Flagged as not applicable</span>
        ) : (
          <button
            type="button"
            className="nexus-chat__chip nexus-precedent-chip__action"
            aria-expanded={open}
            disabled={busy}
            onClick={() => setOpen((v) => !v)}
          >
            Not applicable
          </button>
        )}
      </span>
      {open && !done ? (
        <span style={{ display: 'inline-flex', gap: 4 }}>
          <input
            className="nexus-precedent-chip__reason"
            type="text"
            placeholder="Why did it not fit? (optional)"
            aria-label="Why the precedent did not apply"
            value={reason}
            disabled={busy}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
          />
          <button
            type="button"
            className="nexus-chat__btn nexus-chat__btn--primary"
            disabled={busy}
            onClick={() => void submit()}
          >
            Send
          </button>
        </span>
      ) : null}
      {error ? <span className="nexus-chat__error">{error}</span> : null}
    </span>
  );
}
