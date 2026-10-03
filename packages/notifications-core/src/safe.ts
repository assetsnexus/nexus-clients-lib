/** Internal portal path. Rejects protocol-relative, backslash, and embedded URL forms. */
export function isInternalAppPath(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const path = value.trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return false;
  if (path.includes('://') || path.includes('\\')) return false;
  if (path.length > 512) return false;
  return true;
}

/** Route and object ids. Unsafe values must never be interpolated into a path. */
export function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_:-]{1,128}$/.test(value);
}

/** Absolute https URL with no userinfo, at most 2048 characters. */
export function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const raw = value.trim();
  if (!raw || raw.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  return true;
}

/**
 * Swap `/user` and `/b2b` so a link opens in the console the user is already in.
 * Same rules as the portal `alignConsoleRoot` helper.
 */
export function alignConsoleRoot(path: string, currentPath?: string): string {
  const current = String(currentPath || '');
  if (current.startsWith('/b2b') && path.startsWith('/user/')) {
    return `/b2b${path.slice('/user'.length)}`;
  }
  if (current.startsWith('/user') && path.startsWith('/b2b/')) {
    return `/user${path.slice('/b2b'.length)}`;
  }
  return path;
}
