import { useCallback, useEffect, useState } from 'react';
import type { ParticipantPresenceV1 } from '../presence/participant-presence.js';

/** Same CDN sample as @nexus/character-kit DEFAULT_SAMPLE_VRM (avoid importing three into this chunk). */
export const FALLBACK_VOICE_VRM =
  'https://cdn.jsdelivr.net/gh/pixiv/three-vrm@dev/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm';

type CompanionHostLike = {
  speakWithLipSync: (stream: MediaStream, ctx?: AudioContext) => Promise<void>;
  stopLipSync: () => void;
  ensureLipSync?: (ctx?: AudioContext) => Promise<unknown>;
};

type CharacterReactModule = {
  CompanionCanvas: React.ComponentType<{
    vrmUrl?: string;
    gestureManifestUrl?: string;
    mood?: string;
    clothes?: unknown;
    lipSyncEnabled?: boolean;
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
  };
};

export type VoiceAvatarCanvasProps = {
  presence?: ParticipantPresenceV1 | null;
  /** When set, drives character-kit lip-sync (analysis only). Null stops. */
  playbackStream?: MediaStream | null;
  audioContext?: AudioContext | null;
  className?: string;
  style?: React.CSSProperties;
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
    const lipEnabled = presence?.settings?.lip_sync_enabled !== false;
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

  const fromPresence = presence
    ? mod.presenceToCompanionProps?.(presence) || {
        vrmUrl: presence.vrmUrl,
        gestureManifestUrl: presence.gestureManifestUrl,
        mood: presence.defaultMood || 'neutral',
        clothes: presence.clothes,
        lipSyncEnabled: presence.settings?.lip_sync_enabled !== false,
      }
    : null;

  const vrmUrl = fromPresence?.vrmUrl || FALLBACK_VOICE_VRM;
  const CompanionCanvas = mod.CompanionCanvas;

  return (
    <CompanionCanvas
      vrmUrl={vrmUrl}
      gestureManifestUrl={fromPresence?.gestureManifestUrl || undefined}
      mood={fromPresence?.mood || 'neutral'}
      clothes={fromPresence?.clothes}
      lipSyncEnabled={fromPresence?.lipSyncEnabled !== false}
      className={className}
      style={{ width: '100%', height: '100%', minHeight: 220, ...style }}
      onHostReady={handleHostReady}
    />
  );
}
