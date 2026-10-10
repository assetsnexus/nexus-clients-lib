export type PresentFileItem = {
  label: string;
  mimeType: string;
  presignedUrl: string | null;
  explorerUrl: string | null;
  storageReference: string | null;
  displayMode: 'inline' | 'download';
  bucketId?: string;
  objectKey?: string;
  workspaceId?: string;
  fileId?: string;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Fields that identify a storage file. A JSON tool body has none of these. */
const FILE_IDENTITY_KEYS = [
  'fileId',
  'objectKey',
  'presignedUrl',
  'storageReference',
  'explorerUrl',
  'bucketId',
] as const;

function hasPresentFileIdentity(data: Record<string, unknown>): boolean {
  return FILE_IDENTITY_KEYS.some((key) => nonEmptyString(data[key]) != null);
}

function currentConsolePath(pathname?: string): string {
  if (typeof pathname === 'string') return pathname;
  if (typeof window !== 'undefined' && window.location) return window.location.pathname || '';
  return '';
}

/** Personal console is `/user`. An org page (`/b2b/...`) must stay on that console. */
export function storageConsolePrefix(pathname?: string): '/user' | '/b2b' {
  return currentConsolePath(pathname).startsWith('/b2b') ? '/b2b' : '/user';
}

/**
 * Portal explorer deep-link. `pathname` selects `/b2b` or `/user`.
 * Omit it to follow the page the browser is on.
 */
export function buildStorageExplorerUrl(
  workspaceId: string | null | undefined,
  fileId: string | null | undefined,
  pathname?: string,
): string | null {
  if (!workspaceId || !fileId) return null;
  const prefix = storageConsolePrefix(pathname);
  return `${prefix}/storage/browser/${encodeURIComponent(workspaceId)}?file=${encodeURIComponent(fileId)}`;
}

/** Rewrite a stored `/user/storage/...` link onto the console that is open. */
export function toConsoleStorageExplorerUrl(
  url: string | null | undefined,
  pathname?: string,
): string | null {
  if (typeof url !== 'string' || !url.trim()) return null;
  const trimmed = url.trim();
  const prefix = storageConsolePrefix(pathname);
  try {
    const parsed = new URL(trimmed, 'https://portal.local');
    if (!/^\/(user|b2b)\/storage\/browser\//.test(parsed.pathname)) return trimmed;
    parsed.pathname = parsed.pathname.replace(/^\/(user|b2b)/, prefix);
    if (/^https?:\/\//i.test(trimmed)) return parsed.toString();
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return trimmed;
  }
}

export function fileIdFromStorageExplorerUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || !url.trim()) return null;
  try {
    const file = new URL(url.trim(), 'https://portal.local').searchParams.get('file');
    return file && file.trim() ? file.trim() : null;
  } catch {
    return null;
  }
}

export function parsePresentFileItem(row: unknown): PresentFileItem | null {
  const data = asRecord(row);
  if (!data || !hasPresentFileIdentity(data)) return null;
  const objectKey = nonEmptyString(data.objectKey);
  const fileId = nonEmptyString(data.fileId);
  const workspaceId = nonEmptyString(data.workspaceId);
  const label =
    typeof data.label === 'string' && data.label.trim()
      ? data.label.trim()
      : objectKey?.split('/').pop() || fileId || 'File';
  const mimeType =
    typeof data.mimeType === 'string' ? data.mimeType : 'application/octet-stream';
  const presignedUrl = typeof data.presignedUrl === 'string' ? data.presignedUrl : null;
  const explorerUrl = toConsoleStorageExplorerUrl(
    (typeof data.explorerUrl === 'string' && data.explorerUrl) ||
      buildStorageExplorerUrl(workspaceId, fileId),
  );
  return {
    label,
    mimeType,
    presignedUrl,
    explorerUrl,
    storageReference:
      typeof data.storageReference === 'string' ? data.storageReference : null,
    displayMode: data.displayMode === 'download' ? 'download' : 'inline',
    bucketId: typeof data.bucketId === 'string' ? data.bucketId : undefined,
    objectKey,
    workspaceId,
    fileId,
  };
}

export function parsePresentFileItems(result: unknown): PresentFileItem[] {
  const root = asRecord(result);
  if (!root) return [];
  if (Array.isArray(root.files)) {
    return root.files
      .map((row) => parsePresentFileItem(row))
      .filter((x): x is PresentFileItem => x != null);
  }
  const single = parsePresentFileItem(root);
  return single ? [single] : [];
}

export function presentFileKind(
  mime: string,
  label: string,
): 'image' | 'audio' | 'video' | 'pdf' | 'other' {
  const n = label.toLowerCase();
  if (mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|svg)$/i.test(n)) return 'image';
  if (mime.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac)$/i.test(n)) return 'audio';
  if (mime.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(n)) return 'video';
  if (mime === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  return 'other';
}
