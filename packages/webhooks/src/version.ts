/**
 * True when `incoming` is a strictly newer monotonic version.
 * Non-integers and negatives are ignored so a malformed payload cannot rewind state.
 */
export function isNewerVersion(stored: number, incoming: number): boolean {
  if (!Number.isSafeInteger(stored) || !Number.isSafeInteger(incoming)) return false;
  if (stored < 0 || incoming < 0) return false;
  return incoming > stored;
}
