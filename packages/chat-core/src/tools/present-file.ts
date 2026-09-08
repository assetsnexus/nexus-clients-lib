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
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

/**
 * Portal explorer deep-link: `/user/storage/browser/:workspaceId?file=:fileId`
 */
export function buildStorageExplorerUrl(
  workspaceId: string | null | undefined,
  fileId: string | null | undefined,
): string | null {
  if (!workspaceId || !fileId) return null;
  return `/user/storage/browser/${encodeURIComponent(workspaceId)}?file=${encodeURIComponent(fileId)}`;
}

export function parsePresentFileItem(row: unknown): PresentFileItem | null {
  const data = asRecord(row);
  if (!data) return null;
  const objectKey = typeof data.objectKey === 'string' ? data.objectKey : undefined;
  const fileId = typeof data.fileId === 'string' ? data.fileId : undefined;
  const workspaceId = typeof data.workspaceId === 'string' ? data.workspaceId : undefined;
  const label =
    typeof data.label === 'string' && data.label.trim()
      ? data.label.trim()
      : objectKey?.split('/').pop() || fileId || 'File';
  const mimeType =
    typeof data.mimeType === 'string' ? data.mimeType : 'application/octet-stream';
  const presignedUrl = typeof data.presignedUrl === 'string' ? data.presignedUrl : null;
  const explorerUrl =
    (typeof data.explorerUrl === 'string' && data.explorerUrl) ||
    buildStorageExplorerUrl(workspaceId, fileId);
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
