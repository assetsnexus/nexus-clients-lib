/**
 * Per-conversation set of permission-elevation ids already surfaced to the host.
 *
 * The backend emits TWO frames for one elevation pause — a `tool_result` carrying
 * `{ needsApproval: true, approvalKind: 'permission_elevation', elevationId }` and
 * a `permission_elevation_request` — and a reconnecting socket (retry send, live
 * attach, idle sub-agent observer) replays both from the Redis buffer. Only
 * `permission_elevation_request` is seq-deduped (`SubAgentSeqTracker.isTracked`);
 * the `tool_result` is not a tracked type, so the replayed copy re-fired
 * `onPermissionElevationRequired` for an elevation the user had already answered —
 * the prompt came back after "Allow always".
 *
 * Elevation ids are unique per request, and the gate only reuses a pending id when
 * the elevation is genuinely still unresolved (same conversation + VE + pack +
 * resourceRef). So surfacing each id at most once per conversation removes the
 * duplicate without ever suppressing a new request.
 *
 * The authoritative re-show path is `anx.ai-agents.elevations.list` (host filters
 * `status === 'pending'`); this tracker only guards the event-driven path and is
 * therefore deliberately NOT cleared by `rehydrateTurns`.
 */
export const ELEVATION_PROMPT_TTL_MS = 60 * 60 * 1000;

function normalizeId(elevationId: string | null | undefined): string | null {
  const id = typeof elevationId === 'string' ? elevationId.trim() : '';
  return id.length > 0 ? id : null;
}

export class ElevationPromptTracker {
  private readonly raised = new Map<string, { ids: Set<string>; at: number }>();

  constructor(
    private readonly ttlMs = ELEVATION_PROMPT_TTL_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private bucket(conversationId: string): { ids: Set<string>; at: number } | null {
    const entry = this.raised.get(conversationId);
    if (!entry) return null;
    if (this.now() - entry.at > this.ttlMs) {
      this.raised.delete(conversationId);
      return null;
    }
    return entry;
  }

  hasRaised(conversationId: string | null | undefined, elevationId: string | null | undefined): boolean {
    const id = normalizeId(elevationId);
    if (!conversationId || !id) return false;
    const bucket = this.bucket(conversationId);
    return bucket != null && bucket.ids.has(id);
  }

  markRaised(conversationId: string | null | undefined, elevationId: string | null | undefined): void {
    const id = normalizeId(elevationId);
    if (!conversationId || !id) return;
    const bucket = this.bucket(conversationId);
    if (bucket) {
      bucket.ids.add(id);
      bucket.at = this.now();
      return;
    }
    this.raised.set(conversationId, { ids: new Set([id]), at: this.now() });
  }

  /**
   * True the first time this elevation id is seen for the conversation (and
   * records it). A frame without an id can never be deduped, so it always passes.
   */
  shouldRaise(conversationId: string | null | undefined, elevationId: string | null | undefined): boolean {
    const id = normalizeId(elevationId);
    if (!conversationId || !id) return true;
    if (this.hasRaised(conversationId, id)) return false;
    this.markRaised(conversationId, id);
    return true;
  }

  /** Drop state for one conversation (or all) — used when the chat is torn down. */
  forget(conversationId?: string | null): void {
    if (conversationId) this.raised.delete(conversationId);
    else this.raised.clear();
  }
}
