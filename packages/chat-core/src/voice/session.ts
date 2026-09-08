import { waitForIceGatheringComplete } from './ice.js';
import {
  applyLocalMute,
  applyLocalPause,
  attachBrowserRealtimeDataChannelHandlers,
  attachBrowserRealtimePeerConnectionHandlers,
  computeRuntimeElapsedSec,
  destroyBrowserRealtimeCallRuntime,
  getBrowserRealtimeCallRuntime,
  isBrowserRealtimeCallConnected,
  setBrowserRealtimeCallHandlers,
  setBrowserRealtimeCallRuntime,
  syncRuntimeElapsed,
} from './runtime.js';
import {
  extractAssistantTranscript,
  extractUserTranscript,
  parseRealtimeDataChannelMessage,
} from './transcript.js';
import type {
  BrowserCallRuntimeOptions,
  BrowserRealtimeCallRuntime,
  BrowserRealtimeCallStatus,
  VoiceBridgeEventPayload,
  VoiceCallSurface,
} from './types.js';
import { CONNECT_TIMEOUT_MS } from './types.js';

export type BrowserCallSessionHooks = {
  onSurfaceChange?: (surface: VoiceCallSurface) => void;
  onTranscript?: (turn: {
    role: 'user' | 'assistant';
    text: string;
    dedupeKey: string;
  }) => void;
  onBridgeEvent?: (payload: VoiceBridgeEventPayload) => void | Promise<void>;
  onError?: (message: string) => void;
  onCreditsExhausted?: () => void;
  logger?: { debug?: Function; warn?: Function; error?: Function };
};

export type StartBrowserCallSessionInput = {
  agentId: string;
  callSid: string;
  conversationId?: string | null;
  /** SDP answer from anx.inference.realtime.call.create */
  negotiateAnswer: (localSdp: string) => Promise<{
    answerSdp: string;
    postConnectSessionUpdate?: Record<string, unknown> | null;
  }>;
  mediaConstraints?: Record<string, unknown>;
  runtimeOptions?: BrowserCallRuntimeOptions;
};

/**
 * Framework-free WebRTC browser call session.
 * PeerConnection lives in module-level runtime so UI remounts reattach instead of tearing down.
 */
export class BrowserCallSession {
  private hooks: BrowserCallSessionHooks;
  private seenUser = new Set<string>();
  private seenAssistant = new Set<string>();
  private mode: VoiceCallSurface['mode'] = 'browser';
  private failConnectRef: (message: string) => void = () => {};

  constructor(hooks: BrowserCallSessionHooks = {}) {
    this.hooks = hooks;
    this.bindHandlers();
  }

  setHooks(hooks: BrowserCallSessionHooks): void {
    this.hooks = { ...this.hooks, ...hooks };
    this.bindHandlers();
  }

  getSurface(): VoiceCallSurface {
    const rt = getBrowserRealtimeCallRuntime();
    if (!rt || !isBrowserRealtimeCallConnected(rt.agentId)) {
      return {
        status: 'idle',
        elapsedSec: 0,
        muted: false,
        paused: false,
        errorMessage: null,
        agentId: null,
        callSid: null,
        mode: this.mode,
      };
    }
    const status: BrowserRealtimeCallStatus =
      rt.dc?.readyState === 'open' && rt.status === 'connecting' ? 'live' : rt.status;
    return {
      status,
      elapsedSec: computeRuntimeElapsedSec(rt),
      muted: rt.muted,
      paused: rt.paused,
      errorMessage: null,
      agentId: rt.agentId,
      callSid: rt.callSid,
      mode: this.mode,
    };
  }

  /** Reattach listeners after UI remount without recreating the PeerConnection. */
  reattach(agentId?: string | null): boolean {
    this.bindHandlers();
    const rt = getBrowserRealtimeCallRuntime();
    if (!rt || !isBrowserRealtimeCallConnected(agentId ?? rt.agentId)) return false;
    if (rt.connectTimeout) {
      clearTimeout(rt.connectTimeout);
      rt.connectTimeout = null;
    }
    syncRuntimeElapsed(rt);
    this.emitSurface();
    if (rt.status === 'live' && !rt.timerInterval) {
      this.startElapsedTimer();
    }
    return true;
  }

