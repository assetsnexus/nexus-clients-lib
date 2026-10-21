/**
 * Meeting voice contract (@nexus/meetings-core).
 *
 * Phase 11e: real-time audio chat with agents, in two modes — exactly like the
 * portal chat, and shared verbatim between the meeting `Scene`/media view and a
 * 1:1 agent DM:
 *
 *  - `realtime` — a WebRTC duplex session against the `gpt-realtime` model
 *    (`anx.inference.realtime.call.create` after
 *    `anx.agents.voice-channel.browser-call.create`). Lowest latency, native
 *    barge-in.
 *  - `pipeline` — classic STT → agent turn → TTS: the mic is transcribed (batch
 *    `anx.inference.stt.create` / live `anx.inference.stt.live-session.create`)
 *    and the agent reply is spoken with `anx.inference.tts.create`.
 *
 * The `pipeline` mode has an extra axis: the STT/TTS engines may run **on this
 * machine** (desktop-local Whisper / local TTS) instead of a cloud model. This
 * module defines the engine descriptor + resolution rules so a host can decide
 * whether a local model can satisfy the mode before it starts a session.
 *
 * Framework-free: the React adapter and native hosts consume this model.
 */

/** How agent audio is delivered. Mirrors the portal's two chat voice modes. */
export type MeetingVoiceMode = 'realtime' | 'pipeline';

/** Where an STT/TTS engine runs. */
export type VoiceEngineLocation = 'cloud' | 'local';

export type VoiceEngineKind = 'stt' | 'tts';

/**
 * A concrete voice engine the host can drive. `cloud` engines are region
 * models (`anx.inference.stt.models.list` rows); `local` engines are installed
 * on this machine (see the desktop local-model manager).
 */
export type VoiceEngine = {
  kind: VoiceEngineKind;
  location: VoiceEngineLocation;
  /** Region catalog id (`cloud`) or a local model id (`local`). */
  id: string;
  label: string;
  /**
   * API protocol the host speaks to the engine. Region models use the nexus
   * `anx.inference.*` protocol; local/self-hosted engines use a selectable
   * protocol (OpenAI-compatible, Whisper REST, Ollama, …).
   */
  protocol: VoiceEngineProtocol;
  /** Base URL for `local`/custom engines; null for region-managed models. */
  baseUrl: string | null;
};

/** API protocols a custom/self-hosted engine may speak. */
export type VoiceEngineProtocol =
  | 'nexus'
  | 'openai_audio'
  | 'whisper_rest'
  | 'ollama'
  | 'custom';

export type MeetingVoiceCapabilities = {
  /** Region advertises a realtime model (WebRTC duplex). */
  realtimeAvailable: boolean;
  /** A cloud STT model is entitled + runnable. */
  cloudSttAvailable: boolean;
  /** A cloud TTS model is entitled + runnable. */
  cloudTtsAvailable: boolean;
  /** A local STT engine is installed and can be started. */
  localSttAvailable: boolean;
  /** A local TTS engine is installed and can be started. */
  localTtsAvailable: boolean;
};

export const EMPTY_VOICE_CAPABILITIES: MeetingVoiceCapabilities = {
  realtimeAvailable: false,
  cloudSttAvailable: false,
  cloudTtsAvailable: false,
  localSttAvailable: false,
  localTtsAvailable: false,
};

/**
 * Which modes can actually be offered. Realtime needs a realtime model; the
 * pipeline needs *both* an STT and a TTS engine (local or cloud) — a TTS-only
 * setup can speak but cannot listen.
 */
export function availableVoiceModes(caps: MeetingVoiceCapabilities): MeetingVoiceMode[] {
  const modes: MeetingVoiceMode[] = [];
  if (caps.realtimeAvailable) modes.push('realtime');
  const stt = caps.cloudSttAvailable || caps.localSttAvailable;
  const tts = caps.cloudTtsAvailable || caps.localTtsAvailable;
  if (stt && tts) modes.push('pipeline');
  return modes;
}

/** Prefer realtime when available; otherwise the classic pipeline. */
export function preferredVoiceMode(caps: MeetingVoiceCapabilities): MeetingVoiceMode | null {
  const modes = availableVoiceModes(caps);
  if (modes.includes('realtime')) return 'realtime';
  if (modes.includes('pipeline')) return 'pipeline';
  return null;
}

/** Why a mode cannot be offered (for honest UI copy). */
export function voiceModeUnavailableReason(
  caps: MeetingVoiceCapabilities,
  mode: MeetingVoiceMode,
): string | null {
  if (mode === 'realtime') {
    return caps.realtimeAvailable ? null : 'No realtime voice model is available on this region.';
  }
  const stt = caps.cloudSttAvailable || caps.localSttAvailable;
  const tts = caps.cloudTtsAvailable || caps.localTtsAvailable;
  if (stt && tts) return null;
  if (!stt && !tts) return 'No speech-to-text or text-to-speech engine is available.';
  if (!stt) return 'No speech-to-text engine is available (the agent could speak but not listen).';
  return 'No text-to-speech engine is available (the agent could listen but not speak).';
}

/**
 * Resolve the STT + TTS engines for a pipeline session, preferring local
 * engines when asked and available (so the desktop can keep audio on-device and
 * avoid cloud tokens). Returns nulls for whichever side is missing.
 */
export function resolvePipelineEngines(
  input: {
    cloudStt?: VoiceEngine | null;
    cloudTts?: VoiceEngine | null;
    localStt?: VoiceEngine | null;
    localTts?: VoiceEngine | null;
  },
  opts: { preferLocal?: boolean } = {},
): { stt: VoiceEngine | null; tts: VoiceEngine | null; usedLocal: boolean } {
  const pick = (local: VoiceEngine | null | undefined, cloud: VoiceEngine | null | undefined) =>
    opts.preferLocal ? local ?? cloud ?? null : cloud ?? local ?? null;
  const stt = pick(input.localStt, input.cloudStt);
  const tts = pick(input.localTts, input.cloudTts);
  const usedLocal = stt?.location === 'local' || tts?.location === 'local';
  return { stt, tts, usedLocal };
}

/**
 * Whether the host should fall back from realtime to the pipeline. Realtime is
 * preferred, but a transport failure (WebRTC blocked, model error) must degrade
 * to STT/TTS rather than dead-end the call — same as the portal chat.
 */
export function shouldFallbackToPipeline(
  caps: MeetingVoiceCapabilities,
  realtimeFailed: boolean,
): boolean {
  if (!realtimeFailed) return false;
  return availableVoiceModes(caps).includes('pipeline');
}
