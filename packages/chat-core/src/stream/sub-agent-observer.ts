import type { StreamEvent } from './stream-events.js';
import { parseStreamMessage } from './stream-events.js';

/**
 * Idle-parent observer: while background sub-agents of the open conversation
 * are live and no send / live-attach socket is open, keep a lightweight stream
 * subscription so the parent chat still receives
 *  - `sub_agent_*` progress (widget live output + child tool calls),
 *  - sub-agent approval requests (`permission_elevation_request`, …),
 *  - `generationStart` of a follow-up turn (handed to the live-attach path).
 *
 * It never creates an assistant turn or touches streaming chrome. The primary
 * socket always wins: the controller calls `suspend()` before connecting one
 * and `ensure()` after it closes.
 */

export interface ObserverSocket {
  close(): void;
}

export interface SubAgentObserverDeps {
  /** stream-init for the conversation (refreshes endpoints); false when unavailable. */
  prepare(conversationId: string): Promise<boolean>;
  connect(handlers: {
    onMessage: (ev: MessageEvent) => void;
    onClose: () => void;
  }): Promise<ObserverSocket | null>;
  /** Primary socket closed, same conversation still open, not streaming. */
  canObserve(conversationId: string): boolean;
  onEvent(conversationId: string, event: StreamEvent): void;
  onGenerationStart(conversationId: string): void;
  logger?: {
    debug?: (msg: string, extra?: Record<string, unknown>) => void;
    warn?: (msg: string, extra?: Record<string, unknown>) => void;
  };
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export const SUB_AGENT_OBSERVER_RECONNECT_BASE_MS = 1_000;
export const SUB_AGENT_OBSERVER_RECONNECT_MAX_MS = 30_000;
export const SUB_AGENT_OBSERVER_MAX_RECONNECTS = 8;

const OBSERVED_TYPES = new Set([
  'permission_elevation_request',
  'data_access_approval_request',
  'activity',
]);

export function isObservedEventType(type: string): boolean {
  return type.startsWith('sub_agent_') || OBSERVED_TYPES.has(type);
}

function isGenerationStart(ev: StreamEvent): boolean {
  return (
    ev.type === 'conversation' &&
    !!ev.data &&
    typeof ev.data === 'object' &&
    (ev.data as { generationStart?: unknown }).generationStart === true
  );
}

export class SubAgentObserver {
  private target: string | null = null;
  private socket: ObserverSocket | null = null;
  private socketConversationId: string | null = null;
  private connecting = false;
  /** Bumped on every suspend/stop so stale connects discard themselves. */
  private generation = 0;
  private reconnectAttempts = 0;
  private reconnectTimer: unknown = null;

  constructor(private readonly deps: SubAgentObserverDeps) {}

  get observing(): string | null {
    return this.socket ? this.socketConversationId : null;
  }

  get targetConversationId(): string | null {
    return this.target;
  }

  /** Desired conversation (null stops). Idempotent. */
  setTarget(conversationId: string | null): void {
    const next = conversationId ? String(conversationId).trim() || null : null;
    if (next !== this.target) {
      this.target = next;
      this.reconnectAttempts = 0;
      this.closeSocket('retarget');
    }
    if (next) void this.ensure();
  }

  stop(): void {
    this.target = null;
    this.closeSocket('stop');
  }

  /** Primary socket is taking over; keep the target so `ensure()` can resume. */
  suspend(): void {
    this.closeSocket('suspend');
  }

  async ensure(): Promise<void> {
    const conversationId = this.target;
    if (!conversationId) return;
    if (!this.deps.canObserve(conversationId)) {
      this.closeSocket('primary_active');
      return;
    }
    if (this.socket || this.connecting) return;
    this.connecting = true;
    const gen = ++this.generation;
    try {
      const ready = await this.deps.prepare(conversationId);
      if (!ready || gen !== this.generation || !this.stillWanted(conversationId)) return;
      const socket = await this.deps.connect({
        onMessage: (ev) => this.handleFrame(conversationId, gen, ev),
        onClose: () => this.handleClose(conversationId, gen),
      });
      if (!socket) {
        this.deps.logger?.warn?.('sub_agent_observer_connect_failed', { conversationId });
        this.scheduleReconnect(conversationId);
        return;
      }
      if (gen !== this.generation || !this.stillWanted(conversationId)) {
        safeClose(socket);
        return;
      }
      this.socket = socket;
      this.socketConversationId = conversationId;
      this.deps.logger?.debug?.('sub_agent_observer_open', { conversationId });
    } catch (err) {
      this.deps.logger?.warn?.('sub_agent_observer_error', { conversationId, message: String(err) });
      if (gen === this.generation) this.scheduleReconnect(conversationId);
    } finally {
      if (gen === this.generation) this.connecting = false;
    }
  }

  private stillWanted(conversationId: string): boolean {
    return this.target === conversationId && this.deps.canObserve(conversationId);
  }

  private handleFrame(conversationId: string, gen: number, ev: MessageEvent): void {
    if (gen !== this.generation) return;
    const parsed = parseStreamMessage(ev.data);
    if (!parsed) return;
    this.reconnectAttempts = 0;
    if (isGenerationStart(parsed)) {
      this.deps.logger?.debug?.('sub_agent_observer_generation_start', { conversationId });
      this.suspend();
      this.deps.onGenerationStart(conversationId);
      return;
    }
    if (!isObservedEventType(parsed.type)) return;
    try {
      this.deps.onEvent(conversationId, parsed);
    } catch (err) {
      this.deps.logger?.warn?.('sub_agent_observer_apply_failed', {
        conversationId,
        type: parsed.type,
        message: String(err),
      });
    }
  }

  private handleClose(conversationId: string, gen: number): void {
    if (gen !== this.generation) return;
    this.socket = null;
    this.socketConversationId = null;
    this.connecting = false;
    this.deps.logger?.debug?.('sub_agent_observer_closed', { conversationId });
    this.scheduleReconnect(conversationId);
  }

  private scheduleReconnect(conversationId: string): void {
    if (this.target !== conversationId || this.reconnectTimer) return;
    if (this.reconnectAttempts >= SUB_AGENT_OBSERVER_MAX_RECONNECTS) {
      this.deps.logger?.warn?.('sub_agent_observer_gave_up', { conversationId });
      return;
    }
    const delay = Math.min(
      SUB_AGENT_OBSERVER_RECONNECT_BASE_MS * 2 ** this.reconnectAttempts,
      SUB_AGENT_OBSERVER_RECONNECT_MAX_MS,
    );
    this.reconnectAttempts += 1;
    const setTimer = this.deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.reconnectTimer = setTimer(() => {
      this.reconnectTimer = null;
      this.connecting = false;
      void this.ensure();
    }, delay);
  }

  private closeSocket(reason: string): void {
    this.generation += 1;
    this.connecting = false;
    if (this.reconnectTimer) {
      const clearTimer = this.deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
      clearTimer(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (!this.socket) return;
    const conversationId = this.socketConversationId;
    safeClose(this.socket);
    this.socket = null;
    this.socketConversationId = null;
    this.deps.logger?.debug?.('sub_agent_observer_close', { conversationId, reason });
  }
}

function safeClose(socket: ObserverSocket): void {
  try {
    socket.close();
  } catch {
    /* ignore */
  }
}