  isConnected(agentId?: string | null): boolean {
    return isBrowserRealtimeCallConnected(agentId);
  }

  async start(input: StartBrowserCallSessionInput): Promise<BrowserRealtimeCallRuntime> {
    this.mode = 'browser';
    if (this.reattach(input.agentId)) {
      const existing = getBrowserRealtimeCallRuntime();
      if (existing) return existing;
    }
    this.teardownLocal(false);
    this.seenUser.clear();
    this.seenAssistant.clear();

    const opts = input.runtimeOptions || {};
    const createPeerConnection =
      opts.createPeerConnection ||
      ((config?: Record<string, unknown>) => new (globalThis as any).RTCPeerConnection(config));
    const getUserMedia =
      opts.getUserMedia ||
      ((constraints: Record<string, unknown>) => {
        const mediaDevices = (globalThis as any)?.navigator?.mediaDevices;
        if (!mediaDevices?.getUserMedia) {
          throw new Error('getUserMedia is unavailable in this environment');
        }
        return mediaDevices.getUserMedia(constraints);
      });

    const connectTimeout = setTimeout(() => {
      this.failConnectRef('Voice call timed out while connecting. Check microphone permission and try again.');
    }, CONNECT_TIMEOUT_MS);

    this.failConnectRef = (message: string) => {
      clearTimeout(connectTimeout);
      this.teardownLocal(true);
      this.hooks.onError?.(message);
      this.hooks.onBridgeEvent?.({ event: 'stream_error', text: message });
      this.emitSurface({ status: 'error', errorMessage: message });
    };

    try {
      void this.hooks.onBridgeEvent?.({ event: 'call_state', state: 'starting' });

      const stream = await getUserMedia(
        input.mediaConstraints || {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        },
      );
      const localTrack = stream.getAudioTracks?.()?.[0] ?? null;
      const pc = createPeerConnection(opts.rtcConfig);
      attachBrowserRealtimePeerConnectionHandlers(pc);

      const audioEl =
        opts.createAudioElement?.() ||
        ((globalThis as any).document
          ? (() => {
              const el = (globalThis as any).document.createElement('audio');
              el.autoplay = true;
              el.setAttribute('playsinline', 'true');
              el.style.display = 'none';
              (opts.documentBody || (globalThis as any).document.body)?.appendChild?.(el);
              return el;
            })()
          : null);

      if (audioEl) {
        pc.ontrack = (e: { streams?: any[] }) => {
          audioEl.srcObject = e.streams?.[0] ?? null;
          void audioEl.play?.()?.catch?.(() => {});
        };
      }

      if (localTrack) pc.addTrack(localTrack, stream);

      const dc = pc.createDataChannel('oai-events');
      attachBrowserRealtimeDataChannelHandlers(dc);
      dc.addEventListener?.('open', () => {
        this.markLive();
      });

      const runtime: BrowserRealtimeCallRuntime = {
        agentId: input.agentId,
        callSid: input.callSid,
        conversationId: input.conversationId ?? null,
        status: 'connecting',
        elapsedSec: 0,
        muted: false,
        paused: false,
        pc,
        dc,
        audioEl,
        localStream: stream,
        localTrack,
        timerInterval: null,
        connectTimeout,
        liveStartedAtMs: null,
      };
      setBrowserRealtimeCallRuntime(runtime);
      this.emitSurface();

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      await pc.setLocalDescription(offer);
      await waitForIceGatheringComplete(pc);
      const localSdp = String(pc.localDescription?.sdp || '').trim();
      if (!localSdp) throw new Error('Failed to create WebRTC offer');

      const negotiated = await input.negotiateAnswer(
        localSdp.endsWith('\n') ? localSdp : `${localSdp}\n`,
      );
      await pc.setRemoteDescription({ type: 'answer', sdp: negotiated.answerSdp });

      if (negotiated.postConnectSessionUpdate && dc.readyState === 'open') {
        this.sendDc(negotiated.postConnectSessionUpdate);
      }
      if (dc.readyState === 'open') {
        this.markLive();
      }

      return runtime;
    } catch (err) {
      clearTimeout(connectTimeout);
      const message = err instanceof Error ? err.message : 'Voice call failed';
      this.teardownLocal(true);
      this.hooks.onError?.(message);
      this.hooks.onBridgeEvent?.({ event: 'stream_error', text: message });
      this.emitSurface({ status: 'error', errorMessage: message });
      throw err;
    }
  }

