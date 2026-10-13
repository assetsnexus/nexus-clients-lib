import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  cancelAgentRun,
  getAgentRun,
  messageAgentRun,
  pauseAgentRun,
  resumeAgentRun,
  type ChatTurn,
  type CommandClient,
  type MessageDelivery,
  type NexusChat,
  type SubAgentStripItem,
} from '@nexus/chat-core';
import { loadConversationHistory } from '../utils/openContactFlow.js';
import { subAgentChipLabel, summarizeSubAgentChip } from '../utils/sub-agent-chip.js';
import {
  isSubAgentDetailsOpen,
  normalizeSteerText,
  overlaySurfacePaint,
  readChatTokenColors,
  subAgentRunControls,
} from '../utils/sub-agent-overlay.js';
import { SubAgentRunDetails } from './SubAgentRunDetails.js';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
  const rootRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const detailsId = useId();
  const summary = summarizeSubAgentChip(turns);
  const runCount = summary?.runs.length ?? 0;
  const detailsOpen = isSubAgentDetailsOpen(open, runCount);

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    const host = rootRef.current;
    if (!detailsOpen || !overlay || !host) return;
    const paint = overlaySurfacePaint(readChatTokenColors(host));
    overlay.style.backgroundColor = paint.backgroundColor;
    overlay.style.backgroundImage = 'none';
    overlay.style.color = paint.color;
    overlay.style.borderColor = paint.borderColor;
  }, [detailsOpen, runCount]);

  useEffect(() => {
    if (!detailsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root || root.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [detailsOpen]);

  if (!summary) {
    return <div data-nexus-surface="subagents" hidden />;
  }

  const runAction = async (
    fn: (c: CommandClient, id: { runId: string; workloadId: string }) => Promise<unknown>,
    run: SubAgentStripItem,
  ) => {
    if (!client || !run.runId) return;
    setBusyId(run.id);
    setActionError(null);
    try {
      await fn(client, { runId: run.runId, workloadId: run.runId });
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      setBusyId(null);
    }
  };

  const openLinked = async (run: SubAgentStripItem) => {
    setBusyId(run.id);
    setActionError(null);
    try {
      let conversationId = run.linkedConversationId || null;
      if (!conversationId && client && run.runId) {
        const detail = await getAgentRun(client, { runId: run.runId, workloadId: run.runId });
        conversationId = detail.linkedConversationId || null;
      }
      if (!conversationId) {
        setActionError('Sub-agent conversation is not available yet');
        return;
      }
      if (client) {
        await loadConversationHistory(client, chat, conversationId);
      } else {
        const messages = await chat.listMessages(conversationId);
        chat.rehydrateTurns(
          (messages as Array<Record<string, unknown>>).map((message) => ({
            id: message.id as string | undefined,
            role: String(message.role || 'assistant'),
            content: String(message.content ?? message.text ?? ''),
          })),
          { conversationId, detachStream: true },
        );
      }
      setOpen(false);
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      setBusyId(null);
    }
  };

  const steer = async (run: SubAgentStripItem, text: string, delivery: MessageDelivery): Promise<boolean> => {
    if (!client || !run.runId) return false;
    const normalized = normalizeSteerText(text);
    if (!normalized.ok) {
      setActionError(normalized.reason === 'too_long' ? 'Message is too long' : 'Enter a message');
      return false;
    }
    setBusyId(run.id);
    setActionError(null);
    try {
      await messageAgentRun(client, {
        runId: run.runId,
        workloadId: run.runId,
        text: normalized.text,
        delivery,
      });
      return true;
    } catch (error) {
      setActionError(errorText(error));
      return false;
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`nexus-chat__subagents${detailsOpen ? ' nexus-chat__subagents--open' : ''}`}
      data-nexus-surface="subagents"
      data-open={detailsOpen ? 'true' : 'false'}
      role="region"
      aria-label="Sub-agents"
    >
      <button
        type="button"
        className={`nexus-chat__chip nexus-chat__chip--clickable${summary.hasError ? ' nexus-chat__chip--warn' : ''}`}
        aria-expanded={detailsOpen}
        aria-controls={detailsId}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        {subAgentChipLabel(summary)}
      </button>
      {detailsOpen ? (
        <div
          ref={overlayRef}
          id={detailsId}
          className="nexus-chat__subagents-overlay"
          role="dialog"
          aria-label="Sub-agent details"
        >
          {summary.runs.map((run) => {
            const controls = subAgentRunControls(run, { hasClient: Boolean(client) });
            return (
              <SubAgentRunDetails
                key={run.id}
                run={run}
                busy={busyId === run.id}
                controls={controls}
                onPause={() => void runAction(pauseAgentRun, run)}
                onResume={() => void runAction(resumeAgentRun, run)}
                onCancel={() => void runAction(cancelAgentRun, run)}
                onOpen={() => void openLinked(run)}
                onSteer={(text, delivery) => steer(run, text, delivery)}
              />
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
