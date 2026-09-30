import { useState } from 'react';
import type { ChatTurn, NexusChat } from '@nexus/chat-core';

function pendingRuns(turns: ChatTurn[]) {
  const out: Array<{ approvalId: string; label: string; callId?: string }> = [];
  for (const turn of turns) {
    for (const run of turn.toolEvents || []) {
      if (run.status === 'needs_approval' && run.approvalId) {
        out.push({
          approvalId: run.approvalId,
          label: run.label || run.tool,
          callId: run.id,
        });
      }
    }
  }
  return out;
}

export function ApprovalsStrip({ chat, turns }: { chat: NexusChat; turns: ChatTurn[] }) {
  const items = pendingRuns(turns);
  const [error, setError] = useState<string | null>(null);
  if (!items.length && !error) return null;

  const act = async (fn: () => Promise<boolean>, label: string) => {
    setError(null);
    try {
      const ok = await fn();
      if (!ok) setError(`${label} failed (SCA may be required — check the banner).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="nexus-chat__strip" role="region" aria-label="Pending approvals">
      {items.map((item) => (
        <div key={item.approvalId} className="nexus-chat__chip nexus-chat__chip--warn">
          <span>{item.label}</span>
          <button
            type="button"
            className="nexus-chat__btn"
            style={{ marginLeft: 6, padding: '2px 6px' }}
            onClick={() =>
              void act(
                () => chat.approveTool({ approvalId: item.approvalId, callId: item.callId }),
                'Approve',
              )
            }
          >
            Approve
          </button>
          <button
            type="button"
            className="nexus-chat__btn"
            style={{ marginLeft: 4, padding: '2px 6px' }}
            onClick={() =>
              void act(
                () => chat.revertTool({ approvalId: item.approvalId, callId: item.callId }),
                'Reject',
              )
            }
          >
            Reject
          </button>
        </div>
      ))}
      {error ? <div className="nexus-chat__error">{error}</div> : null}
    </div>
  );
}
