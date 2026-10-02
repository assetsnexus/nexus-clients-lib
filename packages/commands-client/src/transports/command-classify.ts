import { hasIdempotencyHeader } from '../idempotency.js';
import { isLikelyReadCommand } from '../types.js';
import type { RouteAttemptClass } from './failover-policy.js';

const COMMAND_PATH_PREFIX = '/command/';

/** Minimal request shape needed to classify an attempt. */
export type ClassifiableRequest = {
  method: string;
  path: string;
  headers: Record<string, string>;
  /** Explicit read hint from the caller (`SendOptions.isRead`). Wins over path inference. */
  isRead?: boolean;
};

/** Extract the command name from `/command/<name>` (URL-decoded). */
export function commandNameFromPath(path: string): string | undefined {
  const pathname = path.split(/[?#]/, 1)[0] ?? '';
  if (!pathname.startsWith(COMMAND_PATH_PREFIX)) return undefined;
  const raw = pathname.slice(COMMAND_PATH_PREFIX.length);
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

/**
 * Classify an ANX command request for {@link RoutedTransport} failover.
 *
 * Every command is a POST, so without this the transport treats reads as
 * non-idempotent writes and refuses to fail over on timeout / connection reset
 * (reads intentionally carry no idempotency key). An explicit `isRead` hint
 * wins; otherwise the command name is inferred with {@link isLikelyReadCommand}.
 * Writes stay idempotent only when they carry an idempotency header.
 */
export function classifyCommandRequest(input: ClassifiableRequest): RouteAttemptClass {
  const command = commandNameFromPath(input.path);
  const isRead =
    typeof input.isRead === 'boolean'
      ? input.isRead
      : command !== undefined && isLikelyReadCommand(command);
  return {
    isRead,
    idempotent: hasIdempotencyHeader(input.headers),
  };
}
