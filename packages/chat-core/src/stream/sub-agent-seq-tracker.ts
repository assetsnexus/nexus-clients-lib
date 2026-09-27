/**
 * Per-conversation high-water mark of applied side-effect frames: `sub_agent_*`
 * and approval requests.
 *
 * Sub-agent events append to the owning turn's raw stream (not idempotent) and
 * approval requests open a prompt, while every new socket replays the Redis
 * buffer. When the idle observer hands over to a live attach / send socket (or
 * reconnects), the replay would duplicate child tool calls or re-prompt. Token /
 * turn_snapshot replay is handled by the attach path and must not be skipped.
 *
 * The server replay buffer lives ~120s while the seq counter expires after a
 * day idle, so marks older than `ttlMs` are forgotten — a restarted counter
 * must never make fresh frames look already applied.
 */
export const SUB_AGENT_SEQ_MARK_TTL_MS = 10 * 60 * 1000;

export class SubAgentSeqTracker {
  private readonly applied = new Map<string, { high: number; at: number }>();

  constructor(
    private readonly ttlMs = SUB_AGENT_SEQ_MARK_TTL_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private mark(conversationId: string): { high: number; at: number } | null {
    const mark = this.applied.get(conversationId);
    if (!mark) return null;
    if (this.now() - mark.at > this.ttlMs) {
      this.applied.delete(conversationId);
      return null;
    }
    return mark;
  }

  static isTracked(type: string): boolean {
    return (
      type.startsWith('sub_agent_') ||
      type === 'permission_elevation_request' ||
      type === 'data_access_approval_request'
    );
  }

  static seqOf(ev: unknown): number | null {
    if (!ev || typeof ev !== 'object') return null;
    const seq = (ev as { seq?: unknown }).seq;
    return typeof seq === 'number' && Number.isFinite(seq) && seq > 0 ? seq : null;
  }

  /** True when this frame was already applied by another socket. Frames without seq are never skipped. */
  alreadyApplied(conversationId: string | null | undefined, ev: { type: string }): boolean {
    if (!conversationId || !SubAgentSeqTracker.isTracked(ev.type)) return false;
    const seq = SubAgentSeqTracker.seqOf(ev);
    if (seq == null) return false;
    const mark = this.mark(conversationId);
    return mark != null && seq <= mark.high;
  }

  record(conversationId: string | null | undefined, ev: { type: string }): void {
    if (!conversationId || !SubAgentSeqTracker.isTracked(ev.type)) return;
    const seq = SubAgentSeqTracker.seqOf(ev);
    if (seq == null) return;
    const high = this.mark(conversationId)?.high ?? 0;
    this.applied.set(conversationId, { high: Math.max(high, seq), at: this.now() });
  }

  /** Drop state when turns are rebuilt from history (rows no longer carry the old raw stream). */
  reset(conversationId?: string | null): void {
    if (conversationId) this.applied.delete(conversationId);
    else this.applied.clear();
  }
}
