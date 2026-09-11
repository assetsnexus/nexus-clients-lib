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

export type ContactTtsView = {
  agentId: string;
  virtualAgentId: string | null;
  isOwner: boolean;
  canAdjust: boolean;
  ttsModelId: string | null;
  ttsVoiceConfigId: string | null;
  effectiveTtsModelId: string | null;
  effectiveTtsVoiceConfigId: string | null;
  effectiveVoicePreset: string | null;
};

export type SpeakTurnPhase = 'idle' | 'processing' | 'playing' | 'done' | 'error';

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
  return {
    agentId: String(data.agentId || agentId),
    virtualAgentId:
      data.virtualAgentId != null && String(data.virtualAgentId).trim()
        ? String(data.virtualAgentId)
        : null,
    isOwner: Boolean(data.isOwner),
    canAdjust: Boolean(data.canAdjust),
    ttsModelId: data.ttsModelId != null ? String(data.ttsModelId) : null,
    ttsVoiceConfigId: data.ttsVoiceConfigId != null ? String(data.ttsVoiceConfigId) : null,
    effectiveTtsModelId:
      data.effectiveTtsModelId != null ? String(data.effectiveTtsModelId) : null,
    effectiveTtsVoiceConfigId:
      data.effectiveTtsVoiceConfigId != null ? String(data.effectiveTtsVoiceConfigId) : null,
    effectiveVoicePreset:
      data.effectiveVoicePreset != null ? String(data.effectiveVoicePreset) : null,
  };
}

export async function getContactTts(
  client: CommandClient,
  input: { agentId: string; virtualAgentId?: string | null },
): Promise<ContactTtsView | null> {
  return fetchContactTts(client, input.agentId, input.virtualAgentId);
}

export async function setContactTts(
  client: CommandClient,
  input: {
    agentId: string;
    ttsModelId: string;
    ttsVoiceConfigId?: string | null;
    virtualAgentId?: string | null;
  },
): Promise<ContactTtsView | null> {
  const result = await client.send('anx.agents.contact-tts.set', {
    agentId: input.agentId,
    ttsModelId: input.ttsModelId,
    ...(input.ttsVoiceConfigId != null ? { ttsVoiceConfigId: input.ttsVoiceConfigId } : {}),
    ...(input.virtualAgentId ? { virtualAgentId: input.virtualAgentId } : {}),
  });
  if (result && typeof result === 'object' && 'ok' in result && (result as SendResult).ok === false) {
    const fail = result as Extract<SendResult, { ok: false }>;
    throw new Error(fail.message || 'Failed to save voice settings');
  }
  return unwrapData(result) as unknown as ContactTtsView;
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
  return unwrapData(result) as unknown as ContactTtsView;
}

/**
 * Per-turn TTS controller: process → play → done, with cancel / replay.
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
      if (opts.agentId) {
        const view = await fetchContactTts(opts.client, opts.agentId, opts.virtualAgentId);
        if (view?.effectiveTtsModelId) modelId = view.effectiveTtsModelId;
        if (view?.effectiveVoicePreset) voice = view.effectiveVoicePreset;
      }
      if (!modelId) {
        emit({ phase: 'error', errorMessage: 'No TTS model configured.' });
        return;
      }

      const result: TtsPlaybackResult = await createAndPollTts(
        opts.client,
        { model: modelId, text: trimmed, voice },
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
