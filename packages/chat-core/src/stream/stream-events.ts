import type { ChatToolRun, ChatTurn } from '../state.js';
import { mergeToolStreamEvents, type ToolStreamEvent } from './tool-events.js';
import { classifyChatBillingIssue } from '../billing/classify-billing-issue.js';

export type StreamEvent = { type: string; data?: unknown };

export function parseStreamMessage(raw: unknown): StreamEvent | null {
  try {
    const ev = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!ev || typeof ev !== 'object' || typeof (ev as StreamEvent).type !== 'string') return null;
    return ev as StreamEvent;
  } catch {
    return null;
  }
}

function isToolish(type: string): boolean {
  return (
    type === 'tool_call' ||
    type === 'tool_result' ||
    type === 'tool_consent_request' ||
    type.startsWith('sub_agent_')
  );
}

function eventCallId(ev: StreamEvent): string | null {
  if (!ev.data || typeof ev.data !== 'object') return null;
  const id = (ev.data as { callId?: unknown }).callId;
  return typeof id === 'string' && id ? id : null;
}

/**
 * Tool events / pause markers for a call that already lives in an earlier turn
 * (resume, server-side data-access retry) must update that turn's row instead of
 * adding a duplicate row to the new streaming turn.
 */
function owningTurnIndex(turns: ChatTurn[], assistantTurnId: string, ev: StreamEvent): number {
  const ownIdx = turns.findIndex((t) => t.id === assistantTurnId);
  if (!isToolish(ev.type) && ev.type !== 'paused') return ownIdx;
  const findRow = (match: (r: ChatToolRun) => boolean): number => {
    if (ownIdx >= 0 && (turns[ownIdx].toolEvents || []).some(match)) return ownIdx;
    for (let i = turns.length - 1; i >= 0; i--) {
      if (i === ownIdx) continue;
      if ((turns[i].toolEvents || []).some(match)) return i;
    }
    return -1;
  };
  const callId = eventCallId(ev);
  if (callId) {
    const idx = findRow((r) => r.id === callId);
    if (idx >= 0) return idx;
  }
  if (ev.type.startsWith('sub_agent_') && ev.data && typeof ev.data === 'object') {
    // Background sub-agent events (possibly long after the spawning turn, or
    // after a reload) belong to the turn holding their `run_sub_agent` row.
    const d = ev.data as Record<string, unknown>;
    const parentCallId = typeof d.parentCallId === 'string' ? d.parentCallId : '';
    if (parentCallId) {
      const idx = findRow((r) => r.id === parentCallId);
      if (idx >= 0) return idx;
    }
    const runId =
      (typeof d.subAgentRunId === 'string' && d.subAgentRunId) ||
      (typeof d.runId === 'string' && d.runId) ||
      '';
    if (runId) {
      const idx = findRow(
        (r) => r.subAgentRunId === runId && (r.tool === 'run_sub_agent' || r.kind === 'sub_agent'),
      );
      if (idx >= 0) return idx;
    }
  }
  return ownIdx;
}

/**
 * Patch only the addressed row of an earlier turn. Earlier turns may be rehydrated
 * from history (rows without rawToolStream), so re-merging the raw stream would drop rows.
 */
function patchForeignTurnRow(turn: ChatTurn, ev: StreamEvent): ChatTurn {
  const callId = eventCallId(ev);
  const rows = turn.toolEvents || [];
  const existing = rows.find((r) => r.id === callId);
  if (!callId || !existing) return turn;
  const event: ToolStreamEvent =
    ev.type === 'paused'
      ? {
          type: 'tool_result',
          data: {
            callId,
            status: 'paused',
            name: existing.tool,
            ...((ev.data as { reason?: string }).reason
              ? { reason: (ev.data as { reason?: string }).reason }
              : {}),
          },
        }
      : ({ type: ev.type, data: ev.data } as ToolStreamEvent);
  const [patched] = mergeToolStreamEvents([event], [existing]);
  return {
    ...turn,
    toolEvents: rows.map((r) => (r.id === callId && patched ? patched : r)),
  };
}

/** A streaming assistant turn that received nothing renderable. */
export function isEmptyAssistantTurn(turn: ChatTurn | undefined): boolean {
  if (!turn || turn.role !== 'assistant') return false;
  return !(turn.text || '').trim() && !(turn.toolEvents || []).length;
}

/**
 * Apply one stream event onto the assistant turn (tokens, tools, usage, compaction, pause).
 */
