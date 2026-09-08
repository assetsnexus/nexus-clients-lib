import { ICE_GATHER_TIMEOUT_MS } from './types.js';

/** Resolve when ICE gathering completes (or timeout) so the SDP offer includes candidates. */
export function waitForIceGatheringComplete(pc: any, timeoutMs = ICE_GATHER_TIMEOUT_MS): Promise<void> {
  if (!pc) return Promise.resolve();
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') {
        cleanup();
        resolve();
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);
    const cleanup = () => {
      try {
        pc.removeEventListener?.('icegatheringstatechange', onChange);
      } catch {
        /* ignore */
      }
      clearTimeout(timer);
    };
    try {
      pc.addEventListener?.('icegatheringstatechange', onChange);
    } catch {
      cleanup();
      resolve();
    }
  });
}
