/**
 * Meeting voice session controller (@nexus/meetings-core).
 *
 * Phase 11e: one headless state machine drives *both* real-time voice modes and
 * is shared verbatim by the meeting view and the 1:1 agent DM in the desktop
 * app. It owns mode selection, the realtime→pipeline fallback, and the local vs
 * cloud engine choice; the side effects (WebRTC, mic capture, STT/TTS calls) are
 * injected adapters so the whole thing is framework-free and unit-testable.
 *
 * The controller never talks to a vendor directly and never renders UI — it just
 * answers "what should happen next" and emits surface snapshots that the React /
 * Vue adapters paint.
 */

import {
  availableVoiceModes,
  preferredVoiceMode,
  resolvePipelineEngines,
  shouldFallbackToPipeline,
  type MeetingVoiceCapabilities,
  type MeetingVoiceMode,
  type VoiceEngine,
} from './voice.js';

export type MeetingVoiceStatus =
  | 'idle'
  | 'connecting'
  | 'live'
  | 'paused'
  | 'error'
  | 'ended';

export type MeetingVoiceSurface = {
  mode: MeetingVoiceMode | null;
  status: MeetingVoiceStatus;
  active: boolean;
  muted: boolean;
  paused: boolean;
  /** True when a realtime attempt failed and the pipeline took over. */
  fellBack: boolean;
  /** Which engines the pipeline actually resolved (null in realtime mode). */
  stt: VoiceEngine | null;
  tts: VoiceEngine | null;
  usedLocal: boolean;
  errorMessage: string | null;
};

export const EMPTY_MEETING_VOICE_SURFACE: MeetingVoiceSurface = {
  mode: null,
  status: 'idle',
  active: false,
  muted: false,
  paused: false,
  fellBack: false,
  stt: null,
  tts: null,
  usedLocal: false,
  errorMessage: null,
};

/** A live realtime (WebRTC duplex) session; provided by the host. */
export type RealtimeSessionHandle = {
  /** Stop the session and release the mic / peer connection. */
  stop: () => void | Promise<void>;
  setMuted?: (muted: boolean) => void;
  setPaused?: (paused: boolean) => void;
};

/** A pipeline (STT → agent → TTS) session; provided by the host. */
export type PipelineSessionHandle = {
  stop: () => void | Promise<void>;
  setMuted?: (muted: boolean) => void;
};

export type MeetingVoiceSessionDeps = {
  /**
   * Start a realtime WebRTC session against the `gpt-realtime` model. Resolves
   * once the call is live; throws to trigger the pipeline fallback.
   */
  startRealtime: (input: {
    agentId: string;
    conversationId?: string | null;
    roomId?: string | null;
  }) => Promise<RealtimeSessionHandle>;
  /**
   * Start the pipeline session for the resolved engines. The host wires the mic
   * → STT → agent turn → TTS loop; this controller only picks the engines.
   */
  startPipeline: (input: {
    agentId: string;
    conversationId?: string | null;
    roomId?: string | null;
    stt: VoiceEngine | null;
    tts: VoiceEngine | null;
    preferLocal: boolean;
  }) => Promise<PipelineSessionHandle>;
  /** Whether a realtime model is entitled on this region. */
  capabilities: MeetingVoiceCapabilities;
  /** Preferred mode; defaults to `preferredVoiceMode(capabilities)`. */
  preferredMode?: MeetingVoiceMode | null;
  /** Cloud engines the region can serve (fallback when local is absent). */
  cloudStt?: VoiceEngine | null;
  cloudTts?: VoiceEngine | null;
  /** Local engines installed on this machine. */
  localStt?: VoiceEngine | null;
  localTts?: VoiceEngine | null;
  logger?: { warn?: Function; debug?: Function };
};

export type MeetingVoiceSession = {
  getSurface: () => MeetingVoiceSurface;
  subscribe: (listener: (surface: MeetingVoiceSurface) => void) => () => void;
  setCapabilities: (caps: MeetingVoiceCapabilities) => void;
  setEngines: (engines: {
    cloudStt?: VoiceEngine | null;
    cloudTts?: VoiceEngine | null;
    localStt?: VoiceEngine | null;
    localTts?: VoiceEngine | null;
  }) => void;
  setPreferredMode: (mode: MeetingVoiceMode | null) => void;
  start: (input: {
    agentId: string;
    conversationId?: string | null;
    roomId?: string | null;
    /** Override the auto-selected mode for this call. */
    mode?: MeetingVoiceMode | null;
    preferLocal?: boolean;
  }) => Promise<MeetingVoiceSurface>;
  toggleMute: () => boolean;
  pause: () => void;
  resume: () => void;
  pauseOrResume: () => void;
  stop: () => Promise<void>;
};