  toggleMute(): boolean {
    const rt = getBrowserRealtimeCallRuntime();
    if (!rt) return false;
    const next = !rt.muted;
    applyLocalMute(rt, next);
    this.emitSurface();
    return next;
  }

  pause(): void {
    const rt = getBrowserRealtimeCallRuntime();
    if (!rt || (rt.status !== 'live' && rt.status !== 'paused')) return;
    applyLocalPause(rt, true);
    void this.hooks.onBridgeEvent?.({ event: 'call_state', state: 'paused' });
    this.emitSurface();
  }

  resume(): void {
    const rt = getBrowserRealtimeCallRuntime();
    if (!rt || rt.status !== 'paused') return;
    applyLocalPause(rt, false);
    this.startElapsedTimer();
    void this.hooks.onBridgeEvent?.({ event: 'call_state', state: 'live' });
    this.emitSurface();
  }

  pauseOrResume(): void {
    const rt = getBrowserRealtimeCallRuntime();
    if (!rt) return;
    if (rt.paused || rt.status === 'paused') this.resume();
    else this.pause();
  }

  /** Billing signal from region (no sidecar SCA). Ends live call when credits are exhausted. */
  signalCreditsAvailable(available: number | null | undefined): void {
    if (available == null) return;
    if (available > 0) return;
    const rt = getBrowserRealtimeCallRuntime();
    if (!rt) return;
    if (rt.status !== 'live' && rt.status !== 'connecting' && rt.status !== 'paused') return;
    this.hooks.onCreditsExhausted?.();
    this.failConnectRef('Call ended — insufficient credits.');
  }

  stop(): void {
    const rt = getBrowserRealtimeCallRuntime();
    if (rt) {
      void this.hooks.onBridgeEvent?.({ event: 'call_state', state: 'ended' });
    }
    this.teardownLocal(true);
    this.emitSurface({
      status: 'idle',
      elapsedSec: 0,
      muted: false,
      paused: false,
      errorMessage: null,
      agentId: null,
      callSid: null,
    });
  }

  private bindHandlers(): void {
    setBrowserRealtimeCallHandlers({
      onDcMessage: (raw) => this.handleDcMessage(raw),
      onPcFailed: (reason) => this.failConnectRef(reason),
    });
  }

  private handleDcMessage(raw: string): void {
    const event = parseRealtimeDataChannelMessage(raw);
    if (!event) return;
    const user = extractUserTranscript(event);
    if (user && !this.seenUser.has(user.dedupeKey)) {
      this.seenUser.add(user.dedupeKey);
      this.hooks.onTranscript?.({ role: 'user', text: user.text, dedupeKey: user.dedupeKey });
      void this.hooks.onBridgeEvent?.({
        event: 'user_utterance',
        text: user.text,
        utteranceId: user.dedupeKey,
      });
    }
    const assistant = extractAssistantTranscript(event);
    if (assistant && !this.seenAssistant.has(assistant.dedupeKey)) {
      this.seenAssistant.add(assistant.dedupeKey);
      this.hooks.onTranscript?.({
        role: 'assistant',
        text: assistant.text,
        dedupeKey: assistant.dedupeKey,
      });
      void this.hooks.onBridgeEvent?.({
        event: 'assistant_utterance',
        text: assistant.text,
        utteranceId: assistant.dedupeKey,
      });
    }
  }

