import { useState } from 'react';
import {
  cancelAgentRun,
  pauseAgentRun,
  resumeAgentRun,
  type ChatTurn,
  type CommandClient,
  type NexusChat,
  type SubAgentStripItem,
} from '@nexus/chat-core';
import { loadConversationHistory } from '../utils/openContactFlow.js';
import { subAgentChipLabel, summarizeSubAgentChip } from '../utils/sub-agent-chip.js';

export function SubAgentsStrip({
  chat,
  client,
  turns,
}: {
  chat: NexusChat;
  client?: CommandClient;
  turns: ChatTurn[];
}) {
  const [open, setOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const summary = summarizeSubAgentChip(turns);
  if (!summary) return null;

  const runAction = async (
    fn: (c: CommandClient, id: { runId: string }) => Promise<unknown>,
    run: SubAgentStripItem,
  ) => {
    if (!client || !run.runId) return;
    setBusyId(run.id);
    setActionError(null);
    try {
      await fn(client, { runId: run.runId });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const openLinked = (run: SubAgentStripItem) => {
    if (!run.linkedConversationId) return;
    if (client) {
      void loadConversationHistory(client, chat, run.linkedConversationId).catch((e) =>
        setActionError(e instanceof Error ? e.message : String(e)),
      );
    } else {
      void chat.listMessages(run.linkedConversationId).then((messages) => {
        chat.rehydrateTurns(
          (messages as Array<Record<string, unknown>>).map((m) => ({
            id: m.id as string | undefined,
            role: String(m.role || 'assistant'),
            content: String(m.content ?? m.text ?? ''),
          })),
          { conversationId: run.linkedConversationId!, detachStream: true },
        );
      });
    }
  };

  return (
    <div className="nexus-chat__subagents" role="region" aria-label="Sub-agents">
      <button
        type="button"
        className={`nexus-chat__chip nexus-chat__chip--clickable${summary.hasError ? ' nexus-chat__chip--warn' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        {subAgentChipLabel(summary)}
      </button>
      {open ? (
        <div className="nexus-chat__subagents-overlay">
          {summary.runs.map((run) => {
            const active = ['running', 'paused', 'queued', 'pending', 'awaiting_approval'].includes(
              String(run.status || '').toLowerCase(),
            );
            return (
              <div key={run.id} className="nexus-chat__subagents-row">
                <div>
                  <strong>{run.mission}</strong>
                  <div className="nexus-chat__muted">{run.status}</div>
                  {run.error ? <div className="nexus-chat__error">{run.error}</div> : null}
                </div>
                <div className="nexus-chat__subagents-actions">
                  {client && run.runId && run.status !== 'paused' && active ? (
                    <button
                      type="button"
                      className="nexus-chat__btn"
                      disabled={busyId === run.id}
                      onClick={() => void runAction(pauseAgentRun, run)}
                    >
                      Pause
                    </button>
                  ) : null}
                  {client && run.runId && run.status === 'paused' ? (
                    <button
                      type="button"
                      className="nexus-chat__btn"
                      disabled={busyId === run.id}
                      onClick={() => void runAction(resumeAgentRun, run)}
                    >
                      Resume
                    </button>
                  ) : null}
                  {client && run.runId && active ? (
                    <button
                      type="button"
                      className="nexus-chat__btn"
                      disabled={busyId === run.id}
                      onClick={() => void runAction(cancelAgentRun, run)}
                    >
                      Cancel
                    </button>
                  ) : null}
                  {run.linkedConversationId ? (
                    <button type="button" className="nexus-chat__btn" onClick={() => openLinked(run)}>
                      Open
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
          {actionError ? <div className="nexus-chat__error">{actionError}</div> : null}
          <button type="button" className="nexus-chat__btn" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      ) : null}
    </div>
  );
}
