import type { CommandClient } from '../index.js';
import type { StreamEndpointResolver } from '../stream/stream-endpoint-resolver.js';
import { parseStreamMessage, type StreamEvent } from '../stream/stream-events.js';
import { mapConversationListItem, type ChatSessionSummary } from './session-summary.js';

export type ActivityEventData = {
  conversationId: string;
  kind?: 'sub_agent' | 'generation' | 'unread' | string;
  activeSubAgentCount?: number;
  backgroundSubAgentCompleted?: boolean;
  generationInProgress?: boolean;
  unreadDelta?: number;
  unreadCount?: number;
  runId?: string;
  linkedConversationId?: string | null;
  status?: string;
  title?: string | null;
};

export type ActivityEvent = {
  type: 'activity' | `sub_agent_${string}` | string;
  data: ActivityEventData;
};

export type ActivityConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export type ActivitySubscribeOptions = {
  client: CommandClient;
  streamResolver: StreamEndpointResolver;
  /**
   * True when any open panel already holds a live conversation/room WebSocket.
   * When true, list polling is skipped (events arrive on that socket / inbox).
   */
  isLiveConnected?: () => boolean;
  onEvent: (ev: ActivityEvent | StreamEvent) => void;
  /** Optional full session refresh when list poll runs (disconnected fallback only). */
  onSessions?: (sessions: ChatSessionSummary[]) => void;
  onConnectionStatus?: (status: ActivityConnectionStatus) => void;
  pollIntervalMs?: number;
  signal?: AbortSignal;
};

