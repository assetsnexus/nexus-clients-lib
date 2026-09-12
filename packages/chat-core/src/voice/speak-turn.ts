import { createAndPollTts, playAudioUrl, type TtsPlaybackResult } from './stt-tts.js';

type SendResult =
  | { ok: true; data?: unknown; kind?: string }
  | {
      ok: false;
      kind: string;
      message?: string;
      [key: string]: unknown;
    };

type CommandClient = {
  send: (
    command: string,
    payload?: Record<string, unknown>,
    opts?: { requestId?: string },
  ) => Promise<SendResult | unknown>;
};

function unwrapData(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object') return {};
  const r = result as Record<string, unknown>;
  if (r.data && typeof r.data === 'object') return r.data as Record<string, unknown>;
  if (r.responseObject && typeof r.responseObject === 'object') {
    return r.responseObject as Record<string, unknown>;
  }
  return r;
}

export type ContactVoiceSampleRef = {
  bucketId: string;
  objectKey: string;
};

export type ContactTtsView = {
  agentId: string;
  virtualAgentId: string | null;
  isOwner: boolean;
  canAdjust: boolean;
  /** Owners may still upload a chat-side custom WAV onto the contact. */
  canSetVoiceSample: boolean;
  ttsModelId: string | null;
  ttsVoiceConfigId: string | null;
  ttsVoicePreset: string | null;
  voiceSampleRef: ContactVoiceSampleRef | null;
  voiceSampleTranscript: string | null;
  effectiveTtsModelId: string | null;
  effectiveTtsVoiceConfigId: string | null;
  /** Resolved voice preset string for `anx.inference.tts.create` (`voice`). */
  effectiveVoicePreset: string | null;
  effectiveVoiceSampleRef: ContactVoiceSampleRef | null;
  effectiveVoiceSampleTranscript: string | null;
};

export type SpeakTurnPhase = 'idle' | 'processing' | 'playing' | 'done' | 'error' | 'needs_setup';

export type SpeakTurnState = {
  phase: SpeakTurnPhase;
  errorMessage: string | null;
  audioUrl: string | null;
  workloadId: string | null;
};

export type SpeakTurnController = {
  getState: () => SpeakTurnState;
  subscribe: (listener: (state: SpeakTurnState) => void) => () => void;
  speak: (text: string, opts?: { forceRecreate?: boolean }) => Promise<void>;
  cancel: () => Promise<void>;
  replay: () => Promise<void>;
  dispose: () => void;
};

function parseVoiceSampleRef(raw: unknown): ContactVoiceSampleRef | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const bucketId = typeof r.bucketId === 'string' ? r.bucketId.trim() : '';
  const objectKey = typeof r.objectKey === 'string' ? r.objectKey.trim() : '';
  if (!bucketId || !objectKey) return null;
  return { bucketId, objectKey };
}

function mapContactTtsView(data: Record<string, unknown>, agentId: string): ContactTtsView {
  return {
    agentId: String(data.agentId || agentId),
    virtualAgentId:
      data.virtualAgentId != null && String(data.virtualAgentId).trim()
        ? String(data.virtualAgentId)
        : null,
    isOwner: Boolean(data.isOwner),
    canAdjust: Boolean(data.canAdjust),
    canSetVoiceSample: data.canSetVoiceSample !== false,
    ttsModelId: data.ttsModelId != null ? String(data.ttsModelId) : null,
    ttsVoiceConfigId: data.ttsVoiceConfigId != null ? String(data.ttsVoiceConfigId) : null,
    ttsVoicePreset: data.ttsVoicePreset != null ? String(data.ttsVoicePreset) : null,
    voiceSampleRef: parseVoiceSampleRef(data.voiceSampleRef),
    voiceSampleTranscript:
      data.voiceSampleTranscript != null ? String(data.voiceSampleTranscript) : null,
    effectiveTtsModelId:
      data.effectiveTtsModelId != null ? String(data.effectiveTtsModelId) : null,
    effectiveTtsVoiceConfigId:
      data.effectiveTtsVoiceConfigId != null ? String(data.effectiveTtsVoiceConfigId) : null,
    effectiveVoicePreset:
      data.effectiveVoicePreset != null ? String(data.effectiveVoicePreset) : null,
    effectiveVoiceSampleRef: parseVoiceSampleRef(data.effectiveVoiceSampleRef),
    effectiveVoiceSampleTranscript:
      data.effectiveVoiceSampleTranscript != null
        ? String(data.effectiveVoiceSampleTranscript)
        : null,
  };
}