export function applyStreamEventToTurns(
  turns: ChatTurn[],
  assistantTurnId: string,
  ev: StreamEvent,
): ChatTurn[] {
  const idx = owningTurnIndex(turns, assistantTurnId, ev);
  if (idx < 0) return turns;
  const turn = { ...turns[idx] };
  const next = [...turns];

  if (turns[idx].id !== assistantTurnId) {
    if (ev.type.startsWith('sub_agent_')) {
      const event = { type: ev.type, data: ev.data } as ToolStreamEvent;
      next[idx] = {
        ...turn,
        rawToolStream: [...(turn.rawToolStream || []), event],
        toolEvents: mergeToolStreamEvents([event], turn.toolEvents || []),
      };
      return next;
    }
    next[idx] = patchForeignTurnRow(turn, ev);
    return next;
  }

  if (ev.type === 'token') {
    const text =
      ev.data && typeof ev.data === 'object' && 'text' in (ev.data as object)
        ? String((ev.data as { text?: unknown }).text ?? '')
        : '';
    turn.text = (turn.text || '') + text;
  } else if (ev.type === 'turn_snapshot') {
    // Server-side text of the in-flight turn so far (replay on (re)subscribe).
    const text =
      ev.data && typeof ev.data === 'object' && 'text' in (ev.data as object)
        ? (ev.data as { text?: unknown }).text
        : undefined;
    if (typeof text === 'string') turn.text = text;
  } else if (ev.type === 'sub_agent_token') {
    // WP23 fix: route sub_agent_token into rawToolStream keyed by parentCallId,
    // NOT into the parent assistant bubble text.
    const raw = [...(turn.rawToolStream || []), { type: ev.type, data: ev.data } as ToolStreamEvent];
    turn.rawToolStream = raw;
    turn.toolEvents = mergeToolStreamEvents(raw);
  } else if (isToolish(ev.type)) {
    const raw = [...(turn.rawToolStream || []), { type: ev.type, data: ev.data } as ToolStreamEvent];
    turn.rawToolStream = raw;
    turn.toolEvents = mergeToolStreamEvents(raw);
  } else if (ev.type === 'paused') {
    const data = (ev.data && typeof ev.data === 'object' ? ev.data : {}) as {
      callId?: string;
      reason?: string;
    };
    if (data.callId) {
      // Mark the existing tool run paused. Do NOT invent a synthetic tool named
      // "tool" — that overwrote schedule_check_back labels as "TOOL pause TOOL".
      const existingName = (turn.toolEvents || []).find((r) => r.id === data.callId)?.tool;
      turn.toolEvents = (turn.toolEvents || []).map((r) =>
        r.id === data.callId ? { ...r, status: 'paused' as const } : r,
      );
      turn.rawToolStream = [
        ...(turn.rawToolStream || []),
        {
          type: 'tool_result',
          data: {
            callId: data.callId,
            status: 'paused',
            ...(existingName ? { name: existingName } : {}),
            ...(data.reason ? { reason: data.reason } : {}),
          },
        },
      ];
    }
  } else if (ev.type === 'usage') {
    const data = (ev.data && typeof ev.data === 'object' ? ev.data : {}) as Record<string, unknown>;
    turn.usage = {
      tokensUsed: typeof data.tokensUsed === 'number' ? data.tokensUsed : undefined,
      maxContextTokens:
        typeof data.maxContextTokens === 'number' ? data.maxContextTokens : undefined,
      costCents: typeof data.costCents === 'number' ? data.costCents : undefined,
      creditsCents: typeof data.creditsCents === 'number' ? data.creditsCents : undefined,
      displayCostMinor:
        typeof data.displayCostMinor === 'number' ? data.displayCostMinor : undefined,
      displayCurrency:
        typeof data.displayCurrency === 'string' && data.displayCurrency.trim()
          ? data.displayCurrency.trim().toUpperCase()
          : undefined,
      billingMode:
        typeof data.billingMode === 'string' && data.billingMode.trim()
          ? data.billingMode.trim()
          : undefined,
      creditsChargedCents:
        typeof data.creditsChargedCents === 'number' ? data.creditsChargedCents : undefined,
      contextSnapshot: data.contextSnapshot,
    };
  } else if (ev.type === 'conversation') {
    const data = (ev.data && typeof ev.data === 'object' ? ev.data : {}) as Record<string, unknown>;
    // New turn marker from ConversationDispatch — drop any stale replay tokens
    // that landed on this empty assistant bubble before generationStart arrived.
    if (data.generationStart === true) {
      turn.text = '';
    }
    if (data.compaction && typeof data.compaction === 'object') {
      const c = data.compaction as Record<string, unknown>;
      turn.compaction = {
        beforeTokens: typeof c.beforeTokens === 'number' ? c.beforeTokens : undefined,
        afterTokens: typeof c.afterTokens === 'number' ? c.afterTokens : undefined,
        summary: typeof c.summary === 'string' ? c.summary : undefined,
      };
    }
  } else if (ev.type === 'error') {
    const data =
      ev.data && typeof ev.data === 'object' ? (ev.data as Record<string, unknown>) : null;
    const msg =
      (typeof ev.data === 'string' && ev.data) ||
      (data && 'message' in data ? String(data.message ?? 'Stream error') : 'Stream error');
    const billing = classifyChatBillingIssue({
      code: data?.code,
      message: msg,
    });
    // Billing issues are rendered by the host BillingIssueWidget — avoid noisy [Error: …] lines.
    if (!billing) {
      turn.text = `${turn.text || ''}\n[Error: ${msg}]`;
    } else if (!(turn.text || '').trim()) {
      turn.text = '';
    }
  } else if (ev.type === 'assistant_final') {
    // Non-streamed continuations (async follow-ups, data-access retry) publish the
    // whole answer at once; streamed turns already hold it via tokens.
    const content =
      ev.data && typeof ev.data === 'object'
        ? (ev.data as { content?: unknown }).content
        : undefined;
    if (typeof content === 'string' && content.trim() && !(turn.text || '').trim()) {
      turn.text = content;
    }
  } else if (ev.type === 'activity') {
    // Session/panel-level; hosts patch session list via subscribeConversationActivity.
    // Intentionally does not mutate assistant turn text.
  }

  next[idx] = turn;
  return next;
}
