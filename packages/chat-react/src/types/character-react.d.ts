declare module '@nexus/character-react' {
  import type { ComponentType, CSSProperties } from 'react';

  export type CompanionCanvasProps = {
    vrmUrl?: string;
    gestureManifestUrl?: string;
    mood?: string;
    clothes?: unknown;
    lipSyncEnabled?: boolean;
    className?: string;
    style?: CSSProperties;
    onHostReady?: (host: {
      speakWithLipSync: (stream: MediaStream, ctx?: AudioContext) => Promise<void>;
      stopLipSync: () => void;
      ensureLipSync?: (ctx?: AudioContext) => Promise<unknown>;
    } | null) => void;
  };

  export const CompanionCanvas: ComponentType<CompanionCanvasProps>;

  export function presenceToCompanionProps(p: {
    vrmUrl?: string | null;
    gestureManifestUrl?: string | null;
    defaultMood?: string | null;
    clothes?: unknown;
    settings?: { lip_sync_enabled?: boolean };
  }): {
    vrmUrl?: string | null;
    gestureManifestUrl?: string | null;
    mood?: string;
    clothes?: unknown;
    lipSyncEnabled?: boolean;
  };
}