async function fetchContactTts(
  client: CommandClient,
  agentId: string,
  virtualAgentId?: string | null,
): Promise<ContactTtsView | null> {
  const result = await client.send('anx.agents.contact-tts.get', {
    agentId,
    ...(virtualAgentId ? { virtualAgentId } : {}),
  });
  if (result && typeof result === 'object' && 'ok' in result && (result as SendResult).ok === false) {
    return null;
  }
  const data = unwrapData(result);
  if (!data.agentId && !data.effectiveTtsModelId) return null;
  return mapContactTtsView(data, agentId);
}

export async function getContactTts(
  client: CommandClient,
  input: { agentId: string; virtualAgentId?: string | null },
): Promise<ContactTtsView | null> {
  return fetchContactTts(client, input.agentId, input.virtualAgentId);
}

/**
 * True when chat UI should open TTS setup (agent/contact has no effective model).
 * Ignores portal fallback model — that is for auto-voice soft-start only.
 */
export function contactTtsNeedsSetup(view: ContactTtsView | null): boolean {
  return !view?.effectiveTtsModelId;
}

export async function setContactTts(
  client: CommandClient,
  input: {
    agentId: string;
    ttsModelId: string;
    ttsVoiceConfigId?: string | null;
    ttsVoicePreset?: string | null;
    voiceSampleRef?: ContactVoiceSampleRef | null;
    voiceSampleTranscript?: string | null;
    clearVoiceSample?: boolean;
    virtualAgentId?: string | null;
  },
): Promise<ContactTtsView | null> {
  const payload: Record<string, unknown> = {
    agentId: input.agentId,
    ttsModelId: input.ttsModelId,
  };
  if (input.ttsVoiceConfigId != null) payload.ttsVoiceConfigId = input.ttsVoiceConfigId;
  if (input.ttsVoicePreset != null) payload.ttsVoicePreset = input.ttsVoicePreset;
  if (input.clearVoiceSample) {
    payload.voiceSampleRef = null;
    payload.voiceSampleTranscript = null;
  } else if (input.voiceSampleRef) {
    payload.voiceSampleRef = input.voiceSampleRef;
    if (input.voiceSampleTranscript != null) {
      payload.voiceSampleTranscript = input.voiceSampleTranscript;
    }
  } else if (input.voiceSampleRef === null) {
    payload.voiceSampleRef = null;
    payload.voiceSampleTranscript = null;
  } else if (input.voiceSampleTranscript != null) {
    payload.voiceSampleTranscript = input.voiceSampleTranscript;
  }
  if (input.virtualAgentId) payload.virtualAgentId = input.virtualAgentId;

  const result = await client.send('anx.agents.contact-tts.set', payload);
  if (result && typeof result === 'object' && 'ok' in result && (result as SendResult).ok === false) {
    const fail = result as Extract<SendResult, { ok: false }>;
    throw new Error(fail.message || 'Failed to save voice settings');
  }
  return mapContactTtsView(unwrapData(result), input.agentId);
}

export async function clearContactTts(
  client: CommandClient,
  input: { agentId: string; virtualAgentId?: string | null },
): Promise<ContactTtsView | null> {
  const result = await client.send('anx.agents.contact-tts.clear', {
    agentId: input.agentId,
    ...(input.virtualAgentId ? { virtualAgentId: input.virtualAgentId } : {}),
  });
  if (result && typeof result === 'object' && 'ok' in result && (result as SendResult).ok === false) {
    const fail = result as Extract<SendResult, { ok: false }>;
    throw new Error(fail.message || 'Failed to clear voice settings');
  }
  return mapContactTtsView(unwrapData(result), input.agentId);
}

/**
 * Per-turn TTS controller: process → play → done, with cancel / replay.
 * Emits `needs_setup` when no effective TTS model is configured.
 */
