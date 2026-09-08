/**
 * Client-side chat attachment ingest helpers (paste / drop / multi-file pick).
 * Caps match region + communicate send: 10 per message, 100 MiB per file.
 */

export const MAX_CHAT_ATTACHMENTS_PER_MESSAGE = 10;
/** Region default max object size (file-storage). */
export const MAX_CHAT_ATTACHMENT_BYTES = 100 * 1024 * 1024;
/** Default TTL when the user drops files into the conversation (not the bucket). */
export const CHAT_CONVERSATION_ATTACHMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type ChatFileDestination = 'conversation' | 'bucket';

export type ChatAttachmentRejectReason = 'empty' | 'too_large' | 'too_many';

export type ChatAttachmentFileLike = {
  name?: string;
  type?: string;
  size: number;
  lastModified?: number;
};

export type ChatAttachmentReject<T extends ChatAttachmentFileLike = ChatAttachmentFileLike> = {
  file: T;
  reason: ChatAttachmentRejectReason;
};

export type ChatAttachmentRetentionPolicy = {
  kind: 'permanent' | 'temporary';
  maxRetentionMs?: number;
  deleteOnJobSuccess?: boolean;
};

export type ChatFileUploadOpts = {
  workspaceId?: string;
  folderId?: string;
  originalName?: string;
  module?: string;
  retentionPolicy?: ChatAttachmentRetentionPolicy;
};

const MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'application/json': '.json',
  'audio/webm': '.webm',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
};

export function extFromMime(mime: string | undefined): string {
  const key = String(mime || '').toLowerCase().split(';')[0]?.trim() || '';
  return MIME_EXT[key] || '';
}

export function looksLikeImageFile(file: ChatAttachmentFileLike | null | undefined): boolean {
  if (!file) return false;
  const mime = String(file.type || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/i.test(String(file.name || ''));
}

function fileDedupeKey(file: ChatAttachmentFileLike): string {
  return `${file.name || ''}:${file.size}:${file.type || ''}:${file.lastModified || 0}`;
}

function addUniqueFile<T extends ChatAttachmentFileLike>(out: T[], seen: Set<string>, file: T | null | undefined) {
  if (!file) return;
  const key = fileDedupeKey(file);
  if (seen.has(key)) return;
  seen.add(key);
  out.push(file);
}

type ClipboardLike = {
  items?: ArrayLike<{ kind?: string; getAsFile?: () => File | null }>;
  files?: ArrayLike<File>;
};

/**
 * Collect File objects from a paste clipboard. Screenshots often appear on
 * `items` (kind=file) and not on `files`.
 */
export function collectFilesFromClipboard(clipboard: ClipboardLike | DataTransfer | null | undefined): File[] {
  if (!clipboard) return [];
  const out: File[] = [];
  const seen = new Set<string>();
  const items = clipboard.items;
  if (items && typeof items.length === 'number') {
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (!item || item.kind !== 'file' || typeof item.getAsFile !== 'function') continue;
      addUniqueFile(out, seen, item.getAsFile());
    }
  }
  const files = clipboard.files;
  if (files && typeof files.length === 'number') {
    for (let i = 0; i < files.length; i += 1) {
      addUniqueFile(out, seen, files[i] || null);
    }
  }
  return out;
}

type DataTransferLike = {
  files?: ArrayLike<File>;
  items?: ArrayLike<{ kind?: string; getAsFile?: () => File | null }>;
};

/** Collect File objects from a drag-and-drop DataTransfer. */
export function collectFilesFromDataTransfer(
  transfer: DataTransferLike | DataTransfer | null | undefined,
): File[] {
  return collectFilesFromClipboard(transfer);
}

export function dataTransferHasFiles(transfer: { types?: ArrayLike<string> } | null | undefined): boolean {
  const types = transfer?.types;
  if (!types) return false;
  const list = typeof types === 'string' ? [types] : Array.from(types as ArrayLike<string>);
  return list.some((t) => String(t).toLowerCase() === 'files');
}

/**
 * Give unnamed clipboard blobs a stable filename so region originalName is not empty.
 */
export function ensureNamedFile(file: File, index = 0): File {
  const name = String(file.name || '').trim();
  if (name && name !== 'blob') return file;
  if (typeof File === 'undefined') return file;
  const ext = extFromMime(file.type) || '.bin';
  return new File([file], `pasted-file-${Date.now()}-${index}${ext}`, {
    type: file.type || 'application/octet-stream',
    lastModified: file.lastModified || Date.now(),
  });
}

/**
 * Clone clipboard/drop File objects into durable bytes.
 * `DataTransferItem.getAsFile()` / paste blobs can become empty after the
 * originating event returns (e.g. after an async destination dialog).
 */
export async function snapshotChatFiles(files: File[]): Promise<File[]> {
  const out: File[] = [];
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    if (!file) continue;
    const buf = await file.arrayBuffer();
    const copy = new File([buf], file.name || 'blob', {
      type: file.type || 'application/octet-stream',
      lastModified: file.lastModified || Date.now(),
    });
    out.push(ensureNamedFile(copy, i));
  }
  return out;
}

export function partitionChatAttachmentFiles<T extends ChatAttachmentFileLike>(
  files: T[],
  opts?: { alreadyPending?: number; maxCount?: number; maxBytes?: number },
): { accepted: T[]; rejected: Array<ChatAttachmentReject<T>> } {
  const maxCount = opts?.maxCount ?? MAX_CHAT_ATTACHMENTS_PER_MESSAGE;
  const maxBytes = opts?.maxBytes ?? MAX_CHAT_ATTACHMENT_BYTES;
  const already = Math.max(0, opts?.alreadyPending ?? 0);
  const remainingSlots = Math.max(0, maxCount - already);
  const accepted: T[] = [];
  const rejected: Array<ChatAttachmentReject<T>> = [];

  for (const file of files) {
    if (!file || !Number(file.size) || file.size < 1) {
      rejected.push({ file, reason: 'empty' });
      continue;
    }
    if (file.size > maxBytes) {
      rejected.push({ file, reason: 'too_large' });
      continue;
    }
    if (accepted.length >= remainingSlots) {
      rejected.push({ file, reason: 'too_many' });
      continue;
    }
    accepted.push(file);
  }
  return { accepted, rejected };
}

/**
 * Map a UI destination to region `upload-init` options.
 * Conversation (default): chat-attachment module; optional temporary retention on drop.
 * Bucket: durable storage-browser object (agent can edit in place).
 */
export function uploadOptsForChatFileDestination(
  destination: ChatFileDestination,
  extra?: {
    workspaceId?: string;
    folderId?: string;
    withExpiry?: boolean;
    retentionPolicy?: ChatAttachmentRetentionPolicy;
  },
): ChatFileUploadOpts {
  if (destination === 'bucket') {
    return {
      module: 'storage-browser',
      ...(extra?.workspaceId ? { workspaceId: extra.workspaceId } : {}),
      ...(extra?.folderId ? { folderId: extra.folderId } : {}),
    };
  }
  const retentionPolicy =
    extra?.retentionPolicy ||
    (extra?.withExpiry
      ? { kind: 'temporary' as const, maxRetentionMs: CHAT_CONVERSATION_ATTACHMENT_TTL_MS }
      : undefined);
  return {
    module: 'chat-attachment',
    ...(retentionPolicy ? { retentionPolicy } : {}),
  };
}
