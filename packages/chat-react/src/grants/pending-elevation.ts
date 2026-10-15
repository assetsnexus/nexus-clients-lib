import type { PermissionElevationPromptModel } from '../components/grants/GrantCards.js';

/** One row from `anx.ai-agents.elevations.list`. */
export type ElevationListRow = {
  elevationId?: string;
  status?: string;
  packs?: string[];
  commandNames?: string[];
  reason?: string | null;
  resourceRef?: Record<string, unknown> | null;
  requiredOnboardingType?: string | null;
  onboardingSatisfied?: boolean;
};

function rowToPrompt(row: ElevationListRow): PermissionElevationPromptModel | null {
  const elevationId = String(row.elevationId || '').trim();
  if (!elevationId) return null;
  const commandNames = (row.commandNames || []).filter(
    (name): name is string => typeof name === 'string' && name.trim().length > 0,
  );
  return {
    elevationId,
    pack: row.packs?.[0] || null,
    command: commandNames[0] || null,
    commandNames,
    reason: row.reason || 'This action needs your approval before the agent can continue.',
    resourceRef: row.resourceRef && typeof row.resourceRef === 'object' ? row.resourceRef : null,
    requiredOnboardingType: row.requiredOnboardingType || null,
    onboardingSatisfied: row.onboardingSatisfied,
  };
}

/** All pending elevations for the open-chat grant dock (stable order). */
export function pendingElevationPrompts(
  rows: readonly ElevationListRow[] | null | undefined,
): PermissionElevationPromptModel[] {
  if (!Array.isArray(rows) || !rows.length) return [];
  const out: PermissionElevationPromptModel[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (String(row.status || '').toLowerCase() !== 'pending') continue;
    const prompt = rowToPrompt(row);
    if (!prompt?.elevationId || seen.has(prompt.elevationId)) continue;
    seen.add(prompt.elevationId);
    out.push(prompt);
  }
  return out;
}

/**
 * Newest pending elevation for a single-card host.
 * Prefer `pendingElevationPrompts` when the dock can show more than one.
 */
export function pendingElevationPrompt(
  rows: readonly ElevationListRow[] | null | undefined,
): PermissionElevationPromptModel | null {
  return pendingElevationPrompts(rows)[0] || null;
}

export function unwrapElevationList(result: unknown): ElevationListRow[] {
  if (!result || typeof result !== 'object') return [];
  const row = result as {
    ok?: boolean;
    responseObject?: unknown;
    data?: unknown;
  };
  if (row.ok === false) return [];
  const list = row.responseObject ?? row.data;
  return Array.isArray(list) ? (list as ElevationListRow[]) : [];
}

/** Insert or replace by elevationId (stream / rehydrate upsert). */
export function upsertElevationPrompt(
  current: readonly PermissionElevationPromptModel[],
  next: PermissionElevationPromptModel | null | undefined,
): PermissionElevationPromptModel[] {
  if (!next) return [...current];
  const elevationId = String(next.elevationId || '').trim();
  if (!elevationId) return [...current];
  const normalized = { ...next, elevationId };
  const idx = current.findIndex((row) => row.elevationId === elevationId);
  if (idx < 0) return [...current, normalized];
  const copy = [...current];
  copy[idx] = { ...copy[idx], ...normalized };
  return copy;
}

export function removeElevationPrompt(
  current: readonly PermissionElevationPromptModel[],
  elevationId: string | null | undefined,
): PermissionElevationPromptModel[] {
  const id = String(elevationId || '').trim();
  if (!id) return [...current];
  return current.filter((row) => row.elevationId !== id);
}

export function elevationRespondSucceeded(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const row = result as {
    ok?: boolean;
    kind?: string;
    responseCode?: number;
    response?: { responseCode?: number };
  };
  if (row.ok === true) return true;
  if (row.kind === 'ok' || row.kind === 'accepted') return true;
  if (row.responseCode === 200) return true;
  if (row.response?.responseCode === 200) return true;
  return false;
}

export function elevationRespondMessage(result: unknown): string {
  if (!result || typeof result !== 'object') return 'Failed to record decision';
  const row = result as {
    message?: string;
    error?: { message?: string };
    errorObjects?: Array<{ message?: string }>;
    response?: { errorObjects?: Array<{ message?: string }> };
  };
  return (
    row.error?.message ||
    row.errorObjects?.[0]?.message ||
    row.response?.errorObjects?.[0]?.message ||
    row.message ||
    'Failed to record decision'
  );
}
