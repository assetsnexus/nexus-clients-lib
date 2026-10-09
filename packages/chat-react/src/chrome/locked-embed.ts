import {
  lockedAgentVisibleName,
  resolveDisplayAvatar,
  threadEmptyLabel,
  type LockedAgent,
} from '@nexus/chat-core';

export type ChatFailureInfo = {
  message: string;
  code?: string;
};

/**
 * Locked-embed chrome. Approvals, sub-agents, grants, and the tool timeline
 * stay mounted even when they have nothing to show yet.
 */
export function lockedEmbedPresentation(input: {
  lockedAgent?: Pick<LockedAgent, 'virtualEmployeeId' | 'displayName' | 'avatarUrl'> | null;
  contactName?: string | null;
  contactSelected: boolean;
  /** Server picture used when the host did not set avatarUrl. */
  serverAvatarUrl?: string | null;
  /** Host picture when there is no locked agent object. */
  hostAvatarUrl?: string | null;
  /** Fallback transport is active: do not mount Nexus-only tool surfaces. */
  fallback?: boolean;
}): {
  title: string;
  avatarUrl: string | null;
  empty: string;
  mountApprovals: boolean;
  mountSubagents: boolean;
  mountGrants: boolean;
  mountToolTimeline: boolean;
} {
  const locked = input.lockedAgent?.virtualEmployeeId?.trim() ? input.lockedAgent : null;
  const nexusSurfaces = !input.fallback;
  return {
    title: locked
      ? lockedAgentVisibleName(locked, input.contactName)
      : input.contactName?.trim() || 'Nexus Chat',
    avatarUrl: resolveDisplayAvatar(locked?.avatarUrl || input.hostAvatarUrl, input.serverAvatarUrl),
    empty: threadEmptyLabel({
      lockedAgent: locked,
      contactSelected: input.contactSelected,
    }),
    mountApprovals: nexusSurfaces,
    mountSubagents: nexusSurfaces,
    mountGrants: nexusSurfaces,
    mountToolTimeline: nexusSurfaces,
  };
}

export function chatFailureInfo(err: unknown): ChatFailureInfo {
  if (err instanceof Error) {
    const code =
      'code' in err && typeof (err as { code?: unknown }).code === 'string'
        ? (err as { code: string }).code
        : undefined;
    return { message: err.message.trim() || 'Chat request failed.', code };
  }
  if (err && typeof err === 'object') {
    const row = err as { message?: unknown; code?: unknown };
    const message = typeof row.message === 'string' ? row.message.trim() : '';
    const code = typeof row.code === 'string' && row.code.trim() ? row.code.trim() : undefined;
    return { message: message || 'Chat request failed.', code };
  }
  return { message: 'Chat request failed.' };
}