export function createSpeakTurnController(opts: {
  client: CommandClient;
  agentId?: string | null;
  virtualAgentId?: string | null;
  /** Fallback when contact-tts has no model. */
  fallbackModelId?: string | null;
}): SpeakTurnController {
  let state: SpeakTurnState = {
    phase: 'idle',
    errorMessage: null,
    audioUrl: null,
    workloadId: null,
  };
  const listeners = new Set<(s: SpeakTurnState) => void>();
  let abort: AbortController | null = null;
  let audio: HTMLAudioElement | null = null;
  let disposed = false;

  const emit = (patch: Partial<SpeakTurnState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l(state));
  };

  const stopAudio = () => {
    if (!audio) return;
    try {
      audio.pause();
      audio.src = '';
    } catch {
      /* ignore */
    }
    audio = null;
  };

  const cancelWorkload = async (workloadId: string | null) => {
    if (!workloadId) return;
    try {
      await opts.client.send('anx.inference.workloads.cancel', { workloadId });
    } catch {
      /* best-effort */
    }
  };

  const playUrl = async (url: string) => {
    stopAudio();
    emit({ phase: 'playing', errorMessage: null, audioUrl: url });
    try {
      const el = await playAudioUrl(url);
      audio = el;
      await new Promise<void>((resolve) => {
        const done = () => {
          el.removeEventListener('ended', done);
          el.removeEventListener('error', done);
          resolve();
        };
        el.addEventListener('ended', done);
        el.addEventListener('error', done);
      });
      if (!disposed && state.phase === 'playing') {
        emit({ phase: 'done' });
      }
    } catch (err) {
      emit({
        phase: 'error',
        errorMessage: err instanceof Error ? err.message : 'Audio playback failed',
      });
    }
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    async speak(text, speakOpts) {
      if (disposed) return;
      const trimmed = String(text || '').trim();
      if (!trimmed) {
        emit({ phase: 'error', errorMessage: 'Nothing to read aloud.' });
        return;
      }
      if (!speakOpts?.forceRecreate && state.audioUrl && state.phase === 'done') {
        await playUrl(state.audioUrl);
        return;
      }
      if (abort) {
        abort.abort();
        abort = null;
      }
      stopAudio();
      abort = typeof AbortController !== 'undefined' ? new AbortController() : null;
      emit({ phase: 'processing', errorMessage: null, workloadId: null });

      let modelId = opts.fallbackModelId || null;
      let voice: string | null = null;
      let voiceSampleRef: ContactVoiceSampleRef | null = null;
      let voiceSampleTranscript: string | null = null;
      let contactView: ContactTtsView | null = null;
      if (opts.agentId) {
        contactView = await fetchContactTts(opts.client, opts.agentId, opts.virtualAgentId);
        if (contactView?.effectiveTtsModelId) modelId = contactView.effectiveTtsModelId;
        if (contactView?.effectiveVoicePreset) voice = contactView.effectiveVoicePreset;
        if (contactView?.effectiveVoiceSampleRef) {
          voiceSampleRef = contactView.effectiveVoiceSampleRef;
        }
        if (contactView?.effectiveVoiceSampleTranscript) {
          voiceSampleTranscript = contactView.effectiveVoiceSampleTranscript;
        }
      }
      // Soft fallback for auto-voice; manual speak UI probes needs_setup first.
      if (!modelId) {
        emit({
          phase: 'needs_setup',
          errorMessage: 'Configure a TTS model to speak replies.',
        });
        return;
      }

      const result: TtsPlaybackResult = await createAndPollTts(
        opts.client,
        {
          model: modelId,
          text: trimmed,
          voice,
          voiceSampleRef,
          voiceSampleTranscript,
        },
        { signal: abort?.signal, intervalMs: 800, maxAttempts: 60 },
      );
      if (disposed) return;
      if (!result.ok) {
        emit({
          phase: 'error',
          errorMessage: result.errorMessage || 'Voice generation failed',
          workloadId: result.workloadId || null,
        });
        return;
      }
      emit({ workloadId: result.workloadId, audioUrl: result.audioUrl });
      await playUrl(result.audioUrl);
    },
    async cancel() {
      if (abort) {
        abort.abort();
        abort = null;
      }
      const workloadId = state.workloadId;
      stopAudio();
      await cancelWorkload(workloadId);
      emit({ phase: 'idle', errorMessage: null });
    },
    async replay() {
      if (state.audioUrl) {
        await playUrl(state.audioUrl);
        return;
      }
      emit({ phase: 'error', errorMessage: 'Nothing to replay yet.' });
    },
    dispose() {
      disposed = true;
      if (abort) abort.abort();
      stopAudio();
      listeners.clear();
    },
  };
}
