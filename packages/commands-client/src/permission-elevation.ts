export type PermissionElevationPrompt = {
  elevationId: string | null;
  /** App elevation id from R5 (`elevationRequestId`). Falls back to `elevationId`. */
  elevationRequestId: string | null;
  /** Portal path the user opens to approve the batch. Relative, as the region sends it. */
  approvalUrl: string | null;
  pack: string | null;
  command: string | null;
  commandNames: string[];
  resourceRef: Record<string, unknown> | null;
  reason: string;
  requiredOnboardingType: string | null;
  onboardingSatisfied: boolean;
  message: string;
};

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((c): c is string => typeof c === 'string' && c.trim().length > 0);
}

export function mapPermissionElevationError(
  errorObject: { code?: string; message?: string; details?: Record<string, any> } | null | undefined,
): PermissionElevationPrompt | null {
  if (!errorObject || errorObject.code !== 'PERMISSION_ELEVATION_REQUIRED') {
    return null;
  }

  const details = errorObject.details || {};
  const elevationRequestId =
    typeof details.elevationRequestId === 'string' && details.elevationRequestId.trim()
      ? details.elevationRequestId.trim()
      : null;
  const elevationId =
    typeof details.elevationId === 'string' && details.elevationId.trim()
      ? details.elevationId.trim()
      : elevationRequestId;
  const commandNames = asStringList(details.commandNames);
  const single =
    typeof details.command === 'string' && details.command.trim()
      ? details.command.trim()
      : '';
  if (single && !commandNames.includes(single)) commandNames.unshift(single);

  return {
    elevationId,
    elevationRequestId: elevationRequestId || elevationId,
    approvalUrl:
      typeof details.approvalUrl === 'string' && details.approvalUrl.trim()
        ? details.approvalUrl.trim()
        : null,
    pack: typeof details.pack === 'string' ? details.pack : null,
    command: single || commandNames[0] || null,
    commandNames,
    resourceRef:
      details.resourceRef && typeof details.resourceRef === 'object'
        ? details.resourceRef
        : null,
    reason:
      (typeof details.reason === 'string' && details.reason) ||
      errorObject.message ||
      'This action requires elevated permissions.',
    requiredOnboardingType:
      typeof details.requiredOnboardingType === 'string'
        ? details.requiredOnboardingType
        : null,
    onboardingSatisfied:
      typeof details.onboardingSatisfied === 'boolean' ? details.onboardingSatisfied : true,
    message: errorObject.message || 'Permission elevation required.',
  };
}
