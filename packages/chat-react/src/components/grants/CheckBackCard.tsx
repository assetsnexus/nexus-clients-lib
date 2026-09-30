import { useEffect, useState } from 'react';
import {
  checkBackRemainingMs,
  formatCheckBackCountdown,
  isCheckBackOverdue,
  isCheckBackTriggerSettledError,
  isCheckBackWaiting,
  isScheduleCheckBackTool,
  parseScheduleCheckBackResult,
  type ChatToolRun,
  type NexusChat,
} from '@nexus/chat-core';

export function CheckBackCard({
  run,
  conversationId,
  chat,
}: {
  run: ChatToolRun;
  conversationId?: string | null;
  chat: NexusChat;
}) {
  const parsed = parseScheduleCheckBackResult(run.result);
  const [nowMs, setNowMs] = useState(Date.now());
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoAttempted, setAutoAttempted] = useState(false);

  useEffect(() => {
    if (!parsed || parsed.wakeUp) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [parsed]);

  useEffect(() => {
    if (!parsed || parsed.wakeUp || autoAttempted || !conversationId) return;
    if (!isCheckBackOverdue(parsed, nowMs)) return;
    setAutoAttempted(true);
    void doTrigger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, nowMs, conversationId, autoAttempted]);

  if (!isScheduleCheckBackTool(run.tool) || !parsed) return null;
  if (parsed.wakeUp) {
    return (
      <div className="nexus-chat__checkback">
        <span>Check-back complete</span>
      </div>
    );
  }

  const waiting = isCheckBackWaiting(parsed, nowMs);
  const remaining = checkBackRemainingMs(parsed, nowMs);
  const overdue = isCheckBackOverdue(parsed, nowMs);

  async function doTrigger() {
    if (!conversationId || triggering) return;
    setTriggering(true);
    setError(null);
    try {
      await chat.triggerCheckBack(conversationId);
    } catch (e) {
      if (isCheckBackTriggerSettledError(e)) {
        setError(null);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div className="nexus-chat__checkback">
      <div>
        <strong>Check-back</strong>
        <div className="nexus-chat__muted">{parsed.reason}</div>
        <div>
          {waiting && !overdue
            ? formatCheckBackCountdown(remaining / 1000)
            : overdue
              ? 'Due now'
              : '—'}
        </div>
      </div>
      {conversationId ? (
        <button
          type="button"
          className="nexus-chat__btn"
          disabled={triggering}
          onClick={() => void doTrigger()}
        >
          {triggering ? 'Triggering…' : 'Resume now'}
        </button>
      ) : null}
      {error ? <div className="nexus-chat__error">{error}</div> : null}
    </div>
  );
}
