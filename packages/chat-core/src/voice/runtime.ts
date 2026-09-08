import type { BrowserRealtimeCallRuntime } from './types.js';

let activeRuntime: BrowserRealtimeCallRuntime | null = null;

export function getBrowserRealtimeCallRuntime(): BrowserRealtimeCallRuntime | null {
  return activeRuntime;
}

export function setBrowserRealtimeCallRuntime(runtime: BrowserRealtimeCallRuntime | null): void {
  activeRuntime = runtime;
}

export function clearBrowserRealtimeCallRuntime(): void {
  activeRuntime = null;
}

/** Close WebRTC resources held by the module runtime (safe if refs were lost on remount). */
export function destroyBrowserRealtimeCallRuntime(): void {
  const rt = activeRuntime;
  if (!rt) return;
  if (rt.timerInterval) {
    clearInterval(rt.timerInterval);
    rt.timerInterval = null;
  }
  if (rt.connectTimeout) {
    clearTimeout(rt.connectTimeout);
    rt.connectTimeout = null;
  }
  try {
    rt.dc?.close?.();
  } catch {
    /* already closed */
  }
  try {
    rt.pc?.close?.();
  } catch {
    /* already closed */
  }
  try {
    rt.localStream?.getTracks?.().forEach((track: any) => {
      try {
        track.stop();
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }
  if (rt.audioEl) {
    try {
      rt.audioEl.srcObject = null;
      rt.audioEl.remove?.();
    } catch {
      /* ignore */
    }
  }
  clearBrowserRealtimeCallRuntime();
}

function isPeerConnectionUsable(pc: any): boolean {
  const state = pc?.connectionState;
  return state !== 'closed' && state !== 'failed';
}

export function isBrowserRealtimeCallConnected(agentId?: string | null): boolean {
  const rt = activeRuntime;
  if (!rt?.pc || !isPeerConnectionUsable(rt.pc)) return false;
  if (agentId && rt.agentId !== agentId) return false;
  const pcState = rt.pc.connectionState;
  if (pcState === 'connected' || pcState === 'connecting') return true;
  if (rt.dc?.readyState === 'open') return true;
  if (rt.status === 'live' || rt.status === 'paused') return true;
  return rt.status === 'connecting';
}

export function computeRuntimeElapsedSec(runtime: BrowserRealtimeCallRuntime): number {
  if (runtime.liveStartedAtMs == null) return runtime.elapsedSec;
  const liveSec = Math.floor((Date.now() - runtime.liveStartedAtMs) / 1000);
  return runtime.elapsedSec + liveSec;
}

export function syncRuntimeElapsed(runtime: BrowserRealtimeCallRuntime): number {
  const next = computeRuntimeElapsedSec(runtime);
  runtime.elapsedSec = next;
  runtime.liveStartedAtMs = Date.now();
  return next;
}

/** Stable delegates so WebRTC listeners survive UI remounts. */
let dcMessageHandler: ((raw: string) => void) | null = null;
let pcConnectionFailedHandler: ((reason: string) => void) | null = null;

export function setBrowserRealtimeCallHandlers(handlers: {
  onDcMessage: ((raw: string) => void) | null;
  onPcFailed: ((reason: string) => void) | null;
}): void {
  dcMessageHandler = handlers.onDcMessage;
  pcConnectionFailedHandler = handlers.onPcFailed;
}

export function attachBrowserRealtimePeerConnectionHandlers(pc: any): void {
  if (!pc) return;
  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    if (state === 'failed' || state === 'closed') {
      pcConnectionFailedHandler?.('WebRTC connection failed');
    }
  };
}

const attachedRealtimeDataChannels = new WeakSet<object>();

export function attachBrowserRealtimeDataChannelHandlers(dc: any): void {
  if (!dc || attachedRealtimeDataChannels.has(dc)) return;
  attachedRealtimeDataChannels.add(dc);
  dc.addEventListener?.('message', (e: { data?: unknown }) => {
    dcMessageHandler?.(String(e.data ?? ''));
  });
  dc.addEventListener?.('close', () => {
    /* channel closed — surface handled by peer state / endCall */
  });
  dc.addEventListener?.('error', () => {
    /* logged by session if needed */
  });
}

/** Mute / unmute without stopping the MediaStreamTrack (pause must not kill the track). */
export function applyLocalMute(runtime: BrowserRealtimeCallRuntime | null, muted: boolean): void {
  if (!runtime) return;
  runtime.muted = muted;
  if (runtime.localTrack) {
    runtime.localTrack.enabled = !muted;
  }
}

/** Pause keeps the PeerConnection alive; only disables mic + pauses remote audio element. */
export function applyLocalPause(runtime: BrowserRealtimeCallRuntime | null, paused: boolean): void {
  if (!runtime) return;
  runtime.paused = paused;
  runtime.status = paused ? 'paused' : 'live';
  if (paused) {
    applyLocalMute(runtime, true);
    try {
      runtime.audioEl?.pause?.();
    } catch {
      /* ignore */
    }
    if (runtime.timerInterval) {
      clearInterval(runtime.timerInterval);
      runtime.timerInterval = null;
    }
    syncRuntimeElapsed(runtime);
  } else {
    applyLocalMute(runtime, false);
    runtime.liveStartedAtMs = Date.now();
    void runtime.audioEl?.play?.()?.catch?.(() => {});
  }
}
