import { describe, expect, it } from 'vitest';
import { mapPresenceToVoiceAvatarProps, FALLBACK_VOICE_VRM } from './VoiceAvatarCanvas.js';

type Presence = Parameters<typeof mapPresenceToVoiceAvatarProps>[0];

describe('mapPresenceToVoiceAvatarProps (Bug 1: validationStatus pass-through)', () => {
  it('carries vrmValidationStatus from a verified catalog VRM into CompanionCanvas props', () => {
    const presence = {
      v: 1,
      vrmUrl: 'https://cdn.example/catalog/agent.vrm',
      vrmAssetId: 'asset-9',
      vrmValidationStatus: 'verified',
    } as Presence;

    const mapped = mapPresenceToVoiceAvatarProps(presence, undefined);
    expect(mapped).not.toBeNull();
    expect(mapped!.vrmUrl).toBe('https://cdn.example/catalog/agent.vrm');
    // Without this the character-kit gate returns `missing_validation_status`.
    expect(mapped!.validationStatus).toBe('verified');
  });

  it('also carries the status through the presenceToCompanionProps path', () => {
    const presence = {
      v: 1,
      vrmUrl: 'https://cdn.example/catalog/agent.vrm',
      vrmValidationStatus: 'verified',
    } as Presence;
    // Stand-in for @nexus/character-react's mapper (which now forwards the field).
    const mapper = (p: Presence) => ({
      vrmUrl: p?.vrmUrl,
      gestureManifestUrl: p?.gestureManifestUrl,
      mood: p?.defaultMood ?? 'neutral',
      clothes: p?.clothes,
      lipSyncEnabled: p?.settings?.lip_sync_enabled !== false,
      validationStatus: p?.vrmValidationStatus ?? null,
    });

    const mapped = mapPresenceToVoiceAvatarProps(presence, mapper as never);
    expect(mapped!.validationStatus).toBe('verified');
  });

  it('preserves an explicit rejection so the gate still blocks it', () => {
    const presence = {
      v: 1,
      vrmUrl: 'https://cdn.example/catalog/agent.vrm',
      vrmValidationStatus: 'rejected',
    } as Presence;
    const mapped = mapPresenceToVoiceAvatarProps(presence, undefined);
    // Not weakened: the status flows through unchanged and the gate denies it.
    expect(mapped!.validationStatus).toBe('rejected');
  });

  it('reports null (not undefined) status when presence has none', () => {
    const presence = { v: 1, vrmUrl: 'https://cdn.example/agent.vrm' } as Presence;
    const mapped = mapPresenceToVoiceAvatarProps(presence, undefined);
    expect(mapped!.validationStatus).toBeNull();
  });

  it('falls back to the platform sample VRM when presence has no vrmUrl', () => {
    const mapped = mapPresenceToVoiceAvatarProps({ v: 1 } as Presence, undefined);
    expect(mapped!.vrmUrl).toBe(FALLBACK_VOICE_VRM);
  });

  it('returns null with no presence', () => {
    expect(mapPresenceToVoiceAvatarProps(null, undefined)).toBeNull();
  });
});
