export type AttachmentLike = {
  kind?: string;
  entityType?: string;
  ref?: string;
  mimeType?: string;
  contentType?: string;
  filename?: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  url?: string;
  downloadUrl?: string;
} | null | undefined;

export function isImageAttachment(attachment: AttachmentLike): boolean {
  if (!attachment) return false;
  const mime = String(attachment.mimeType || attachment.contentType || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const name = String(attachment.filename || '').toLowerCase();
  return /\.(png|jpe?g|gif|webp|avif|bmp)$/.test(name);
}

export function attachmentThumbUrl(attachment: AttachmentLike): string {
  if (!attachment) return '';
  const url =
    attachment.previewUrl ||
    attachment.thumbnailUrl ||
    attachment.url ||
    attachment.downloadUrl ||
    '';
  return typeof url === 'string' && url.trim() ? url.trim() : '';
}

export function shouldRenderImageThumb(attachment: AttachmentLike): boolean {
  return isImageAttachment(attachment) && Boolean(attachmentThumbUrl(attachment));
}

export function attachmentTypeIcon(attachment: AttachmentLike): string {
  const mime = String((attachment && (attachment.mimeType || attachment.contentType)) || '').toLowerCase();
  if (mime.startsWith('image/')) return '🖼';
  if (mime.startsWith('audio/')) return '♫';
  if (mime.startsWith('video/')) return '▶';
  if (mime === 'application/pdf') return 'PDF';
  const name = String((attachment && attachment.filename) || '').toLowerCase();
  if (/\.(png|jpe?g|gif|webp|avif|bmp)$/.test(name)) return '🖼';
  if (name.endsWith('.pdf')) return 'PDF';
  return '📄';
}

export function attachmentChipLabel(attachment: AttachmentLike): string {
  if (!attachment) return 'file';
  const name = String(attachment.filename || '').trim();
  if (name) return name;
  const mime = String(attachment.mimeType || attachment.contentType || '').trim();
  if (mime) return mime;
  const ref = String(attachment.ref || '').trim();
  return ref || 'file';
}

export type PendingAttachmentItem<TDescriptor = unknown> = {
  status?: string;
  descriptor?: TDescriptor | null;
  previewUrl?: string;
  mimeType?: string;
  filename?: string;
};

/** Copy local preview + labels onto the send payload so the bubble can render a thumb. */
export function turnAttachmentsFromPending<T extends PendingAttachmentItem>(
  readyItems: T[],
): Array<NonNullable<T['descriptor']> & { previewUrl?: string; mimeType?: string; filename?: string }> {
  return readyItems
    .filter((item) => item && item.descriptor)
    .map((item) => {
      const descriptor = item.descriptor as Record<string, unknown>;
      const mimeType =
        (typeof descriptor.mimeType === 'string' && descriptor.mimeType) ||
        item.mimeType ||
        undefined;
      const filename =
        (typeof descriptor.filename === 'string' && descriptor.filename) ||
        item.filename ||
        undefined;
      const previewUrl = item.previewUrl && String(item.previewUrl).trim() ? item.previewUrl : undefined;
      return {
        ...(descriptor as NonNullable<T['descriptor']>),
        ...(mimeType ? { mimeType } : {}),
        ...(filename ? { filename } : {}),
        ...(previewUrl ? { previewUrl } : {}),
      };
    });
}

export function applyDraftRestore<T extends { pendingItems?: unknown[] }>(
  current: { draft: string; pendingItems: T['pendingItems'] },
  snapshot: { text?: string; pendingItems?: T['pendingItems'] } | null,
  opts?: { textOnly?: boolean },
): { draft: string; pendingItems: T['pendingItems'] } {
  if (!snapshot) return current;
  const draft = snapshot.text == null ? '' : String(snapshot.text);
  if (opts?.textOnly) return { draft, pendingItems: current.pendingItems };
  const restored = Array.isArray(snapshot.pendingItems) ? snapshot.pendingItems : [];
  return {
    draft,
    pendingItems: restored.length
      ? ([...restored, ...(current.pendingItems || [])] as T['pendingItems'])
      : current.pendingItems,
  };
}
