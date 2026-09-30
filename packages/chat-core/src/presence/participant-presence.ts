export type AvatarValidationStatus = 'pending_admin' | 'rejected' | 'verified';

export type ParticipantPresenceV1 = {
  v?: 1;
  vrmUrl?: string | null;
  /** Catalog row id when `vrmUrl` came from anx.inference.avatar-assets. */
  vrmAssetId?: string | null;
  vrmValidationStatus?: AvatarValidationStatus | null;
  gestureManifestUrl?: string | null;
  gestureManifestAssetId?: string | null;
  gestureManifestValidationStatus?: AvatarValidationStatus | null;
  defaultMood?: string | null;
  clothes?: unknown;
  fishVoiceId?: string | null;
  voiceId?: string | null;
  settings?: {
    lip_sync_enabled?: boolean;
    status_motions?: unknown;
    routines?: unknown;
  };
};

function asValidationStatus(v: unknown): AvatarValidationStatus | null | undefined {
  if (v === null) return null;
  if (v === 'pending_admin' || v === 'rejected' || v === 'verified') return v;
  return undefined;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function parseParticipantPresenceV1(raw: unknown): ParticipantPresenceV1 | null {
  if (!isRecord(raw)) return null;
  const doc: ParticipantPresenceV1 = { v: 1 };
  if (typeof raw.vrmUrl === 'string' || raw.vrmUrl === null) doc.vrmUrl = raw.vrmUrl;
  if (typeof raw.vrmAssetId === 'string' || raw.vrmAssetId === null) {
    doc.vrmAssetId = raw.vrmAssetId;
  }
  {
    const st = asValidationStatus(raw.vrmValidationStatus);
    if (st !== undefined) doc.vrmValidationStatus = st;
  }
  if (typeof raw.gestureManifestUrl === 'string' || raw.gestureManifestUrl === null) {
    doc.gestureManifestUrl = raw.gestureManifestUrl;
  }
  if (typeof raw.gestureManifestAssetId === 'string' || raw.gestureManifestAssetId === null) {
    doc.gestureManifestAssetId = raw.gestureManifestAssetId;
  }
  {
    const st = asValidationStatus(raw.gestureManifestValidationStatus);
    if (st !== undefined) doc.gestureManifestValidationStatus = st;
  }
  if (typeof raw.defaultMood === 'string' || raw.defaultMood === null) {
    doc.defaultMood = raw.defaultMood;
  }
  if ('clothes' in raw) doc.clothes = raw.clothes;
  if (typeof raw.fishVoiceId === 'string' || raw.fishVoiceId === null) {
    doc.fishVoiceId = raw.fishVoiceId;
  }
  if (typeof raw.voiceId === 'string' || raw.voiceId === null) doc.voiceId = raw.voiceId;
  if (isRecord(raw.settings)) {
    doc.settings = {
      lip_sync_enabled:
        typeof raw.settings.lip_sync_enabled === 'boolean'
          ? raw.settings.lip_sync_enabled
          : undefined,
      status_motions: raw.settings.status_motions,
      routines: raw.settings.routines,
    };
  }
  if (isRecord(raw.presence)) {
    return mergeParticipantPresenceV1(doc, parseParticipantPresenceV1(raw.presence));
  }
  return doc;
}

export function mergeParticipantPresenceV1(
  base: ParticipantPresenceV1 | null | undefined,
  patch: ParticipantPresenceV1 | null | undefined,
): ParticipantPresenceV1 {
  const a = base || { v: 1 as const };
  const b = patch || {};
  return {
    v: 1,
    vrmUrl: b.vrmUrl !== undefined ? b.vrmUrl : a.vrmUrl,
    vrmAssetId: b.vrmAssetId !== undefined ? b.vrmAssetId : a.vrmAssetId,
    vrmValidationStatus:
      b.vrmValidationStatus !== undefined ? b.vrmValidationStatus : a.vrmValidationStatus,
    gestureManifestUrl:
      b.gestureManifestUrl !== undefined ? b.gestureManifestUrl : a.gestureManifestUrl,
    gestureManifestAssetId:
      b.gestureManifestAssetId !== undefined
        ? b.gestureManifestAssetId
        : a.gestureManifestAssetId,
    gestureManifestValidationStatus:
      b.gestureManifestValidationStatus !== undefined
        ? b.gestureManifestValidationStatus
        : a.gestureManifestValidationStatus,
    defaultMood: b.defaultMood !== undefined ? b.defaultMood : a.defaultMood,
    clothes: b.clothes !== undefined ? b.clothes : a.clothes,
    fishVoiceId: b.fishVoiceId !== undefined ? b.fishVoiceId : a.fishVoiceId,
    voiceId: b.voiceId !== undefined ? b.voiceId : a.voiceId,
    settings: {
      ...(a.settings || {}),
      ...(b.settings || {}),
    },
  };
}

export function createPresenceStore(storageKeyPrefix: string): {
  get: (subjectId: string) => ParticipantPresenceV1 | null;
  set: (subjectId: string, doc: ParticipantPresenceV1) => void;
  clear: (subjectId: string) => void;
} {
  const keyFor = (id: string) => `${storageKeyPrefix}:presence:v1:${id}`;
  return {
    get(subjectId) {
      if (typeof localStorage === 'undefined') return null;
      try {
        const raw = localStorage.getItem(keyFor(subjectId));
        return raw ? parseParticipantPresenceV1(JSON.parse(raw)) : null;
      } catch {
        return null;
      }
    },
    set(subjectId, doc) {
      if (typeof localStorage === 'undefined') return;
      try {
        localStorage.setItem(keyFor(subjectId), JSON.stringify({ ...doc, v: 1 }));
      } catch {
        // quota / private mode
      }
    },
    clear(subjectId) {
      if (typeof localStorage === 'undefined') return;
      try {
        localStorage.removeItem(keyFor(subjectId));
      } catch {
        // ignore
      }
    },
  };
}

export function readPresenceFromProfile(profileLike: unknown): ParticipantPresenceV1 | null {
  if (!isRecord(profileLike)) return null;
  const nested = parseParticipantPresenceV1(profileLike.presence);
  const fromTop = parseParticipantPresenceV1({
    vrmUrl:
      typeof profileLike.vrmUrl === 'string'
        ? profileLike.vrmUrl
        : typeof profileLike.avatar3dUrl === 'string'
          ? profileLike.avatar3dUrl
          : null,
    voiceId: profileLike.voiceId,
    fishVoiceId: profileLike.fishVoiceId,
    defaultMood: profileLike.defaultMood,
    gestureManifestUrl: profileLike.gestureManifestUrl,
    settings: profileLike.settings,
  });
  return mergeParticipantPresenceV1(fromTop, nested);
}

/** Patch shape for publicProfile / user.profile soft fields. */
export function writePresenceIntoProfilePatch(doc: ParticipantPresenceV1): {
  presence?: ParticipantPresenceV1;
  vrmUrl?: string;
  avatar3dUrl?: string;
} {
  const patch: {
    presence?: ParticipantPresenceV1;
    vrmUrl?: string;
    avatar3dUrl?: string;
  } = { presence: { ...doc, v: 1 } };
  if (doc.vrmUrl) {
    patch.vrmUrl = doc.vrmUrl;
    patch.avatar3dUrl = doc.vrmUrl;
  }
  return patch;
}
