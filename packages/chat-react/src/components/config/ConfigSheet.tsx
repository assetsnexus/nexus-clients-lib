import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CommandClient } from '@nexus/chat-core';
import {
  createPresenceStore,
  mergeParticipantPresenceV1,
  writePresenceIntoProfilePatch,
  type ParticipantPresenceV1,
} from '../../presence/participant-presence.js';
import { presencePatchFromCatalogAsset } from './presencePatchFromCatalogAsset.js';
import { CachedAvatarImage, isPictureCatalogAsset } from '../CachedAvatarImage.js';

const store = createPresenceStore('nexus-chat-react');

export type ConfigSubject =
  | { kind: 'me'; id: 'me'; label: string }
  | { kind: 'agent'; id: string; label: string };

export type AvatarAssetRow = {
  id: string;
  ownerId?: string | null;
  license?: string | null;
  visibility?: 'public' | 'private' | string;
  validationStatus?: 'pending_admin' | 'rejected' | 'verified' | string;
  url?: string | null;
  kind?: 'vrm' | 'vrma' | string;
  details?: {
    clamav?: unknown;
    aiReview?: unknown;
  };
};

export type ConfigSheetProps = {
  open: boolean;
  onClose: () => void;
  client?: CommandClient;
  /** When true, show admin set-validation control. */
  isAdmin?: boolean;
  currentUserId?: string | null;
};

function unwrapList(result: unknown): unknown[] {
  if (!result || typeof result !== 'object') return [];
  const r = result as Record<string, unknown>;
  const data = (r.responseObject ?? r.data ?? r) as Record<string, unknown> | unknown[];
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const items = (data as { items?: unknown; assets?: unknown }).items ||
      (data as { assets?: unknown }).assets;
    if (Array.isArray(items)) return items;
  }
  return [];
}

function asAsset(row: unknown): AvatarAssetRow | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : typeof r._id === 'string' ? r._id : null;
  if (!id) return null;
  return {
    id,
    ownerId: typeof r.ownerId === 'string' ? r.ownerId : null,
    license: typeof r.license === 'string' ? r.license : null,
    visibility: typeof r.visibility === 'string' ? r.visibility : undefined,
    validationStatus: typeof r.validationStatus === 'string' ? r.validationStatus : undefined,
    url: typeof r.url === 'string' ? r.url : typeof r.serveUrl === 'string' ? r.serveUrl : null,
    kind: typeof r.kind === 'string' ? r.kind : undefined,
    details: r.details && typeof r.details === 'object' ? (r.details as AvatarAssetRow['details']) : {},
  };
}

