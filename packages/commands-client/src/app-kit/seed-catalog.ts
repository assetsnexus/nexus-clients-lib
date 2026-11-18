/**
 * Seed-catalog helpers.
 *
 * An app that seeds its own agent from code needs three things, and they are
 * the same for every app:
 *
 * - a deterministic serialization, so the same config always hashes the same;
 * - a hash, so a boot re-seed whose config did not change is a no-op;
 * - a diff against the live grant, so a missing permission is reported instead
 *   of surfacing as a random failure later.
 */

/** Deterministic JSON: object keys sorted, arrays kept in order. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
}

/**
 * `sha256:<hex>` over the canonical payload.
 *
 * Uses WebCrypto (`globalThis.crypto.subtle`), which is present in browsers and
 * in Node 19+. Deliberately no `node:crypto` fallback: a bundler that walks this
 * module (the portal's webpack build does) cannot resolve a `node:` scheme and
 * fails the whole build, and every supported runtime already has WebCrypto.
 */
export async function catalogHash(payload: unknown): Promise<string> {
  const text = canonicalJson(payload);
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) {
    throw new Error('catalogHash requires WebCrypto (globalThis.crypto.subtle)');
  }
  const bytes = new TextEncoder().encode(text);
  const digest = await subtle.digest('SHA-256', bytes);
  return `sha256:${toHex(new Uint8Array(digest))}`;
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

/**
 * Commands the app declares it needs but the grant does not include.
 *
 * `grantedCommands` is what the region actually allows; a command missing here
 * is the exact thing the developer has to add to the app's requested
 * permissions.
 */
export function missingPermissions(
  required: readonly string[],
  granted: readonly string[],
): string[] {
  const have = new Set(granted);
  return required.filter((command) => !have.has(command));
}

/**
 * Reads `grantedCommands` out of `anx.oauth2.grants.list`.
 *
 * The app token is scoped to its own client, so the first active grant is the
 * one this session is using.
 */
export function grantedCommandsFromList(data: unknown): string[] | null {
  if (!data || typeof data !== 'object') return null;
  const items = (data as { items?: unknown }).items;
  if (!Array.isArray(items) || !items.length) return null;
  const first = items[0] as Record<string, unknown> | undefined;
  const commands = first?.grantedCommands;
  if (!Array.isArray(commands)) return null;
  return commands.filter((command): command is string => typeof command === 'string');
}
