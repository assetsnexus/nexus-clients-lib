import { useCallback, useEffect, useState } from 'react';
import type { ParticipantPresenceV1 } from '../presence/participant-presence.js';
import {
  readEmbodimentProfile,
  resolveEmbodimentFace,
  embodimentLipSyncEnabled,
} from './embodiment-playback.js';

/** Same CDN sample as @nexus/character-kit DEFAULT_SAMPLE_VRM (avoid importing three into this chunk). */
export const FALLBACK_VOICE_VRM =
  'https://cdn.jsdelivr.net/gh/pixiv/three-vrm@dev/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm';

export type CompanionHostLike = {
  speakWithLipSync: (stream: MediaStream, ctx?: AudioContext) => Promise<void>;
  stopLipSync: () => void;
  ensureLipSync?: (ctx?: AudioContext) => Promise<unknown>;
  /** Plan Part C1 — play inline embodiment tags from assistant text. */
  playInlineTags?: (
    text: string,
    opts?: { enabled?: boolean; source?: string; locomotionOnly?: boolean },
  ) => Promise<unknown>;
  /** Plan Part C1 — embodiment-aware variant (applies face caps + zen mode). */
  playEmbodimentInlineTags?: (
    text: string,
    opts?: { enabled?: boolean; source?: string; locomotionOnly?: boolean; face?: 'public' | 'owner' },
  ) => Promise<unknown>;
  /** Plan Part C1 — greeting / farewell / onListen / onThink routine. */
  playEmbodimentRoutine?: (
    name: string,
    opts?: { source?: string; face?: 'public' | 'owner' },
  ) => Promise<boolean>;
  setEmbodiment?: (
    profile: Record<string, unknown> | null,
    opts?: { face?: 'public' | 'owner' },
  ) => { moods: string[]; mood: string | null };
  setEmbodimentFace?: (face: 'public' | 'owner') => void;
  getEmbodimentFace?: () => 'public' | 'owner';
  pausePresence?: (reason?: string) => void;
  resumePresence?: () => void;
  /**
   * Character tool execution (`character_*` / locomotion / scene). Present on the
   * flat companion host and the scene host; drives the desktop tool pack.
   */
  runToolCall?: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ ok: boolean; name: string; message: string; data?: Record<string, unknown> }>;
  /** Loaded clip catalogue (gesture tester). */
  listLoadedGestures?: () => Array<{
    id: string;
    durationMs: number | null;
    loop: boolean;
    overlay: boolean;
    description?: string;
  }>;
  /** Action-feed subscription (motion feed). */
  onAction?: (listener: (ev: unknown) => void) => () => void;
};

type CharacterReactModule = {
  CompanionCanvas: React.ComponentType<{
    vrmUrl?: string;
    gestureManifestUrl?: string;
    mood?: string;
    clothes?: unknown;
    lipSyncEnabled?: boolean;
    embodiment?: Record<string, unknown> | null;
    embodimentFace?: 'public' | 'owner';
    className?: string;
    style?: React.CSSProperties;
    onHostReady?: (host: CompanionHostLike | null) => void;
    /** Catalog gate for `vrmUrl` — required for a non-platform VRM to be fetched. */
    validationStatus?: string | null;
    previewUnverified?: boolean;
  }>;
  CompanionSceneCanvas?: React.ComponentType<{
    presence?: ParticipantPresenceV1 | null;
    className?: string;
    style?: React.CSSProperties;
    onHostReady?: (host: CompanionHostLike | null) => void;
  }>;
  presenceToCompanionProps?: (p: ParticipantPresenceV1) => {
    vrmUrl?: string | null;
    gestureManifestUrl?: string | null;
    mood?: string;
    clothes?: unknown;
    lipSyncEnabled?: boolean;
    embodiment?: Record<string, unknown> | null;
    validationStatus?: string | null;
  };
};

export type VoiceAvatarHost = CompanionHostLike;

/**
 * CompanionCanvas props derived from a presence payload. `validationStatus` is
 * carried straight through — the character-kit gate
 * (`avatar-asset-gate.ts`) refuses to HTTP-fetch a non-platform VRM without it,
 * so dropping it silently kills catalog 3D avatars.
 */
export type VoiceAvatarMappedProps = {
  vrmUrl: string;
  gestureManifestUrl?: string;
  mood: string;
  clothes?: unknown;
  lipSyncEnabled: boolean;
  embodiment: Record<string, unknown> | null;
  validationStatus: string | null;
};

type PresenceToCompanionPropsFn = NonNullable<CharacterReactModule['presenceToCompanionProps']>;

/**
 * Pure presence → CompanionCanvas prop mapping (same chain `VoiceAvatarCanvas`
 * renders). Exported so the `validationStatus` pass-through is unit-testable
 * without loading Three.js / `@nexus/character-react`.
 *
 * Falls back to reading the presence fields directly when the loaded module does
 * not expose `presenceToCompanionProps` (older / partial builds) — and in that
 * fallback it must still carry `vrmValidationStatus`.
 */
