/** Host-facing payload for `hooks.onDataAccessApproval`. */
export type DataAccessApprovalInfo = {
  callId: string | null;
  grantId: string | null;
  resource: unknown;
  parents: unknown[];
  access: string;
  details: Record<string, unknown>;
  resume: unknown;
  message: string;
};

/** True for a tool result that is an open region data-access approval request. */
export function isDataAccessApprovalResult(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const r = result as Record<string, unknown>;
  return (
    r.needsApproval === true &&
    (r.approvalKind === 'data_access' || r.status === 'data_access_approval_required')
  );
}

/**
 * Normalize a `data_access_approval_request` event payload or a data-access tool
 * result into the hook payload. Top-level fields win; `details` is the fallback
 * (region errors nest grant info there).
 */
export function dataAccessApprovalInfoFrom(
  payload: unknown,
  fallbackCallId: string | null = null,
): DataAccessApprovalInfo {
  const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const details =
    p.details && typeof p.details === 'object' ? (p.details as Record<string, unknown>) : {};
  const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
  return {
    callId: str(p.callId) ?? fallbackCallId,
    grantId: str(p.grantId) ?? str(details.grantId),
    resource: p.resource ?? details.resource ?? null,
    parents: Array.isArray(p.parents)
      ? p.parents
      : Array.isArray(details.parents)
        ? details.parents
        : [],
    access: str(p.access) ?? str(details.access) ?? 'read',
    details,
    resume: p.resume ?? null,
    message: str(p.message) ?? str(p.reason) ?? 'Data access requires your approval.',
  };
}