export function createMeetingVoiceSession(
  deps: MeetingVoiceSessionDeps,
): MeetingVoiceSession {
  let capabilities = deps.capabilities;
  let preferredMode = deps.preferredMode ?? null;
  let cloudStt = deps.cloudStt ?? null;
  let cloudTts = deps.cloudTts ?? null;
  let localStt = deps.localStt ?? null;
  let localTts = deps.localTts ?? null;
  let preferLocal = false;

  let surface: MeetingVoiceSurface = { ...EMPTY_MEETING_VOICE_SURFACE };
  let realtime: RealtimeSessionHandle | null = null;
  let pipeline: PipelineSessionHandle | null = null;
  const listeners = new Set<(s: MeetingVoiceSurface) => void>();

  function emit(patch: Partial<MeetingVoiceSurface> = {}): MeetingVoiceSurface {
    surface = { ...surface, ...patch };
    listeners.forEach((l) => {
      try {
        l(surface);
      } catch (err) {
        deps.logger?.warn?.('meeting voice listener failed', err);
      }
    });
    return surface;
  }

  function resolveMode(requested?: MeetingVoiceMode | null): MeetingVoiceMode | null {
    const modes = availableVoiceModes(capabilities);
    const wanted = requested ?? preferredMode;
    if (wanted && modes.includes(wanted)) return wanted;
    return preferredVoiceMode(capabilities);
  }

  function resolvedEngines() {
    return resolvePipelineEngines(
      { cloudStt, cloudTts, localStt, localTts },
      { preferLocal },
    );
  }

  async function stopHandles(): Promise<void> {
    const rt = realtime;
    const pl = pipeline;
    realtime = null;
    pipeline = null;
    if (rt) {
      try {
        await rt.stop();
      } catch {
        /* already gone */
      }
    }
    if (pl) {
      try {
        await pl.stop();
      } catch {
        /* already gone */
      }
    }
  }

  async function start(input: {
    agentId: string;
    conversationId?: string | null;
    roomId?: string | null;
    mode?: MeetingVoiceMode | null;
    preferLocal?: boolean;
  }): Promise<MeetingVoiceSurface> {
    if (input.preferLocal !== undefined) preferLocal = input.preferLocal;
    await stopHandles();

    const mode = resolveMode(input.mode);
    if (!mode) {
      return emit({
        status: 'error',
        active: false,
        errorMessage: 'Voice is unavailable: no realtime or STT/TTS engine is available.',
      });
    }

    if (mode === 'realtime') {
      emit({ mode, status: 'connecting', active: true, fellBack: false, errorMessage: null });
      try {
        realtime = await deps.startRealtime({
          agentId: input.agentId,
          conversationId: input.conversationId ?? null,
          roomId: input.roomId ?? null,
        });
        return emit({ status: 'live', active: true, paused: false });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'realtime call failed';
        deps.logger?.warn?.('realtime voice failed; falling back to pipeline', message);
        if (!shouldFallbackToPipeline(capabilities, true)) {
          return emit({ status: 'error', active: false, errorMessage: message });
        }
        return startPipeline(input, message);
      }
    }

    return startPipeline(input, null);
  }

  async function startPipeline(
    input: { agentId: string; conversationId?: string | null; roomId?: string | null },
    fallbackReason: string | null,
  ): Promise<MeetingVoiceSurface> {
    const engines = resolvedEngines();
    if (!engines.stt || !engines.tts) {
      return emit({
        mode: 'pipeline',
        status: 'error',
        active: false,
        stt: engines.stt,
        tts: engines.tts,
        usedLocal: engines.usedLocal,
        errorMessage:
          fallbackReason ??
          'STT/TTS is unavailable: both a speech-to-text and a text-to-speech engine are required.',
      });
    }
    emit({
      mode: 'pipeline',
      status: 'connecting',
      active: true,
      fellBack: fallbackReason != null,
      stt: engines.stt,
      tts: engines.tts,
      usedLocal: engines.usedLocal,
      errorMessage: null,
    });
    try {
      pipeline = await deps.startPipeline({
        agentId: input.agentId,
        conversationId: input.conversationId ?? null,
        roomId: input.roomId ?? null,
        stt: engines.stt,
        tts: engines.tts,
        preferLocal,
      });
      return emit({ status: 'live', active: true, paused: false });
    } catch (err) {
      return emit({
        status: 'error',
        active: false,
        errorMessage: err instanceof Error ? err.message : 'pipeline voice failed',
      });
    }
  }

  return {
    getSurface: () => surface,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setCapabilities(caps) {
      capabilities = caps;
    },
    setEngines(next) {
      if (next.cloudStt !== undefined) cloudStt = next.cloudStt;
      if (next.cloudTts !== undefined) cloudTts = next.cloudTts;
      if (next.localStt !== undefined) localStt = next.localStt;
      if (next.localTts !== undefined) localTts = next.localTts;
    },
    setPreferredMode(mode) {
      preferredMode = mode;
    },
    start,
    toggleMute() {
      const next = !surface.muted;
      realtime?.setMuted?.(next);
      pipeline?.setMuted?.(next);
      emit({ muted: next });
      return next;
    },
    pause() {
      if (!surface.active || surface.paused) return;
      realtime?.setPaused?.(true);
      emit({ paused: true, status: 'paused' });
    },
    resume() {
      if (!surface.active || !surface.paused) return;
      realtime?.setPaused?.(false);
      emit({ paused: false, status: 'live' });
    },
    pauseOrResume() {
      if (surface.paused) this.resume();
      else this.pause();
    },
    async stop() {
      await stopHandles();
      emit({
        status: 'idle',
        active: false,
        muted: false,
        paused: false,
      });
    },
  };
}