export function ConfigSheet({ open, onClose, client, isAdmin, currentUserId }: ConfigSheetProps) {
  const [agents, setAgents] = useState<ConfigSubject[]>([]);
  const [subjectId, setSubjectId] = useState('me');
  const [doc, setDoc] = useState<ParticipantPresenceV1>({ v: 1 });
  const [assets, setAssets] = useState<AvatarAssetRow[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const subjects: ConfigSubject[] = useMemo(
    () => [{ kind: 'me', id: 'me', label: 'Me' }, ...agents],
    [agents],
  );

  const loadAgents = useCallback(async () => {
    if (!client?.send) return;
    try {
      const result = await client.send('anx.ai-agents.virtual-employees.list', {});
      const rows = unwrapList(result);
      setAgents(
        rows
          .map((row) => {
            if (!row || typeof row !== 'object') return null;
            const r = row as Record<string, unknown>;
            const id = String(r.id || r._id || r.virtualEmployeeId || '');
            if (!id) return null;
            const label = String(r.displayName || r.name || id);
            return { kind: 'agent' as const, id, label };
          })
          .filter((x): x is ConfigSubject & { kind: 'agent' } => Boolean(x)),
      );
    } catch {
      setAgents([]);
    }
  }, [client]);

  const loadCatalog = useCallback(async () => {
    if (!client?.send) return;
    setCatalogError(null);
    try {
      const result = await client.send('anx.inference.avatar-assets.list', {});
      const rows = unwrapList(result)
        .map(asAsset)
        .filter((x): x is AvatarAssetRow => Boolean(x));
      const uid = currentUserId || null;
      setAssets(
        rows.filter(
          (a) =>
            a.visibility === 'public' && a.validationStatus === 'verified'
              ? true
              : uid != null && a.ownerId === uid,
        ),
      );
    } catch (e) {
      setCatalogError(
        e instanceof Error
          ? e.message
          : 'Avatar catalog unavailable (commands may not be deployed yet).',
      );
      setAssets([]);
    }
  }, [client, currentUserId]);

  useEffect(() => {
    if (!open) return;
    void loadAgents();
    void loadCatalog();
  }, [open, loadAgents, loadCatalog]);

  useEffect(() => {
    const seed = store.get(subjectId) || { v: 1 as const };
    setDoc(mergeParticipantPresenceV1(seed, { v: 1 }));
    setSaveError(null);
    setSaveOk(null);
  }, [subjectId]);

  if (!open) return null;

  const patch = (partial: Partial<ParticipantPresenceV1>) => {
    setDoc((prev: ParticipantPresenceV1) => mergeParticipantPresenceV1(prev, { ...partial, v: 1 }));
  };

  const save = async () => {
    if (doc.vrmUrl && String(doc.vrmUrl).startsWith('blob:')) {
      setSaveError('Do not save blob: URLs. Upload an asset to the catalog first.');
      return;
    }
    if (doc.gestureManifestUrl && String(doc.gestureManifestUrl).startsWith('blob:')) {
      setSaveError('Do not save blob: URLs. Upload an asset to the catalog first.');
      return;
    }
    setBusy(true);
    setSaveError(null);
    setSaveOk(null);
    const next = { ...doc, v: 1 as const };
    store.set(subjectId, next);
    const profilePatch = writePresenceIntoProfilePatch(next);
    try {
      if (!client?.send) {
        setSaveOk('Saved locally (no command client).');
        return;
      }
      if (subjectId === 'me') {
        const result = (await client.send('anx.users.profile.update', {
          profile: profilePatch,
          ...profilePatch,
        })) as { ok?: boolean; message?: string };
        if (result?.ok === false) {
          setSaveError(result.message || 'Profile update failed');
          return;
        }
      } else {
        const result = (await client.send('anx.ai-agents.virtual-employees.update', {
          id: subjectId,
          employeeId: subjectId,
          presence: profilePatch.presence,
          vrmUrl: profilePatch.vrmUrl,
          avatar3dUrl: profilePatch.avatar3dUrl,
          publicProfile: profilePatch,
        })) as { ok?: boolean; message?: string };
        if (result?.ok === false) {
          setSaveError(result.message || 'Agent update failed');
          return;
        }
      }
      setSaveOk('Saved');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const uploadAsset = async (file: File | null) => {
    if (!file || !client?.send) return;
    setUploadError(null);
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
      const dataBase64 = btoa(binary);
      const lower = file.name.toLowerCase();
      const kind = lower.endsWith('.vrma')
        ? 'vrma'
        : lower.endsWith('.vrm')
          ? 'vrm'
          : undefined;
      const result = (await client.send('anx.inference.avatar-assets.upload', {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        dataBase64,
        visibility: 'private',
        license: 'owner',
        ...(kind ? { kind } : {}),
      })) as {
        ok?: boolean;
        message?: string;
        data?: {
          url?: string;
          id?: string;
          kind?: string;
          validationStatus?: string;
        };
        responseObject?: {
          url?: string;
          id?: string;
          kind?: string;
          validationStatus?: string;
        };
      };
      if (result?.ok === false) {
        setUploadError(result.message || 'Upload failed (catalog may not be deployed yet).');
        return;
      }
      const row = result.responseObject || result.data;
      const id = row && typeof row.id === 'string' ? row.id : null;
      if (id) {
        const presencePatch = presencePatchFromCatalogAsset({
          id,
          url: row?.url,
          kind: row?.kind || kind,
          validationStatus: row?.validationStatus || 'pending_admin',
        });
        if (presencePatch) patch(presencePatch);
        else setUploadError('Upload did not return a catalog URL.');
      } else {
        setUploadError('Upload did not return a catalog asset id.');
      }
      await loadCatalog();
    } catch (e) {
      setUploadError(
        e instanceof Error ? e.message : 'Upload failed (catalog may not be deployed yet).',
      );
    } finally {
      setBusy(false);
    }
  };

  const setValidation = async (assetId: string, validationStatus: 'verified' | 'rejected') => {
    if (!client?.send || !isAdmin) return;
    setBusy(true);
    try {
      await client.send('anx.inference.avatar-assets.set-validation', {
        assetId,
        validationStatus,
      });
      await loadCatalog();
    } catch (e) {
      setCatalogError(e instanceof Error ? e.message : 'set-validation failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nexus-chat__sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="nexus-chat__sheet nexus-chat__config-sheet"
        role="dialog"
        aria-label="Chat config"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="nexus-chat__sheet-header">
          <strong>Config</strong>
          <button type="button" className="nexus-chat__btn" onClick={onClose}>
            ×
          </button>
        </div>

        <label className="nexus-chat__config-field">
          Subject
          <select
            className="nexus-chat__input"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="nexus-chat__config-field">
          VRM URL
          <input
            className="nexus-chat__input"
            value={doc.vrmUrl || ''}
            onChange={(e) => {
              const next = e.target.value || null;
              if (next?.startsWith('blob:')) {
                setUploadError('blob: URLs are not allowed — upload via the catalog.');
                return;
              }
              patch({
                vrmUrl: next,
                vrmAssetId: null,
                vrmValidationStatus: null,
              });
            }}
            placeholder="https://… (no blob:)"
          />
        </label>
        <label className="nexus-chat__config-field">
          Gesture manifest URL
          <input
            className="nexus-chat__input"
            value={doc.gestureManifestUrl || ''}
            onChange={(e) => {
              const next = e.target.value || null;
              if (next?.startsWith('blob:')) {
                setUploadError('blob: URLs are not allowed — upload via the catalog.');
                return;
              }
              patch({
                gestureManifestUrl: next,
                gestureManifestAssetId: null,
                gestureManifestValidationStatus: null,
              });
            }}
          />
        </label>
        <label className="nexus-chat__config-field">
          Default mood
          <input
            className="nexus-chat__input"
            value={doc.defaultMood || ''}
            onChange={(e) => patch({ defaultMood: e.target.value || null })}
          />
        </label>
        <label className="nexus-chat__config-field">
          Voice id
          <input
            className="nexus-chat__input"
            value={doc.voiceId || doc.fishVoiceId || ''}
            onChange={(e) =>
              patch({ voiceId: e.target.value || null, fishVoiceId: e.target.value || null })
            }
          />
        </label>
        <label className="nexus-chat__config-field nexus-chat__config-check">
          <input
            type="checkbox"
            checked={doc.settings?.lip_sync_enabled !== false}
            onChange={(e) =>
              patch({ settings: { ...doc.settings, lip_sync_enabled: e.target.checked } })
            }
          />
          Lip-sync enabled
        </label>

        <section className="nexus-chat__context-section">
          <h4>Avatar catalog</h4>
          {catalogError ? <div className="nexus-chat__error">{catalogError}</div> : null}
          <input
            type="file"
            accept=".vrm,.vrma,model/*,*/*"
            disabled={busy || !client}
            onChange={(e) => void uploadAsset(e.target.files?.[0] || null)}
          />
          {uploadError ? <div className="nexus-chat__error">{uploadError}</div> : null}
          <ul className="nexus-chat__asset-list">
            {assets.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className="nexus-chat__btn"
                  disabled={!a.url || a.url.startsWith('blob:')}
                  onClick={() => {
                    const presencePatch = presencePatchFromCatalogAsset(a);
                    if (presencePatch) patch(presencePatch);
                  }}
                >
                  Use
                </button>
                {isPictureCatalogAsset(a) && a.url && !a.url.startsWith('blob:') ? (
                  <CachedAvatarImage
                    src={a.url}
                    assetId={a.id}
                    alt=""
                    className="nexus-chat__asset-thumb"
                    style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }}
                  />
                ) : null}
                <div>
                  <div>
                    {a.kind || 'asset'} · {a.validationStatus || '—'} · {a.visibility || '—'}
                  </div>
                  <div className="nexus-chat__muted">
                    owner {a.ownerId || '—'} · license {a.license || '—'}
                  </div>
                  <div className="nexus-chat__muted">
                    clamav: {a.details?.clamav == null ? '—' : JSON.stringify(a.details.clamav)}
                  </div>
                  <div className="nexus-chat__muted">
                    aiReview: {a.details?.aiReview == null ? 'null' : JSON.stringify(a.details.aiReview)}
                  </div>
                </div>
                {isAdmin ? (
                  <div className="nexus-chat__grant-actions">
                    <button
                      type="button"
                      className="nexus-chat__btn"
                      disabled={busy}
                      onClick={() => void setValidation(a.id, 'verified')}
                    >
                      Verify
                    </button>
                    <button
                      type="button"
                      className="nexus-chat__btn"
                      disabled={busy}
                      onClick={() => void setValidation(a.id, 'rejected')}
                    >
                      Reject
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <div className="nexus-chat__sheet-actions">
          <button
            type="button"
            className="nexus-chat__btn nexus-chat__btn--primary"
            disabled={busy}
            onClick={() => void save()}
          >
            Save presence
          </button>
        </div>
        {saveError ? <div className="nexus-chat__error">{saveError}</div> : null}
        {saveOk ? <div className="nexus-chat__muted">{saveOk}</div> : null}
      </div>
    </div>
  );
}