function unwrapData(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object') return {};
  const r = result as Record<string, unknown>;
  if (r.data && typeof r.data === 'object') return r.data as Record<string, unknown>;
  if (r.responseObject && typeof r.responseObject === 'object') {
    return r.responseObject as Record<string, unknown>;
  }
  return r;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function toActivityEvent(
  parsed: StreamEvent,
  fallbackConversationId?: string,
): ActivityEvent | null {
  if (
    parsed.type !== 'activity' &&
    !parsed.type.startsWith('sub_agent_') &&
    parsed.type !== 'done' &&
    parsed.type !== 'complete' &&
    parsed.type !== 'finished' &&
    parsed.type !== 'error' &&
    parsed.type !== 'conversation'
  ) {
    return null;
  }
  const data =
    parsed.data && typeof parsed.data === 'object'
      ? (parsed.data as Record<string, unknown>)
      : {};
  const conversationId =
    typeof data.conversationId === 'string'
      ? data.conversationId
      : fallbackConversationId || '';
  if (!conversationId && parsed.type !== 'ready') return null;
  return {
    type: parsed.type,
    data: {
      conversationId,
      kind: typeof data.kind === 'string' ? data.kind : undefined,
      activeSubAgentCount:
        typeof data.activeSubAgentCount === 'number' ? data.activeSubAgentCount : undefined,
      backgroundSubAgentCompleted:
        typeof data.backgroundSubAgentCompleted === 'boolean'
          ? data.backgroundSubAgentCompleted
          : undefined,
      generationInProgress:
        typeof data.generationInProgress === 'boolean'
          ? data.generationInProgress
          : typeof data.isStreaming === 'boolean'
            ? data.isStreaming
            : parsed.type === 'conversation' &&
                data.generationStart === true
              ? true
              : parsed.type === 'done' ||
                  parsed.type === 'complete' ||
                  parsed.type === 'finished'
                ? false
                : undefined,
      unreadDelta: typeof data.unreadDelta === 'number' ? data.unreadDelta : undefined,
      unreadCount: typeof data.unreadCount === 'number' ? data.unreadCount : undefined,
      runId:
        typeof data.runId === 'string'
          ? data.runId
          : typeof data.subAgentRunId === 'string'
            ? data.subAgentRunId
            : undefined,
      linkedConversationId:
        data.linkedConversationId != null ? String(data.linkedConversationId) : null,
      status: typeof data.status === 'string' ? data.status : undefined,
      title: typeof data.title === 'string' ? data.title : null,
    },
  };
}

/**
 * Keep the session list warm while the chat panel is open:
 * one shared user-inbox WebSocket for push (conversation start / generation /
 * unread), with rare list-poll fallback only when no live socket is connected.
 *
 * Does **not** open per-conversation WebSockets (panel chat owns those; voice
 * keeps its own dedicated sockets).
 */
export function subscribeConversationActivity(opts: ActivitySubscribeOptions): () => void {
  let stopped = false;
  let inboxSocket: WebSocket | null = null;
  let inboxConnected = false;
  let status: ActivityConnectionStatus = 'disconnected';
  const pollIntervalMs = Math.max(10_000, opts.pollIntervalMs ?? 30_000);

  const setStatus = (next: ActivityConnectionStatus) => {
    if (status === next) return;
    status = next;
    opts.onConnectionStatus?.(next);
  };

  const closeInbox = () => {
    inboxConnected = false;
    if (!inboxSocket) return;
    try {
      inboxSocket.close();
    } catch {
      /* ignore */
    }
    inboxSocket = null;
  };

  const ensureInboxSocket = async () => {
    if (stopped || inboxConnected || inboxSocket) return;
    setStatus('connecting');
    try {
      const result = await opts.client.send('anx.communicate.stream-init', { inbox: true });
      if (result && typeof result === 'object' && 'ok' in result && (result as { ok: boolean }).ok === false) {
        setStatus(opts.isLiveConnected?.() ? 'connected' : 'error');
        return;
      }
      const payload = unwrapData(result);
      opts.streamResolver.setFromStreamInit(payload || {});
      if (!opts.streamResolver.getOrderedEndpoints().length) {
        setStatus(opts.isLiveConnected?.() ? 'connected' : 'disconnected');
        return;
      }
      const ws = await opts.streamResolver.connectWebSocket({
        onOpen: () => {
          inboxConnected = true;
          setStatus('connected');
        },
        onMessage: (ev) => {
          const parsed = parseStreamMessage(ev.data);
          if (!parsed) return;
          if (parsed.type === 'ready') {
            inboxConnected = true;
            setStatus('connected');
            return;
          }
          const activity = toActivityEvent(parsed);
          if (activity) opts.onEvent(activity);
        },
        onError: () => {
          inboxConnected = false;
          setStatus('error');
        },
        onClose: () => {
          inboxConnected = false;
          inboxSocket = null;
          if (!stopped) {
            setStatus(opts.isLiveConnected?.() ? 'connected' : 'disconnected');
          }
        },
      });
      inboxSocket = ws as unknown as WebSocket;
      // connectWebSocket resolves on open; mark connected if handlers raced.
      if ((ws as WebSocket).readyState === WebSocket.OPEN) {
        inboxConnected = true;
        setStatus('connected');
      }
    } catch {
      closeInbox();
      setStatus(opts.isLiveConnected?.() ? 'connected' : 'error');
    }
  };

  const pollList = async () => {
    if (stopped) return;
    try {
      const result = await opts.client.send('anx.communicate.conversations.list', {
        limit: 50,
        status: 'active',
      });
      const data = unwrapData(result);
      const rows = Array.isArray(data.conversations)
        ? (data.conversations as Record<string, unknown>[])
        : Array.isArray(data.items)
          ? (data.items as Record<string, unknown>[])
          : [];
      const sessions = rows
        .map((row) => mapConversationListItem(row))
        .filter(Boolean) as ChatSessionSummary[];
      opts.onSessions?.(sessions);
      for (const s of sessions) {
        if (s.activeSubAgentCount > 0 || s.generationInProgress || s.backgroundSubAgentCompleted) {
          opts.onEvent({
            type: 'activity',
            data: {
              conversationId: s.conversationId,
              kind: 'sub_agent',
              activeSubAgentCount: s.activeSubAgentCount,
              backgroundSubAgentCompleted: s.backgroundSubAgentCompleted,
              generationInProgress: s.generationInProgress,
              unreadCount: s.unreadCount,
              runId: s.subAgentRunId || undefined,
            },
          });
        }
      }
    } catch {
      /* ignore poll errors */
    }
  };

  const hasAnyLiveSocket = () => inboxConnected || Boolean(opts.isLiveConnected?.());

  const loop = async () => {
    // One bootstrap list fetch so the sidebar has rows before inbox events.
    await pollList();
    while (!stopped) {
      try {
        await ensureInboxSocket();
        if (hasAnyLiveSocket()) {
          if (opts.isLiveConnected?.() && !inboxConnected) {
            setStatus('connected');
          }
          // Live path: backend pushes activity / panel stream; do not spam list.
        } else {
          await pollList();
        }
        await sleep(pollIntervalMs, opts.signal);
      } catch {
        break;
      }
    }
  };

  void loop();

  if (opts.signal) {
    opts.signal.addEventListener(
      'abort',
      () => {
        stopped = true;
        closeInbox();
        setStatus('disconnected');
      },
      { once: true },
    );
  }

  return () => {
    stopped = true;
    closeInbox();
    setStatus('disconnected');
  };
}
