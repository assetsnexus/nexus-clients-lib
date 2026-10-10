/**
 * Browser binding for an OAuth `state` value.
 *
 * The PKCE verifier stays on the BFF. This record is only the CSRF state and
 * an expiry, so a portal round-trip can survive a new navigation. The host
 * chooses the storage and the key. Nothing here is a token.
 */

export const NEXUS_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

type StoredOAuthState = {
  state: string;
  expiresAt: number;
};

function readStored(raw: string | null): StoredOAuthState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredOAuthState;
    if (!parsed || typeof parsed.state !== 'string' || typeof parsed.expiresAt !== 'number') return null;
    if (!parsed.state || !Number.isFinite(parsed.expiresAt)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeOAuthState(
  storage: Storage,
  key: string,
  state: string,
  now = Date.now(),
  ttlMs = NEXUS_OAUTH_STATE_TTL_MS,
): void {
  const record: StoredOAuthState = { state, expiresAt: now + ttlMs };
  storage.setItem(key, JSON.stringify(record));
}

/**
 * Single-use. A missing, expired, or different state is a CSRF failure.
 * A legacy raw state string (no JSON) is accepted until it expires by being
 * consumed, so a login that started before the durable record still finishes.
 */
export function takeOAuthState(storage: Storage, key: string, state: string, now = Date.now()): boolean {
  const raw = storage.getItem(key);
  storage.removeItem(key);
  if (!state || !raw) return false;
  const stored = readStored(raw);
  if (!stored) return raw === state;
  if (stored.expiresAt <= now) return false;
  return stored.state === state;
}
