export type MediaCarouselImage = {
  index: number;
  label: string;
  imageUrl: string;
  explorerUrl: string | null;
  storageReference?: string | null;
  bucketId?: string | null;
  objectKey?: string | null;
  workspaceId?: string | null;
  fileId?: string | null;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

function pickUrl(item: Record<string, unknown> | null): string {
  if (!item) return '';
  if (typeof item.serveUrl === 'string' && item.serveUrl) return item.serveUrl;
  if (typeof item.imageUrl === 'string' && item.imageUrl) return item.imageUrl;
  if (typeof item.previewDataUrl === 'string' && item.previewDataUrl) return item.previewDataUrl;
  if (typeof item.url === 'string' && item.url) return item.url;
  if (typeof item.presignedUrl === 'string' && item.presignedUrl) return item.presignedUrl;
  return '';
}

/** Parse generate_image tool result into carousel entries (incl. images[] carousel URLs). */
export function parseMediaImages(result: unknown): MediaCarouselImage[] {
  const r = asRecord(result);
  if (!r) return [];
  if (Array.isArray(r.images)) {
    const out: MediaCarouselImage[] = [];
    for (let i = 0; i < r.images.length; i += 1) {
      const item = asRecord(r.images[i]);
      const imageUrl = pickUrl(item);
      if (!imageUrl) continue;
      const index = typeof item?.index === 'number' ? item.index : i + 1;
      const label = typeof item?.label === 'string' ? item.label : `Image ${index}`;
      out.push({
        index,
        label,
        imageUrl,
        explorerUrl: typeof item?.explorerUrl === 'string' ? item.explorerUrl : null,
        storageReference:
          typeof item?.storageReference === 'string' ? item.storageReference : null,
        bucketId: typeof item?.bucketId === 'string' ? item.bucketId : null,
        objectKey: typeof item?.objectKey === 'string' ? item.objectKey : null,
        workspaceId: typeof item?.workspaceId === 'string' ? item.workspaceId : null,
        fileId: typeof item?.fileId === 'string' ? item.fileId : null,
      });
    }
    return out;
  }
  const single = pickUrl(r);
  if (single) {
    return [
      {
        index: 1,
        label: 'Image 1',
        imageUrl: single,
        explorerUrl: typeof r.explorerUrl === 'string' ? r.explorerUrl : null,
      },
    ];
  }
  return [];
}

/** Images from a completed workload payload (batchAcceptedImageUrls / resultServeUrl). */
export function parseWorkloadMediaImages(workload: Record<string, unknown>): MediaCarouselImage[] {
  const workloadId =
    typeof workload._id === 'string'
      ? workload._id
      : typeof workload.workloadId === 'string'
        ? workload.workloadId
        : String(workload._id ?? workload.workloadId ?? '');
  const payload = asRecord(workload.resultPayload) ?? {};
  const urls = Array.isArray(payload.batchAcceptedImageUrls)
    ? (payload.batchAcceptedImageUrls as string[])
    : [];
  if (urls.length) {
    return urls.map((raw, i) => ({
      index: i + 1,
      label: `Image ${i + 1}`,
      imageUrl: raw,
      explorerUrl: null,
    }));
  }
  const fallback =
    (typeof workload.resultImageUrl === 'string' && workload.resultImageUrl) ||
    (typeof workload.resultServeUrl === 'string' && workload.resultServeUrl) ||
    (typeof payload.resultServeUrl === 'string' && payload.resultServeUrl) ||
    null;
  if (fallback) {
    return [
      {
        index: 1,
        label: 'Image 1',
        imageUrl: fallback,
        explorerUrl: null,
      },
    ];
  }
  void workloadId;
  return [];
}

export function parseMediaAudioUrl(result: unknown): string | null {
  const r = asRecord(result);
  if (!r) return null;
  if (typeof r.audioUrl === 'string' && r.audioUrl) return r.audioUrl;
  if (typeof r.resultServeUrl === 'string' && r.resultServeUrl) return r.resultServeUrl;
  return null;
}

export function parseMediaWorkloadId(result: unknown): string | null {
  const r = asRecord(result);
  if (!r) return null;
  return typeof r.workloadId === 'string' ? r.workloadId : null;
}

export type UserChoiceOption = { id: string; label: string };

export function parseUserChoiceOptions(run: {
  args?: Record<string, unknown>;
  result?: unknown;
}): UserChoiceOption[] {
  const raw = run.args?.options ?? run.result;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (o): o is Record<string, unknown> =>
        typeof o === 'object' && o != null && 'label' in o,
    )
    .map((o) => ({
      id: String(o.id ?? o.label),
      label: String(o.label),
    }));
}
