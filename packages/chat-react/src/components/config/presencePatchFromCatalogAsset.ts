import type { ParticipantPresenceV1 } from '../../presence/participant-presence.js';

export type CatalogAssetForPresence = {
  id: string;
  url?: string | null;
  kind?: string | null;
  validationStatus?: string | null;
};

/**
 * Map a catalog row (or upload response) onto ParticipantPresenceV1 fields.
 * Rejects blob: URLs. Routes vrma/manifest → gesture fields; otherwise VRM.
 */
export function presencePatchFromCatalogAsset(
  asset: CatalogAssetForPresence,
): Partial<ParticipantPresenceV1> | null {
  const url = typeof asset.url === 'string' ? asset.url : null;
  if (!url || url.startsWith('blob:')) return null;
  const validationStatus =
    asset.validationStatus === 'verified' ||
    asset.validationStatus === 'rejected' ||
    asset.validationStatus === 'pending_admin'
      ? asset.validationStatus
      : 'pending_admin';
  const kind = (asset.kind || 'vrm').toLowerCase();
  if (kind === 'vrma' || kind === 'manifest') {
    return {
      gestureManifestUrl: url,
      gestureManifestAssetId: asset.id,
      gestureManifestValidationStatus: validationStatus,
    };
  }
  return {
    vrmUrl: url,
    vrmAssetId: asset.id,
    vrmValidationStatus: validationStatus,
  };
}
