import type { ActivityConnectionStatus } from '../session/activity-subscribe.js';

/**
 * Presence dot used by the portal session list (`SessionList.presenceStatus`).
 * A connected activity socket, or a live conversation stream (the activity
 * subscriber reports that as connected), means the agent is online.
 * Owner-disabled and asset edge presence are different states.
 */
export type SessionListPresence =
  | 'online'
  | 'connecting'
  | 'offline'
  | 'error'
  | 'disabled'
  | 'edge-online'
  | 'edge-offline'
  | 'registry-offline-edge-online'
  | 'both-offline';

const ASSET_PRESENCE = new Set<SessionListPresence>([
  'edge-online',
  'edge-offline',
  'registry-offline-edge-online',
  'both-offline',
]);

export function sessionListPresence(input: {
  contactStatus?: string | null;
  agentContactStatus?: string | null;
  assetPresence?: string | null;
  activityConnectionStatus?: ActivityConnectionStatus | null;
  /** Open conversation WebSocket. Folded into `connected` by the activity subscriber. */
  liveStreamConnected?: boolean;
}): SessionListPresence {
  if (input.contactStatus === 'disabled' || input.agentContactStatus === 'disabled') return 'disabled';
  const asset = typeof input.assetPresence === 'string' ? input.assetPresence.trim() : '';
  if (asset && ASSET_PRESENCE.has(asset as SessionListPresence)) return asset as SessionListPresence;
  if (input.liveStreamConnected || input.activityConnectionStatus === 'connected') return 'online';
  if (input.activityConnectionStatus === 'error') return 'error';
  if (input.activityConnectionStatus === 'connecting') return 'connecting';
  return 'offline';
}

const UNREACHABLE_LABEL = /could not be reached|try again shortly/i;

export function isUnreachableLabel(message: string | null | undefined): boolean {
  return UNREACHABLE_LABEL.test(typeof message === 'string' ? message : '');
}

export function isGrantFailureCode(code: string | null | undefined): boolean {
  return code === 'NO_NEXUS_GRANT' || code === 'NEEDS_NEXUS_LOGIN' || code === 'NEEDS_RELOGIN';
}

/**
 * Sticky host flags are not the online check. The unreachable sentence is
 * false while the session list would show online, and it clears when a Nexus
 * assistant reply was delivered. A fallback reply must not clear it.
 */
export function unreachableLabelVisible(input: {
  presence: SessionListPresence;
  nexusReplyDelivered: boolean;
  message?: string | null;
}): boolean {
  if (input.nexusReplyDelivered || input.presence === 'online' || input.presence === 'disabled') return false;
  return isUnreachableLabel(input.message);
}

export function reduceReachLatch(
  prev: boolean,
  event:
    | { type: 'nexus_reply' }
    | { type: 'fallback_reply' }
    | { type: 'transport_failure'; liveStreamConnected: boolean },
): boolean {
  if (event.type === 'nexus_reply') return true;
  if (event.type === 'fallback_reply') return prev;
  if (event.type === 'transport_failure' && !event.liveStreamConnected) return false;
  return prev;
}

export function outgoingQueueBannerText(input: {
  count: number;
  lastError?: string | null;
  presence: SessionListPresence;
  nexusReplyDelivered: boolean;
}): string {
  if (input.count < 1) return '';
  const label = input.count === 1 ? '1 queued message' : `${input.count} queued messages`;
  const err = typeof input.lastError === 'string' ? input.lastError.replace(/\s+/g, ' ').trim() : '';
  if (!err) return label;
  if (!unreachableLabelVisible({ presence: input.presence, nexusReplyDelivered: input.nexusReplyDelivered, message: err })) {
    if (isUnreachableLabel(err)) return label;
  }
  return `${label} — ${err}`;
}

/** One automatic flush when the path is actually up. Not a timer. */
export function shouldAutoFlushOutgoing(input: {
  pending: number;
  streaming: boolean;
  presence: SessionListPresence;
  nexusReplyDelivered: boolean;
  flushAttempted: boolean;
}): boolean {
  if (input.pending < 1 || input.streaming || input.flushAttempted) return false;
  return input.presence === 'online' || input.nexusReplyDelivered;
}

/**
 * Session banner after a command error. Grant copy stays. The unreachable
 * sentence is dropped when the session list would show the agent online or a
 * Nexus reply already proved the path.
 */
export function sessionErrorAfterFailure(input: {
  current: string | null;
  message: string;
  code?: string | null;
  presence: SessionListPresence;
  nexusReplyDelivered: boolean;
}): string | null {
  if (isGrantFailureCode(input.code)) return input.message;
  // The queue banner owns this sentence. A session banner would stick while the
  // live stream is already delivering the reply.
  if (isUnreachableLabel(input.message)) {
    return input.current && !isUnreachableLabel(input.current) ? input.current : null;
  }
  if (
    (input.presence === 'online' || input.nexusReplyDelivered) &&
    input.current &&
    isUnreachableLabel(input.current)
  ) {
    return null;
  }
  const message = input.message.trim();
  return message || input.current;
}

/**
 * Do not skip the send because the host flag is set.
 * That flag also covers a missing grant, and `connecting` is not a failed
 * transport. Queue only after `sendMessage` returns a retryable transport error.
 */
export function shouldHoldOutgoingForNexus(input: {
  hostUnavailable: boolean;
  presence: SessionListPresence;
  nexusReplyDelivered: boolean;
}): boolean {
  void input;
  return false;
}
