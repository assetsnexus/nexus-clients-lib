/**
 * Pending-pause contract shared by every chat adapter (React, Vue2, Vue3, app
 * webview). A turn can pause on three rails, discriminated by `kind`:
 *
 * - `client_tool` — the original browser/portal tool request (a `page.*` /
 *   `anx.page.*` schema the model called, whose handler lives in the client).
 * - `approval`   — a Plan-mode `business_write` / `external_send` command the
 *   model forced: the user gets a one-click preview card, and an approve mints
 *   the server-side execution marker.
 * - `mode_switch`— a `request_mode_switch` proposal from the agent.
 *
 * The shapes mirror the inference `ChatPendingPauseService` payloads exactly so
 * a host card can render without guessing which server it talks to.
 *
 * @module tools/pending-pause
 */

/** Which rail a paused turn is on. Older servers omit it → `client_tool`. */
export type PendingPauseKind = 'client_tool' | 'approval' | 'mode_switch';

/** Access a client tool needs. `read` runs directly; `write` pauses in Plan. */
export type ClientToolAccess = 'read' | 'write';

/** `approval_request` stream payload → host card. */
export type PendingApprovalCard = {
  callId: string;
  kind: 'approval';
  name: string;
  /** The `anx.*` command the model tried to force. */
  command: string;
  arguments: Record<string, unknown>;
  /** Layer-2 mutation class that made it a gated write (`business_write`, …). */
  mutationClass: string | null;
  /** Mode the call was attempted in. */
  mode: string | null;
  /** Region-built preview (diff / payload); opaque to the SDK. */
  preview: unknown;
};

/** `mode_switch_request` stream payload → host card. */
export type PendingModeSwitchCard = {
  callId: string;
  kind: 'mode_switch';
  from: string | null;
  to: string | null;
  reason: string | null;
  /** Plan file/row the agent proposes to switch into, when the target is Plan. */
  planRef: string | null;
};

/** `client_tool_request` stream payload → host card (existing rail, now typed). */
export type PendingClientToolCard = {
  callId: string;
  kind: 'client_tool';
  name: string;
  arguments: Record<string, unknown>;
  /** Defaults to `write`. */
  access: ClientToolAccess;
  /** True → the client shows the one-click approval card before running the handler. */
  requiresApproval: boolean;
  /** `request` runs the handler; `bind` asks for the full schema of a discoverable tool. */
  action: 'request' | 'bind';
};

export type PendingPauseCard =
  | PendingClientToolCard
  | PendingApprovalCard
  | PendingModeSwitchCard;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/** Narrow a raw stream payload to a known pause kind, defaulting to `client_tool`. */
export function normalizePendingPauseKind(raw: unknown): PendingPauseKind {
  return raw === 'approval' || raw === 'mode_switch' ? raw : 'client_tool';
}

/** Normalise a declared access, defaulting to `write` (the safe default). */
export function normalizeClientToolAccess(raw: unknown): ClientToolAccess {
  return raw === 'read' ? 'read' : 'write';
}

/**
 * Parse an `approval_request` payload into its card. Returns null when the
 * payload is malformed (no callId), so a host never renders an empty card.
 */
export function parsePendingApprovalCard(data: unknown): PendingApprovalCard | null {
  const d = asRecord(data);
  if (!d) return null;
  const callId = str(d.callId);
  if (!callId) return null;
  return {
    callId,
    kind: 'approval',
    name: str(d.name) ?? str(d.command) ?? 'action',
    command: str(d.command) ?? str(d.name) ?? 'action',
    arguments: asRecord(d.arguments) ?? {},
    mutationClass: str(d.mutationClass),
    mode: str(d.mode),
    preview: d.preview ?? null,
  };
}

/** Parse a `mode_switch_request` payload into its card. */
export function parsePendingModeSwitchCard(data: unknown): PendingModeSwitchCard | null {
  const d = asRecord(data);
  if (!d) return null;
  const callId = str(d.callId);
  if (!callId) return null;
  return {
    callId,
    kind: 'mode_switch',
    from: str(d.from),
    to: str(d.to),
    reason: str(d.reason),
    planRef: str(d.planRef),
  };
}

/** Parse a `client_tool_request` payload into its card. */
export function parsePendingClientToolCard(data: unknown): PendingClientToolCard | null {
  const d = asRecord(data);
  if (!d) return null;
  const callId = str(d.callId);
  const name = str(d.name);
  if (!callId || !name) return null;
  return {
    callId,
    kind: 'client_tool',
    name,
    arguments: asRecord(d.arguments) ?? {},
    access: normalizeClientToolAccess(d.access),
    requiresApproval: d.requiresApproval === true,
    action: d.action === 'bind' ? 'bind' : 'request',
  };
}

/**
 * Parse any pending-pause payload by its stream event type. The event name is
 * authoritative (a payload cannot claim a different rail than the one the
 * server emitted), so `kind` in the payload is ignored.
 */
export function parsePendingPauseCard(
  eventType: string,
  data: unknown,
): PendingPauseCard | null {
  if (eventType === 'approval_request') return parsePendingApprovalCard(data);
  if (eventType === 'mode_switch_request') return parsePendingModeSwitchCard(data);
  if (eventType === 'client_tool_request') return parsePendingClientToolCard(data);
  return null;
}

/**
 * Resume decision a host submits over `anx.communicate.client-tool.result`,
 * normalised off the shared rail payload. Mirrors the server
 * `ChatPendingPauseService.normalizeDecision`.
 *
 * - `client_tool`: the handler result itself is the payload (not a decision).
 * - `approval`: `{ approved, switchToMode? }`.
 * - `mode_switch`: `{ approved, to? }`.
 */
export function normalizePendingResumeDecision(
  kind: PendingPauseKind,
  result: unknown,
): { approved: boolean; to: string | null; switchToMode: string | null } {
  const r = asRecord(result) ?? {};
  const approved = r.approved === true;
  const to = r.to === 'plan' || r.to === 'agent' || r.to === 'ask' ? r.to : null;
  const switchToMode =
    r.switchToMode === 'agent' || r.switchToMode === 'plan' || r.switchToMode === 'ask'
      ? r.switchToMode
      : null;
  if (kind === 'mode_switch') return { approved, to, switchToMode: null };
  if (kind === 'approval') return { approved, to: null, switchToMode };
  return { approved, to: null, switchToMode: null };
}