export function mapPresenceToVoiceAvatarProps(
  presence: ParticipantPresenceV1 | null | undefined,
  presenceToCompanionProps?: PresenceToCompanionPropsFn | null,
): VoiceAvatarMappedProps | null {
  if (!presence) return null;
  const fromPresence = presenceToCompanionProps?.(presence) || {
    vrmUrl: presence.vrmUrl,
    gestureManifestUrl: presence.gestureManifestUrl,
    mood: presence.defaultMood || 'neutral',
    clothes: presence.clothes,
    lipSyncEnabled: presence.settings?.lip_sync_enabled !== false,
    // Carry the catalog gate status through: without it the character-kit gate
    // refuses a non-platform VRM (`missing_validation_status`) and 3D avatars
    // silently drop. Mirrors `presenceToCompanionProps`.
    validationStatus: presence.vrmValidationStatus ?? null,
  };
  const embodimentProfile = readEmbodimentProfile(presence);
  return {
    vrmUrl: fromPresence.vrmUrl || FALLBACK_VOICE_VRM,
    gestureManifestUrl: fromPresence.gestureManifestUrl || undefined,
    mood: fromPresence.mood || 'neutral',
    clothes: fromPresence.clothes,
    lipSyncEnabled: fromPresence.lipSyncEnabled !== false,
    embodiment: embodimentProfile ?? fromPresence.embodiment ?? null,
    validationStatus: fromPresence.validationStatus ?? presence.vrmValidationStatus ?? null,
  };
}

export type VoiceAvatarCanvasProps = {
  presence?: ParticipantPresenceV1 | null;
  /** When set, drives character-kit lip-sync (analysis only). Null stops. */
  playbackStream?: MediaStream | null;
  audioContext?: AudioContext | null;
  className?: string;
  style?: React.CSSProperties;
  /** Render the walkable SceneRoom stage instead of the flat companion canvas. */
  sceneMode?: boolean;
  onHostReady?: (host: CompanionHostLike | null) => void;
};

/**
 * Lazily loads `@nexus/character-react` + Three/VRM only when the voice avatar
 * pane mounts — keeps the default text messenger chunk free of Three.js.
 */
export function VoiceAvatarCanvas({
  presence,
  playbackStream,
  audioContext,
  className,
  style,
  sceneMode = false,
  onHostReady,
}: VoiceAvatarCanvasProps) {
  const [mod, setMod] = useState<CharacterReactModule | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [host, setHost] = useState<CompanionHostLike | null>(null);
  const onHostReadyProp = onHostReady;
  const handleHostReady = useCallback(
    (next: CompanionHostLike | null) => {
      setHost(next);
      onHostReadyProp?.(next);
    },
    [onHostReadyProp],
  );

  useEffect(() => {
    let cancelled = false;
    void import(
      /* webpackChunkName: "nexus-character-react" */
      '@nexus/character-react'
    )
      .then((m) => {
        if (!cancelled) setMod(m as unknown as CharacterReactModule);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load avatar module');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!host) return;
    // Embodiment profile can force lip-sync off; presence setting wins otherwise.
    const profileLip = embodimentLipSyncEnabled(readEmbodimentProfile(presence));
    const lipEnabled =
      profileLip === false ? false : presence?.settings?.lip_sync_enabled !== false;
    if (!lipEnabled || !playbackStream) {
      host.stopLipSync();
      return;
    }
    void (async () => {
      try {
        if (audioContext) {
          await host.ensureLipSync?.(audioContext);
        }
        await host.speakWithLipSync(playbackStream, audioContext || undefined);
      } catch {
        /* lip-sync warm-up / worklet may fail before user gesture */
      }
    })();
  }, [host, playbackStream, audioContext, presence?.settings?.lip_sync_enabled]);

  if (loadError) {
    return (
      <div className={className} style={{ padding: 12, color: 'var(--nx-chat-muted)', ...style }}>
        Avatar unavailable: {loadError}
      </div>
    );
  }

  if (!mod) {
    return (
      <div className={className} style={{ padding: 12, color: 'var(--nx-chat-muted)', ...style }}>
        Loading 3D avatar…
      </div>
    );
  }

  const mapped = mapPresenceToVoiceAvatarProps(
    presence,
    mod.presenceToCompanionProps as PresenceToCompanionPropsFn | undefined,
  );

  const paneStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    minHeight: 220,
    ...style,
  };

  // Scene mode: the walkable companion stage (ground grid + room bounds) so the
  // character tools (`character_walk` / `approach` / `turn_to`) are visibly
  // meaningful. Falls back to the flat canvas when the build has no scene
  // component (older `@nexus/character-react` dist).
  const SceneCanvas = mod.CompanionSceneCanvas;
  if (sceneMode && SceneCanvas) {
    return (
      <SceneCanvas
        presence={presence}
        className={className}
        style={paneStyle}
        onHostReady={handleHostReady}
      />
    );
  }

  const CompanionCanvas = mod.CompanionCanvas;

  return (
    <CompanionCanvas
      vrmUrl={mapped?.vrmUrl ?? FALLBACK_VOICE_VRM}
      gestureManifestUrl={mapped?.gestureManifestUrl}
      mood={mapped?.mood ?? 'neutral'}
      clothes={mapped?.clothes}
      lipSyncEnabled={mapped?.lipSyncEnabled !== false}
      embodiment={mapped?.embodiment ?? null}
      embodimentFace={resolveEmbodimentFace(presence)}
      validationStatus={mapped?.validationStatus ?? null}
      className={className}
      style={paneStyle}
      onHostReady={handleHostReady}
    />
  );
}
