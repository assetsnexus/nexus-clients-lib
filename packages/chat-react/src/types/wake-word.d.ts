/**
 * Ambient types for the optional `@nexus/wake-word` peer.
 *
 * The package is imported lazily at runtime (`wake-engine-bootstrap.ts`) so that
 * hosts which do not install it keep working — wake simply stays `off`. Declaring
 * the module here keeps `tsc` happy without forcing a hard dependency.
 */
declare module '@nexus/wake-word' {
  export type WakeWordEngineKind = 'builtin' | 'custom_sample' | 'external';

  export type WakeWordEngineStatus = {
    kind: WakeWordEngineKind;
    status: string;
    message: string | null;
    detecting: boolean;
  };

  export type WakeArtifactFetcher = (ref: string) => Promise<ArrayBuffer>;

  export type WakeWordConfig = {
    enabled: boolean;
    phrase?: string;
    engine: WakeWordEngineKind;
    sensitivity?: number;
    requireUnlocked?: boolean;
    surfaces?: string[];
    modelId?: string;
    externalEngineId?: string;
    templateRef?: string;
    sampleRefs?: string[];
    onDeviceOnly?: boolean;
  };

  export interface WakeWordEngine {
    readonly kind: WakeWordEngineKind;
    readonly available: boolean;
    getStatus(): WakeWordEngineStatus;
    load(config: WakeWordConfig, fetchArtifact?: WakeArtifactFetcher): Promise<void>;
    start(onWake: (detection: { at: number; confidence: number | null; engineId: string }) => void): Promise<void>;
    stop(): void;
    dispose(): void;
  }

  export function createWakeWordEngine(
    deps?: Record<string, unknown>,
    kind?: WakeWordEngineKind,
  ): WakeWordEngine;

  export const WAKE_WORD_ALLOWED_ACTIONS: readonly string[];
  export const WAKE_WORD_TRUST: Record<string, boolean>;
  export function defaultWakeWordConfig(partial?: Record<string, unknown>): WakeWordConfig;
}
