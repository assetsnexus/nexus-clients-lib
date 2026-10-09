/** Session codes hosts use to show a Nexus sign-in affordance. */
export const NEXUS_SESSION_CODES = ['NO_NEXUS_GRANT', 'NEEDS_NEXUS_LOGIN'] as const;

export type NexusSessionCode = (typeof NEXUS_SESSION_CODES)[number];

export type CodedCommandError = Error & { code?: string };

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Server `code` on a soft-fail command result.
 * Top-level `code` wins; nested `error.code` is the fallback.
 */
export function readCommandFailureCode(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const row = result as { code?: unknown; error?: unknown };
  const top = trimmed(row.code);
  if (top) return top;
  if (!row.error || typeof row.error !== 'object') return undefined;
  const nested = trimmed((row.error as { code?: unknown }).code);
  return nested || undefined;
}

export function nexusSessionCode(code: string | undefined | null): NexusSessionCode | undefined {
  if (code === 'NO_NEXUS_GRANT' || code === 'NEEDS_NEXUS_LOGIN') return code;
  return undefined;
}

/** Error shape `hooks.onError` and `chatFailureInfo` already read (`message` + `code`). */
export function commandFailureError(result: unknown, fallback: string): CodedCommandError {
  const row = result && typeof result === 'object' ? (result as { message?: unknown }) : {};
  const message = trimmed(row.message) || fallback;
  const error = new Error(message) as CodedCommandError;
  const code = readCommandFailureCode(result);
  if (code) error.code = code;
  return error;
}
