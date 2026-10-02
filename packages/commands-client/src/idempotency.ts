/**
 * Canonical idempotency header already sent by {@link NexusClient}.
 * Region-node should treat this as the write-replay key.
 */
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';

/**
 * Alternate header. Routed transport treats either header as permission
 * to fail a write over onto the next route after timeout or connection reset.
 */
export const IDEMPOTENCY_HEADER_ALT = 'x-anx-idempotency-key';

const IDEMPOTENCY_HEADER_NAMES = new Set([
  IDEMPOTENCY_HEADER.toLowerCase(),
  IDEMPOTENCY_HEADER_ALT.toLowerCase(),
]);

export function hasIdempotencyHeader(headers: Record<string, string> | undefined): boolean {
  if (!headers) return false;
  for (const [name, value] of Object.entries(headers)) {
    if (!value) continue;
    if (IDEMPOTENCY_HEADER_NAMES.has(name.toLowerCase())) return true;
  }
  return false;
}
