import { describe, expect, it } from 'vitest';
import { presencePatchFromCatalogAsset } from './presencePatchFromCatalogAsset.js';

describe('presencePatchFromCatalogAsset', () => {
  it('maps vrm catalog rows to VRM presence fields', () => {
    expect(
      presencePatchFromCatalogAsset({
        id: 'a1',
        url: 'https://cdn.example/a.vrm',
        kind: 'vrm',
        validationStatus: 'pending_admin',
      }),
    ).toEqual({
      vrmUrl: 'https://cdn.example/a.vrm',
      vrmAssetId: 'a1',
      vrmValidationStatus: 'pending_admin',
    });
  });

  it('maps vrma rows to gesture presence fields', () => {
    expect(
      presencePatchFromCatalogAsset({
        id: 'g1',
        url: 'https://cdn.example/wave.vrma',
        kind: 'vrma',
        validationStatus: 'verified',
      }),
    ).toEqual({
      gestureManifestUrl: 'https://cdn.example/wave.vrma',
      gestureManifestAssetId: 'g1',
      gestureManifestValidationStatus: 'verified',
    });
  });

  it('rejects blob: URLs', () => {
    expect(
      presencePatchFromCatalogAsset({
        id: 'x',
        url: 'blob:https://local/1',
        kind: 'vrm',
      }),
    ).toBeNull();
  });
});
