/**
 * Plan Part W2/W3 — host-side wake-engine bootstrap for the WebView.
 *
 * `@nexus/wake-word` is an optional peer. It is imported lazily so the default
 * text-messenger chunk stays free of ONNX/WASM assets, and so a host that hasn't
 * installed the package keeps working (wake stays `off`).
 *
 * USAGE: the *host* (e.g. `dev/webview-host.tsx`, or the app's WebView shell)
 * resolves the engine once and passes it to `createNexusChat({ wakeEngine })`.
 * For a `custom_sample` engine the host should also pass
 * `wakeArtifactFetcher` so the private wav refs can be enrolled on-device.
 *
 * TRUST: this only constructs an on-device engine. It never authenticates.
 */

import type { WakeWordEngineLike } from '@nexus/chat-core';

export type WakeEngineChoice = 'builtin' | 'custom_sample' | 'external';

/**
 * Load the on-device engine for the given wake config. Returns `null` when the
 * package (or a usable detector) is not installed — callers then leave wake off.
 */
export async function loadWakeEngine(opts: {
  engine?: string | null;
  /** Optional builtin ONNX runtime + model bytes injected by the host. */
  builtin?: { runtime: unknown; modelBytes: Uint8Array };
  /** Pre-computed custom-sample fingerprint (alternative to a private ref). */
  customSample?: { fingerprint: unknown };
}): Promise<WakeWordEngineLike | null> {
  try {
    const mod = (await import(/* webpackChunkName: "nexus-wake-word" */ '@nexus/wake-word')) as {
      createWakeWordEngine?: (deps?: unknown, kind?: WakeEngineChoice) => WakeWordEngineLike;
    };
    if (typeof mod.createWakeWordEngine !== 'function') return null;
    const kind: WakeEngineChoice =
      opts.engine === 'custom_sample' || opts.engine === 'external' ? opts.engine : 'builtin';
    return (
      mod.createWakeWordEngine(
        { builtin: opts.builtin, customSample: opts.customSample } as never,
        kind,
      ) || null
    );
  } catch {
    // Package not installed, or the runtime refused to load. Wake stays off.
    return null;
  }
}

/** True when a wake engine can be constructed at all on this host. */
export async function wakeEngineAvailable(): Promise<boolean> {
  const engine = await loadWakeEngine({});
  return Boolean(engine);
}
