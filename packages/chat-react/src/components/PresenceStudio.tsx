import { useMemo, useState } from 'react';
import {
  createPresenceStore,
  mergeParticipantPresenceV1,
  writePresenceIntoProfilePatch,
  type ParticipantPresenceV1,
} from '../presence/participant-presence.js';

export type PresenceStudioProps = {
  subjectId: string;
  initial?: ParticipantPresenceV1 | null;
  /** Host persists via existing profile/VE update commands using this patch. */
  onSave?: (doc: ParticipantPresenceV1, profilePatch: ReturnType<typeof writePresenceIntoProfilePatch>) => void;
};

const store = createPresenceStore('nexus-chat-react');

/**
 * Lightweight presence editor (VRM URL, mood, lip-sync, gesture manifest).
 * For full VRM canvas + routines use `@nexus/character-react` AvatarStudio and
 * pass results through the same ParticipantPresenceV1 helpers.
 */
export function PresenceStudio({ subjectId, initial, onSave }: PresenceStudioProps) {
  const seed = useMemo(
    () => mergeParticipantPresenceV1(store.get(subjectId), initial || { v: 1 }),
    [subjectId, initial],
  );
  const [doc, setDoc] = useState<ParticipantPresenceV1>(seed);

  const patch = (partial: Partial<ParticipantPresenceV1>) => {
    setDoc((prev) => mergeParticipantPresenceV1(prev, { ...partial, v: 1 }));
  };

  return (
    <div className="nexus-chat__admin" style={{ padding: 12, display: 'grid', gap: 10 }}>
      <h3 style={{ margin: 0 }}>Avatar presence</h3>
      <label>
        VRM URL
        <input
          className="nexus-chat__input"
          value={doc.vrmUrl || ''}
          onChange={(e) => patch({ vrmUrl: e.target.value || null })}
        />
      </label>
      <label>
        Gesture manifest URL
        <input
          className="nexus-chat__input"
          value={doc.gestureManifestUrl || ''}
          onChange={(e) => patch({ gestureManifestUrl: e.target.value || null })}
        />
      </label>
      <label>
        Default mood
        <input
          className="nexus-chat__input"
          value={doc.defaultMood || ''}
          onChange={(e) => patch({ defaultMood: e.target.value || null })}
        />
      </label>
      <label>
        Voice id
        <input
          className="nexus-chat__input"
          value={doc.voiceId || doc.fishVoiceId || ''}
          onChange={(e) => patch({ voiceId: e.target.value || null, fishVoiceId: e.target.value || null })}
        />
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={doc.settings?.lip_sync_enabled !== false}
          onChange={(e) =>
            patch({ settings: { ...doc.settings, lip_sync_enabled: e.target.checked } })
          }
        />
        Lip-sync enabled
      </label>
      <button
        type="button"
        className="nexus-chat__btn nexus-chat__btn--primary"
        onClick={() => {
          const next = { ...doc, v: 1 as const };
          store.set(subjectId, next);
          onSave?.(next, writePresenceIntoProfilePatch(next));
        }}
      >
        Save presence
      </button>
      <p style={{ fontSize: 12, color: 'var(--nx-chat-muted)', margin: 0 }}>
        Persists locally and emits a profile patch (`presence` + `vrmUrl` / `avatar3dUrl`) for existing
        update commands. Portal ClusterEditor reads the same fields.
      </p>
    </div>
  );
}