  private markLive(): void {
    const rt = getBrowserRealtimeCallRuntime();
    if (!rt) return;
    if (rt.connectTimeout) {
      clearTimeout(rt.connectTimeout);
      rt.connectTimeout = null;
    }
    rt.status = 'live';
    rt.paused = false;
    rt.liveStartedAtMs = Date.now();
    this.startElapsedTimer();
    void this.hooks.onBridgeEvent?.({ event: 'call_state', state: 'live' });
    this.sendDc({
      type: 'session.update',
      session: {
        type: 'realtime',
        audio: {
          input: {
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 700,
              create_response: true,
              interrupt_response: true,
            },
          },
        },
      },
    });
    this.emitSurface();
  }

  private sendDc(payload: Record<string, unknown>): boolean {
    const rt = getBrowserRealtimeCallRuntime();
    const dc = rt?.dc;
    if (!dc || dc.readyState !== 'open') return false;
    try {
      dc.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  private startElapsedTimer(): void {
    const rt = getBrowserRealtimeCallRuntime();
    if (!rt) return;
    if (rt.timerInterval) {
      clearInterval(rt.timerInterval);
      rt.timerInterval = null;
    }
    rt.timerInterval = setInterval(() => {
      const current = getBrowserRealtimeCallRuntime();
      if (!current) return;
      current.elapsedSec = computeRuntimeElapsedSec(current);
      current.liveStartedAtMs = Date.now();
      this.emitSurface();
    }, 1000);
  }

  private teardownLocal(destroyRuntime: boolean): void {
    const rt = getBrowserRealtimeCallRuntime();
    if (rt?.connectTimeout) {
      clearTimeout(rt.connectTimeout);
      rt.connectTimeout = null;
    }
    if (destroyRuntime) {
      destroyBrowserRealtimeCallRuntime();
    }
  }

  private emitSurface(patch: Partial<VoiceCallSurface> = {}): void {
    const base = this.getSurface();
    this.hooks.onSurfaceChange?.({ ...base, ...patch });
  }
}

/**
 * Thin PeerConnection helper (offer/answer) kept for unit tests and low-level hosts.
 * Prefer {@link BrowserCallSession} for full SolarTome-grade call lifecycle.
 */
export class BrowserCallRuntime {
  readonly peer: any;
  private readonly getUserMediaImpl: (constraints: Record<string, unknown>) => Promise<any>;
  private localStream: any | null = null;

  constructor(opts: BrowserCallRuntimeOptions = {}) {
    const createPeerConnection =
      opts.createPeerConnection ||
      ((config?: Record<string, unknown>) => new (globalThis as any).RTCPeerConnection(config));
    const getUserMedia =
      opts.getUserMedia ||
      ((constraints: Record<string, unknown>) => {
        const mediaDevices = (globalThis as any)?.navigator?.mediaDevices;
        if (!mediaDevices?.getUserMedia) {
          throw new Error('getUserMedia is unavailable in this environment');
        }
        return mediaDevices.getUserMedia(constraints);
      });

    this.peer = createPeerConnection(opts.rtcConfig);
    this.getUserMediaImpl = getUserMedia;
  }

  async startLocalAudio(constraints: Record<string, unknown> = { audio: true }): Promise<any> {
    const stream = await this.getUserMediaImpl(constraints);
    this.localStream = stream;
    for (const track of stream.getTracks()) {
      this.peer.addTrack(track, stream);
    }
    return stream;
  }

  async createOffer(): Promise<string> {
    const offer = await this.peer.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
    });
    await this.peer.setLocalDescription(offer);
    await waitForIceGatheringComplete(this.peer);
    return offer.sdp || '';
  }

  async acceptAnswer(sdp: string, type: 'answer' | 'offer' | 'pranswer' | 'rollback' = 'answer'): Promise<void> {
    await this.peer.setRemoteDescription({ type, sdp });
  }

  setMuted(muted: boolean): void {
    this.localStream?.getAudioTracks?.().forEach((track: any) => {
      track.enabled = !muted;
    });
  }

  close(): void {
    try {
      this.localStream?.getTracks().forEach((track: any) => track.stop());
      this.peer.close();
    } catch {
      /* ignore */
    } finally {
      this.localStream = null;
    }
  }
}
