import type { IoDescriptor } from './types.js';

const DISPLAY_KEYS = new Set(['previewUrl', 'thumbnailUrl', 'url', 'downloadUrl']);

export type AttachmentDisplay = IoDescriptor & {
  previewUrl?: string;
  thumbnailUrl?: string;
  url?: string;
  downloadUrl?: string;
};

export function attachmentFileIds(attachments: IoDescriptor[] | undefined): string[] {
  return (attachments || [])
    .filter(
      (attachment): attachment is Extract<IoDescriptor, { kind: 'entity' }> =>
        attachment.kind === 'entity' && attachment.entityType === 'conversation_attachment',
    )
    .map((attachment) => attachment.ref)
    .filter((ref) => typeof ref === 'string' && ref.trim().length > 0);
}

/** Drop display URLs and keep only the IoDescriptor the command schema accepts. */
export function attachmentsForCommand(attachments: AttachmentDisplay[] | undefined): IoDescriptor[] {
  return (attachments || []).map((attachment) => {
    if (attachment.kind === 'entity') {
      const mimeType =
        typeof attachment.mimeType === 'string' && attachment.mimeType.trim()
          ? attachment.mimeType.trim()
          : undefined;
      const filename =
        typeof attachment.filename === 'string' && attachment.filename.trim()
          ? attachment.filename.trim()
          : undefined;
      return {
        kind: 'entity' as const,
        entityType: attachment.entityType,
        ref: attachment.ref,
        ...(mimeType ? { mimeType } : {}),
        ...(filename ? { filename } : {}),
      };
    }
    if (attachment.kind === 'bucket') {
      const mimeType =
        typeof attachment.mimeType === 'string' && attachment.mimeType.trim()
          ? attachment.mimeType.trim()
          : undefined;
      return {
        kind: 'bucket' as const,
        bucketId: attachment.bucketId,
        path: attachment.path,
        ...(mimeType ? { mimeType } : {}),
      };
    }
    if (attachment.kind === 'inline') {
      return {
        kind: 'inline' as const,
        dataBase64: attachment.dataBase64,
        mimeType: attachment.mimeType,
        byteLength: attachment.byteLength,
      };
    }
    const leftover = attachment as unknown as Record<string, unknown>;
    const next = { ...leftover };
    for (const key of DISPLAY_KEYS) delete next[key];
    return next as IoDescriptor;
  });
}

export function attachmentDisplayUrl(attachment: AttachmentDisplay | undefined): string {
  if (!attachment) return '';
  const url =
    attachment.previewUrl ||
    attachment.thumbnailUrl ||
    attachment.url ||
    attachment.downloadUrl ||
    '';
  return typeof url === 'string' && url.trim() ? url.trim() : '';
}

function entityRef(attachment: AttachmentDisplay | undefined): string {
  if (!attachment || attachment.kind !== 'entity') return '';
  return typeof attachment.ref === 'string' ? attachment.ref.trim() : '';
}

/** Keep local blob thumbs when history rehydrate returns descriptors without URLs. */
export function mergeAttachmentDisplay(
  previous: Array<{ attachments?: AttachmentDisplay[] }> | undefined,
  incoming: AttachmentDisplay[] | undefined,
): AttachmentDisplay[] | undefined {
  if (!incoming?.length) return incoming;
  const previewByRef = new Map<string, string>();
  for (const turn of previous || []) {
    for (const attachment of turn.attachments || []) {
      const ref = entityRef(attachment);
      const url = attachmentDisplayUrl(attachment);
      if (ref && url) previewByRef.set(ref, url);
    }
  }
  return incoming.map((attachment) => {
    const existing = attachmentDisplayUrl(attachment);
    if (existing) return attachment;
    const ref = entityRef(attachment);
    const previewUrl = ref ? previewByRef.get(ref) : '';
    return previewUrl ? { ...attachment, previewUrl } : attachment;
  });
}
