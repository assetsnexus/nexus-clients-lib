import type { ChatHooks } from '../types.js';

export type PermissionElevationInfo = Parameters<
  NonNullable<ChatHooks['onPermissionElevationRequired']>
>[0];

export function elevationCommandNames(elev: {
  command?: string | null;
  commandNames?: string[];
  resume?: { command?: string };
}): string[] {
  const names = Array.isArray(elev.commandNames)
    ? elev.commandNames.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    : [];
  const single =
    (typeof elev.command === 'string' && elev.command.trim()) ||
    (typeof elev.resume?.command === 'string' && elev.resume.command.trim()) ||
    '';
  if (single && !names.includes(single)) names.unshift(single);
  return names;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** `permission_elevation_request` stream payload → host hook info. */
export function permissionElevationInfoFromEvent(data: unknown): PermissionElevationInfo {
  const elev = (data && typeof data === 'object' ? data : {}) as Record<string, unknown> & {
    commandNames?: string[];
    resume?: { command?: string };
  };
  const runId = str(elev.runId) ?? str(elev.subAgentRunId);
  return {
    elevationId: str(elev.elevationId),
    pack: str(elev.pack),
    command: str(elev.command),
    commandNames: elevationCommandNames(elev as Parameters<typeof elevationCommandNames>[0]),
    callId: str(elev.callId),
    resourceRef:
      elev.resourceRef && typeof elev.resourceRef === 'object'
        ? (elev.resourceRef as Record<string, unknown>)
        : null,
    reason: str(elev.reason),
    requiredOnboardingType: str(elev.requiredOnboardingType),
    onboardingSatisfied:
      typeof elev.onboardingSatisfied === 'boolean' ? elev.onboardingSatisfied : undefined,
    runId,
    subAgentRunId: str(elev.subAgentRunId) ?? runId,
    linkedConversationId: str(elev.linkedConversationId),
    parentConversationId: str(elev.parentConversationId) ?? str(elev.conversationId),
  };
}

/**
 * A background sub-agent paused — the parent turn is *not* paused, so the
 * parent's live socket / streaming chrome must stay untouched.
 */
export function isSubAgentApprovalEvent(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return Boolean(str(d.subAgentRunId));
}
