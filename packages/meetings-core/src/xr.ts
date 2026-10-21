/**
 * VR headset preview support (@nexus/meetings-core).
 *
 * The desktop app can preview a room's 3D scene in an attached headset. This is
 * a presentation capability, not a transport: we only ask the browser's WebXR
 * runtime whether an `immersive-vr` session can start, and report the reason
 * when it cannot. Kept pure (the `xr` object is injected) so it is testable
 * without a browser and reusable by portal/mobile adapters.
 */

/** Minimal shape of `navigator.xr` we depend on (WebXR `XRSystem` subset). */
export type XrSystemLike = {
  isSessionSupported?: (mode: string) => Promise<boolean>;
};

export type ImmersiveVrSupport =
  | { status: 'supported' }
  | { status: 'unsupported'; detail: string }
  | { status: 'unavailable'; detail: string };

export const IMMERSIVE_VR_MODE = 'immersive-vr';

/**
 * Resolve whether an immersive VR session can start. Never throws:
 * a missing `navigator.xr`, a rejection, or an explicit `false` all map to a
 * reportable status so the UI can show "Preview in VR headset" availability.
 */
export async function detectImmersiveVrSupport(xr: XrSystemLike | null | undefined): Promise<ImmersiveVrSupport> {
  if (!xr || typeof xr.isSessionSupported !== 'function') {
    return { status: 'unavailable', detail: 'This build has no WebXR runtime.' };
  }
  try {
    const ok = await xr.isSessionSupported(IMMERSIVE_VR_MODE);
    if (ok) return { status: 'supported' };
    return { status: 'unsupported', detail: 'No immersive VR headset is connected.' };
  } catch (err) {
    return { status: 'unavailable', detail: err instanceof Error ? err.message : 'WebXR probe failed.' };
  }
}
