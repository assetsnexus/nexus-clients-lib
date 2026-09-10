import type { ChatTurn } from '../state.js';
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

/**
 * Apply one stream event onto the assistant turn (tokens, tools, usage, compaction, pause).
 */
export function applyStreamEventToTurns(
  turns: ChatTurn[],
  assistantTurnId: string,
  ev: StreamEvent,
): ChatTurn[] {
  const idx = turns.findIndex((t) => t.id === assistantTurnId);
  if (idx < 0) return turns;
  const turn = { ...turns[idx] };
  const next = [...turns];

  if (ev.type === 'token') {
    const text =
      ev.data && typeof ev.data === 'object' && 'text' in (ev.data as object)
        ? String((ev.data as { text?: unknown }).text ?? '')
        : '';
    turn.text = (turn.text || '') + text;
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
    };
    if (data.callId) {
      const raw = [
        ...(turn.rawToolStream || []),
        { type: 'tool_result', data: { callId: data.callId, status: 'paused', name: 'tool' } },
      ];
      turn.rawToolStream = raw;
      turn.toolEvents = mergeToolStreamEvents(raw).map((r) =>
        r.id === data.callId ? { ...r, status: 'paused' as const } : r,
      );
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
  }

  next[idx] = turn;
  return next;
}
