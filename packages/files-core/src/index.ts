export type CollectionItemKind = 'file' | 'entity';
export type CollectionItemSource = 'conversation_media' | 'storage_bucket' | 'external_bucket';

export type CollectionItemRef = {
  id: string;
  kind: CollectionItemKind;
  source?: CollectionItemSource;
  fileId?: string;
  entityType?: string;
  entityId?: string;
  label: string;
  mimeType?: string;
  revisionNo?: number;
  viaDataRoomId?: string;
  limitations?: string[];
};

export type StorageCapabilityFlags = {
  read: boolean;
  partialWrite: boolean;
  revert: boolean;
  livePreview: boolean;
  shareLinks: boolean;
  pageDwell: boolean;
};

export function capabilitiesFromBackend(raw: Partial<StorageCapabilityFlags> | null | undefined): StorageCapabilityFlags {
  return {
    read: raw?.read !== false,
    partialWrite: Boolean(raw?.partialWrite),
    revert: Boolean(raw?.revert),
    livePreview: Boolean(raw?.livePreview),
    shareLinks: raw?.shareLinks !== false,
    pageDwell: Boolean(raw?.pageDwell),
  };
}

export function limitationBadges(item: Pick<CollectionItemRef, 'limitations' | 'source'>): string[] {
  const fromItem = Array.isArray(item.limitations) ? item.limitations : [];
  if (item.source === 'external_bucket' && !fromItem.includes('provider_limited')) {
    return fromItem.concat('provider_limited');
  }
  return fromItem;
}

export function nextIfMatchRevision(current: number | undefined): number {
  return typeof current === 'number' && Number.isFinite(current) ? current : 0;
}

export function isImageMime(mimeType?: string, filename?: string): boolean {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(String(filename || ''));
}
