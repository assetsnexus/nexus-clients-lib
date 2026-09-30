/**
 * Ambient types for the asset-cache subpath (avoids pulling the full character-kit
 * surface / three into chat-react typecheck). Runtime resolves via package exports
 * or Vite alias.
 */
declare module '@nexus/character-kit/asset-cache' {
  export function fetchCachedPictureObjectUrl(
    url: string,
    opts?: {
      assetId?: string | null;
      userId?: string | null;
      previewUnverified?: boolean;
      validationStatus?: string | null;
      ttlMs?: number;
      nowMs?: number;
      onProgress?: (ratio: number) => void;
    },
  ): Promise<string>;

  export function shouldPersistAssetUrl(url: string): boolean;
}
