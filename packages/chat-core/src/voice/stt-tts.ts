import { pollWorkload, type WorkloadPollOptions } from '../workloads.js';

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

export type AudioModalityFilter = 'stt' | 'tts' | 'both';

export type AudioModalityTransport =
  | 'stt_batch'
  | 'stt_stream'
  | 'tts_batch'
  | 'tts_stream'
  | 'realtime_duplex';

export type AudioModelListItem = {
  id: string;
  displayName: string;
  modality: 'stt' | 'tts';
  /** All modalities this model supports (may include both for duplex). */
  modalities: Array<'stt' | 'tts'>;
  /** Batch vs streaming vs duplex — annotate only; list includes both. */
  modalityTransport: AudioModalityTransport | null;
  capabilities: string[];
  runnable: boolean;
  externalModelId: string | null;
  dataPolicyBadges: string[];
};

function unwrapData(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object') return {};
  const r = result as Record<string, unknown>;
  if (r.data && typeof r.data === 'object') return r.data as Record<string, unknown>;
  if (r.responseObject && typeof r.responseObject === 'object') {
    return r.responseObject as Record<string, unknown>;
  }
  if (r.response && typeof r.response === 'object') {
    const response = r.response as Record<string, unknown>;
    if (response.responseObject && typeof response.responseObject === 'object') {
      return response.responseObject as Record<string, unknown>;
    }
  }
  return r;
}

function assertOk(result: unknown, fallback: string): void {
  if (result && typeof result === 'object' && 'ok' in result && (result as SendResult).ok === false) {
    const fail = result as Extract<SendResult, { ok: false }>;
    throw new Error(fail.message || fallback);
  }
}

async function blobToBase64(
  blob: Blob,
): Promise<{ dataBase64: string; byteLength: number; mimeType: string }> {
  const mimeType = blob.type || 'audio/webm';
  const byteLength = blob.size;
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error('Failed to read audio blob'));
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        const comma = dataUrl.indexOf(',');
        const dataBase64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
        resolve({ dataBase64, byteLength, mimeType });
      };
      reader.readAsDataURL(blob);
    });
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  const dataBase64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64');
  return { dataBase64, byteLength, mimeType };
}

/** List entitled runnable STT/TTS models (`anx.inference.stt.models.list`). */
export async function listAudioModels(
  client: CommandClient,
  modality: AudioModalityFilter = 'both',
): Promise<AudioModelListItem[]> {
  const result = await client.send('anx.inference.stt.models.list', { modality });
  assertOk(result, 'stt.models.list failed');
  const data = unwrapData(result);
  const rows = Array.isArray(data.models) ? data.models : [];
  return rows
    .map((row) => {
      const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
      const id = String(r.id || r._id || '');
      if (!id) return null;
      const modalityRaw = String(r.modality || '').toLowerCase();
      const m: 'stt' | 'tts' = modalityRaw === 'tts' ? 'tts' : 'stt';
      const modalitiesRaw = Array.isArray(r.modalities)
        ? (r.modalities as unknown[])
            .map((x) => String(x).toLowerCase())
            .filter((x): x is 'stt' | 'tts' => x === 'stt' || x === 'tts')
        : [m];
      const transportRaw = r.modalityTransport != null ? String(r.modalityTransport) : '';
      const modalityTransport = (
        [
          'stt_batch',
          'stt_stream',
          'tts_batch',
          'tts_stream',
          'realtime_duplex',
        ] as const
      ).includes(transportRaw as AudioModalityTransport)
        ? (transportRaw as AudioModalityTransport)
        : null;
      return {
        id,
        displayName: String(r.displayName || r.externalModelId || id),
        modality: m,
        modalities: modalitiesRaw.length ? modalitiesRaw : [m],
        modalityTransport,
        capabilities: Array.isArray(r.capabilities) ? (r.capabilities as string[]) : [],
        runnable: r.runnable !== false,
        externalModelId: r.externalModelId != null ? String(r.externalModelId) : null,
        dataPolicyBadges: Array.isArray(r.dataPolicyBadges)
          ? (r.dataPolicyBadges as string[])
          : [],
      } satisfies AudioModelListItem;
    })
    .filter((x): x is AudioModelListItem => Boolean(x))
    .filter((x) => {
      if (modality === 'both') return true;
      return x.modality === modality || x.modalities.includes(modality);
    });
}

export type SttCreateResult = {
  jobId: string;
  workloadId: string;
  status: string;
  model: string | null;
  /** Present only if the create response already includes transcript (rare). */
  text: string | null;
};

/**
 * Enqueue STT via `anx.inference.stt.create` with inline IoDescriptor.
 * Poll for the result with {@link getSttJobResult} or {@link pollSttJob}.
 */
export async function createSttJob(
  client: CommandClient,
  input: {
    model: string;
    audio: Blob;
    language?: string | null;
    prompt?: string | null;
  },
): Promise<SttCreateResult> {
  const encoded = await blobToBase64(input.audio);
  const payload: Record<string, unknown> = {
    model: input.model,
    audio: {
      kind: 'inline',
      dataBase64: encoded.dataBase64,
      mimeType: encoded.mimeType,
      byteLength: encoded.byteLength,
    },
  };
  if (input.language) payload.language = input.language;
  if (input.prompt) payload.prompt = input.prompt;

  const result = await client.send('anx.inference.stt.create', payload);
  assertOk(result, 'stt.create failed');
  const data = unwrapData(result);
  const text =
    typeof data.text === 'string' && data.text.trim()
      ? data.text.trim()
      : typeof data.resultText === 'string' && data.resultText.trim()
        ? data.resultText.trim()
        : null;
  return {
    jobId: String(data.jobId || data.workloadId || data.id || ''),
    workloadId: String(data.workloadId || data.jobId || data.id || ''),
    status: String(data.status || 'queued'),
    model: data.model != null ? String(data.model) : null,
    text,
  };
}

function pickTranscriptText(data: Record<string, unknown>): string | null {
  if (typeof data.text === 'string' && data.text.trim()) return data.text.trim();
  if (typeof data.resultText === 'string' && data.resultText.trim()) return data.resultText.trim();
  const payload =
    data.resultPayload && typeof data.resultPayload === 'object'
      ? (data.resultPayload as Record<string, unknown>)
      : data.result && typeof data.result === 'object'
        ? (data.result as Record<string, unknown>)
        : null;
  if (payload && typeof payload.text === 'string' && payload.text.trim()) {
    return payload.text.trim();
  }
  return null;
}

/**
 * `anx.inference.stt.create` (inline audio → `stt_gen` workload) then poll
 * `anx.inference.workloads.get`. Never writes a workspace file.
 */
export async function createAndPollStt(
  client: CommandClient,
  input: {
    model: string;
    audio: Blob;
    language?: string | null;
    prompt?: string | null;
  },
  pollOpts?: WorkloadPollOptions,
): Promise<SttCreateResult & { error?: string }> {
  const started = await createSttJob(client, input);
  if (started.text) return started;
  const workloadId = started.workloadId || started.jobId;
  if (!workloadId) {
    return { ...started, error: 'STT create returned no workload id' };
  }
  try {
    const done = await pollWorkload(client, workloadId, pollOpts);
    const status = String(done.status || '').toLowerCase();
    const text = pickTranscriptText(done);
    if (status === 'failed' || status === 'error') {
      const err =
        (typeof (done as { errorMessage?: string }).errorMessage === 'string' &&
          (done as { errorMessage?: string }).errorMessage) ||
        (typeof (done.resultPayload as { error?: string } | null)?.error === 'string'
          ? (done.resultPayload as { error: string }).error
          : null) ||
        'Transcription failed';
      return {
        ...started,
        workloadId,
        jobId: workloadId,
        status,
        text,
        error: err,
      };
    }
    return {
      ...started,
      workloadId,
      jobId: workloadId,
      status: status || started.status,
      text,
    };
  } catch (err) {
    return {
      ...started,
      workloadId,
      jobId: workloadId,
      error: err instanceof Error ? err.message : 'STT poll failed',
    };
  }
}

export type LiveSttSession = {
  mode: string;
  modelId: string | null;
  token?: string;
  expiresAt?: string;
  endpoints?: string[];
  wsPath?: string;
  [key: string]: unknown;
};

/** Mint a live STT session (`anx.inference.stt.live-session.create`). */
export async function createLiveSttSession(
  client: CommandClient,
  input: {
    bookId?: string;
    modelId?: string;
    agentId?: string;
    difficultWords?: string[];
    /** ISO-639 hint. Omit / `null` = auto-detect. Never send a fake code. */
    language?: string | null;
  } = {},
): Promise<LiveSttSession> {
  const payload: Record<string, unknown> = {};
  if (input.bookId) payload.bookId = input.bookId;
  if (input.modelId) payload.modelId = input.modelId;
  if (input.agentId) payload.agentId = input.agentId;
  if (input.difficultWords?.length) payload.difficultWords = input.difficultWords;
  if (input.language) payload.language = input.language;
  const result = await client.send('anx.inference.stt.live-session.create', payload);
  assertOk(result, 'stt.live-session.create failed');
  return unwrapData(result) as LiveSttSession;
}

export type LiveSttSocket = {
  send: (audioFrame: ArrayBuffer | Uint8Array) => void;
  close: () => void;
  ready: Promise<void>;
};

/**
 * Connect to `/stt/live` and stream PCM/WebM frames. Queues frames until open.
 */
export function connectLiveSttWebSocket(params: {
  wsUrl: string;
  token: string;
  modelId?: string | null;
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (error: string) => void;
  onClosed?: () => void;
}): LiveSttSocket {
  const url = new URL(params.wsUrl);
  url.searchParams.set('token', params.token);
  if (params.modelId) url.searchParams.set('modelId', params.modelId);
  const ws = new WebSocket(url.toString());
  ws.binaryType = 'arraybuffer';
  const pending: Array<ArrayBuffer | Uint8Array> = [];
  let readyResolve: () => void = () => undefined;
  let readyReject: (err: Error) => void = () => undefined;
  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  ws.onopen = () => {
    for (const frame of pending) {
      try {
        ws.send(frame);
      } catch {
        /* ignore */
      }
    }
    pending.length = 0;
    readyResolve();
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(
        typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data),
      ) as { type?: string; text?: string; error?: string };
      if (msg.type === 'partial' && msg.text) params.onPartial?.(msg.text);
      else if (msg.type === 'final' && msg.text) params.onFinal?.(msg.text);
      else if (msg.type === 'error' && msg.error) params.onError?.(msg.error);
      else if (msg.type === 'closed') params.onClosed?.();
    } catch {
      /* non-JSON frame */
    }
  };
  ws.onerror = () => {
    const err = new Error('WebSocket connection error');
    params.onError?.(err.message);
    readyReject(err);
  };
  ws.onclose = () => params.onClosed?.();
  return {
    send(audioFrame: ArrayBuffer | Uint8Array) {
      if (ws.readyState === WebSocket.OPEN) ws.send(audioFrame);
      else pending.push(audioFrame);
    },
    close() {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'close' }));
        } catch {
          /* */
        }
      }
      try {
        ws.close();
      } catch {
        /* */
      }
    },
    ready,
  };
}

export type SttGetResult = {
  jobId: string;
  status: string;
  text: string | null;
  model: string | null;
  progressPercent: number;
  error?: string;
};

export type SttPollOptions = {
  intervalMs?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
};

/** Poll a single STT job via `anx.inference.stt.get`. */
export async function getSttJobResult(
  client: CommandClient,
  jobId: string,
): Promise<SttGetResult> {
  const result = await client.send('anx.inference.stt.get', { jobId });
  assertOk(result, 'stt.get failed');
  const data = unwrapData(result);
  return {
    jobId: String(data.jobId || data.id || jobId),
    status: String(data.status || 'unknown'),
    text:
      typeof data.text === 'string' && data.text.trim()
        ? data.text.trim()
        : null,
    model: data.model != null ? String(data.model) : null,
    progressPercent: typeof data.progressPercent === 'number' ? data.progressPercent : 0,
    ...(typeof data.error === 'string' ? { error: data.error } : {}),
  };
}

const STT_TERMINAL = new Set(['completed', 'failed', 'cancelled', 'canceled']);

function sttSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason instanceof Error ? signal.reason : new Error('STT polling aborted'));
    };
    if (signal.aborted) { onAbort(); return; }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Poll `anx.inference.stt.get` until the job reaches a terminal status.
 * Returns the final result with transcript text (on success) or error (on failure).
 */
export async function pollSttJob(
  client: CommandClient,
  jobId: string,
  opts: SttPollOptions = {},
): Promise<SttGetResult> {
  const intervalMs = Math.max(250, opts.intervalMs ?? 800);
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 60);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await getSttJobResult(client, jobId);
    if (STT_TERMINAL.has(result.status)) {
      return result;
    }
    if (attempt < maxAttempts) {
      await sttSleep(intervalMs, opts.signal);
    }
  }

  throw new Error(`Timed out waiting for STT job ${jobId}`);
}

export type TtsPlaybackResult =
  | { ok: true; audioUrl: string; workloadId: string }
  | { ok: false; errorMessage: string; workloadId?: string };

/**
 * Prefer inline `dataBase64` over serve URLs: chat TTS requests
 * `output: { kind: 'inline' }` because JWT-gated `/api/inference/audio/files/...`
 * cannot be played via `new Audio(url)` (portal SPA HTML / 401 →
 * "no supported source was found").
 */
function pickAudioUrl(data: Record<string, unknown>): string | null {
  const result =
    data.result && typeof data.result === 'object'
      ? (data.result as Record<string, unknown>)
      : null;
  const payload =
    data.resultPayload && typeof data.resultPayload === 'object'
      ? (data.resultPayload as Record<string, unknown>)
      : null;

  const inlineB64 =
    (typeof payload?.dataBase64 === 'string' && payload.dataBase64) ||
    (typeof result?.dataBase64 === 'string' && result.dataBase64) ||
    (typeof data.dataBase64 === 'string' && data.dataBase64) ||
    null;
  const mime =
    (typeof payload?.mimeType === 'string' && payload.mimeType) ||
    (typeof result?.mimeType === 'string' && result.mimeType) ||
    (typeof data.resultMime === 'string' && data.resultMime) ||
    'audio/mpeg';
  if (inlineB64) {
    return `data:${mime};base64,${inlineB64}`;
  }

  if (typeof data.audioUrl === 'string' && data.audioUrl) return data.audioUrl;
  if (typeof data.resultServeUrl === 'string' && data.resultServeUrl) return data.resultServeUrl;
  if (result) {
    if (typeof result.audioUrl === 'string' && result.audioUrl) return result.audioUrl;
    if (typeof result.resultServeUrl === 'string' && result.resultServeUrl) return result.resultServeUrl;
  }
  if (payload) {
    if (typeof payload.audioUrl === 'string' && payload.audioUrl) return payload.audioUrl;
    if (typeof payload.resultServeUrl === 'string' && payload.resultServeUrl) {
      return payload.resultServeUrl;
    }
  }
  return null;
}

/**
 * `anx.inference.tts.create` → poll `anx.inference.workloads.get` → resolve audio URL.
 * Reuses backend 7-day chat-audio retention when `resultServeUrl` / `audioUrl` is returned.
 */
export async function createAndPollTts(
  client: CommandClient,
  input: {
    model: string;
    text: string;
    voice?: string | null;
    speed?: number | null;
    outputFormat?: 'mp3' | 'wav' | 'opus' | 'aac';
    /** Contact/agent voice-clone sample (Fish instant clone / GPU reference). */
    voiceSampleRef?: { bucketId: string; objectKey: string } | null;
    voiceSampleTranscript?: string | null;
  },
  pollOpts?: WorkloadPollOptions,
): Promise<TtsPlaybackResult> {
  const trimmed = input.text.trim().slice(0, 4000);
  if (!trimmed) {
    return { ok: false, errorMessage: 'Nothing to read aloud.' };
  }

  const payload: Record<string, unknown> = {
    model: input.model,
    text: trimmed,
    outputFormat: input.outputFormat || 'mp3',
    output: { kind: 'inline' },
  };
  if (input.voice) payload.voice = input.voice;
  if (typeof input.speed === 'number') payload.speed = input.speed;
  if (input.voiceSampleRef?.bucketId && input.voiceSampleRef?.objectKey) {
    payload.voiceSampleRef = {
      bucketId: input.voiceSampleRef.bucketId,
      objectKey: input.voiceSampleRef.objectKey,
    };
  }
  if (input.voiceSampleTranscript) {
    payload.voiceSampleTranscript = String(input.voiceSampleTranscript).slice(0, 2000);
  }

  let started: Record<string, unknown>;
  try {
    const result = await client.send('anx.inference.tts.create', payload);
    assertOk(result, 'tts.create failed');
    started = unwrapData(result);
  } catch (err) {
    return {
      ok: false,
      errorMessage: err instanceof Error ? err.message : 'TTS create failed',
    };
  }

  const workloadId = String(started.workloadId || started.id || '');
  if (!workloadId) {
    return { ok: false, errorMessage: 'TTS create returned no workload id' };
  }

  // Immediate completion (unlikely but cheap to check)
  const immediate = pickAudioUrl(started);
  if (immediate) {
    return { ok: true, audioUrl: immediate, workloadId };
  }

  try {
    const done = await pollWorkload(client, workloadId, pollOpts);
    const status = String(done.status || '').toLowerCase();
    if (status === 'failed' || status === 'error') {
      return {
        ok: false,
        errorMessage: String(
          (done as { errorMessage?: string }).errorMessage ||
            (done.resultPayload as { error?: string } | null)?.error ||
            'Voice generation failed',
        ),
        workloadId,
      };
    }
    if (status === 'cancelled' || status === 'canceled') {
      return { ok: false, errorMessage: 'Voice generation was cancelled.', workloadId };
    }
    const audioUrl = pickAudioUrl(done);
    if (!audioUrl) {
      return {
        ok: false,
        errorMessage:
          'TTS completed without an audio URL. The partner tts_gen path may not emit audio yet.',
        workloadId,
      };
    }
    return { ok: true, audioUrl, workloadId };
  } catch (err) {
    return {
      ok: false,
      errorMessage: err instanceof Error ? err.message : 'TTS poll failed',
      workloadId,
    };
  }
}

export type PlayAudioUrlOpts = {
  /**
   * When set, tap the element into an AudioContext graph and expose a MediaStream
   * for lip-sync analysis (same AudioContext as playback). Called with `null` when
   * playback ends or fails.
   */
  onPlaybackStream?: (
    stream: MediaStream | null,
    audioContext: AudioContext | null,
  ) => void;
};

function resolveAudioContextCtor(): (typeof AudioContext) | null {
  if (typeof globalThis === 'undefined') return null;
  const g = globalThis as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return g.AudioContext || g.webkitAudioContext || null;
}

/**
 * Play a TTS (or other) audio URL. Optionally tap a MediaStream for lip-sync.
 */
export async function playAudioUrl(
  audioUrl: string,
  opts?: PlayAudioUrlOpts,
): Promise<HTMLAudioElement> {
  if (!audioUrl || typeof audioUrl !== 'string') {
    throw new Error('No audio URL to play.');
  }
  const audio = new Audio(audioUrl);
  let ctx: AudioContext | null = null;
  let notified = false;
  const notify = (stream: MediaStream | null) => {
    if (!opts?.onPlaybackStream) return;
    if (!stream && notified && !ctx) {
      opts.onPlaybackStream(null, null);
      return;
    }
    notified = true;
    opts.onPlaybackStream(stream, ctx);
  };
  const endNotify = () => notify(null);

  try {
    const AudioCtx = resolveAudioContextCtor();
    if (AudioCtx && opts?.onPlaybackStream) {
      ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch {
          /* autoplay policies */
        }
      }
      const source = ctx.createMediaElementSource(audio);
      const dest = ctx.createMediaStreamDestination();
      source.connect(dest);
      source.connect(ctx.destination);
      notify(dest.stream);
    }
    await audio.play();
  } catch (err) {
    endNotify();
    const msg = err instanceof Error ? err.message : String(err);
    // Common when a relative/JWT-gated serve path resolves to HTML/JSON.
    if (/no supported source|not supported|decode/i.test(msg)) {
      throw new Error(
        'Audio playback failed: the TTS result was not playable inline. Try again or reconfigure voice.',
      );
    }
    throw err instanceof Error ? err : new Error(msg || 'Audio playback failed');
  }
  audio.addEventListener('ended', endNotify, { once: true });
  audio.addEventListener('error', endNotify, { once: true });
  return audio;
}

export type TtsVoiceListItem = {
  id: string;
  title: string;
  languages?: string[];
};

export type TtsVoicesListResult = {
  voices: TtsVoiceListItem[];
  voiceSelectMode: 'reference_id' | 'name' | null;
  source: 'live' | 'catalog' | 'static';
};

/** List TTS voices for a model (`anx.inference.tts.voices.list`). */
export async function listTtsVoices(
  client: CommandClient,
  input: { modelId: string },
): Promise<TtsVoicesListResult> {
  const result = await client.send('anx.inference.tts.voices.list', {
    modelId: input.modelId,
  });
  assertOk(result, 'tts.voices.list failed');
  const data = unwrapData(result);
  const voicesRaw = Array.isArray(data.voices) ? data.voices : [];
  const voices: TtsVoiceListItem[] = voicesRaw
    .map((row) => {
      const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
      const id = String(r.id || '').trim();
      if (!id) return null;
      return {
        id,
        title: String(r.title || id),
        ...(Array.isArray(r.languages) ? { languages: r.languages.map(String) } : {}),
      };
    })
    .filter((x): x is TtsVoiceListItem => Boolean(x));
  const modeRaw = data.voiceSelectMode != null ? String(data.voiceSelectMode) : null;
  const voiceSelectMode =
    modeRaw === 'reference_id' || modeRaw === 'name' ? modeRaw : null;
  const sourceRaw = String(data.source || 'static');
  const source =
    sourceRaw === 'live' || sourceRaw === 'catalog' || sourceRaw === 'static'
      ? sourceRaw
      : 'static';
  return { voices, voiceSelectMode, source };
}

export type TtsVoicePickerOption = { id: string; title: string };

/**
 * Build TTS voice `<select>` options. Keeps a custom override when the current
 * id is not in the fetched list. Falls back to catalogPreview when live is empty.
 */
export function ttsVoicesForPicker(input: {
  voices?: TtsVoiceListItem[] | null;
  catalogPreview?: TtsVoiceListItem[] | null;
  currentVoiceId?: string | null;
  customAllowed?: boolean;
}): {
  options: TtsVoicePickerOption[];
  selectedId: string;
  allowCustom: boolean;
} {
  const allowCustom = input.customAllowed !== false;
  let voices = Array.isArray(input.voices) ? [...input.voices] : [];
  if (!voices.length && Array.isArray(input.catalogPreview) && input.catalogPreview.length) {
    voices = [...input.catalogPreview];
  }
  const options: TtsVoicePickerOption[] = voices.map((v) => ({
    id: v.id,
    title: v.title || v.id,
  }));
  const current = String(input.currentVoiceId || '').trim();
  if (current && !options.some((o) => o.id === current)) {
    options.unshift({ id: current, title: `${current} (custom)` });
  }
  return {
    options,
    selectedId: current || (options[0]?.id ?? ''),
    allowCustom,
  };
}

/**
 * Dictate path (batch): inline IoDescriptor → stt_gen workload → poll transcript.
 */
export async function transcribeOrNull(
  client: CommandClient,
  input: {
    modelId: string;
    audioBlob: Blob;
    language?: string | null;
  },
): Promise<{
  text: string | null;
  jobId: string | null;
  workloadId?: string | null;
  usedStt: boolean;
  status?: string;
}> {
  if (!client || !input.modelId || !input.audioBlob) {
    return { text: null, jobId: null, usedStt: false };
  }
  const result = await createAndPollStt(
    client,
    {
      model: input.modelId,
      audio: input.audioBlob,
      ...(input.language ? { language: input.language } : {}),
    },
    { intervalMs: 800, maxAttempts: 60 },
  );
  if (result.error && !result.text) {
    throw new Error(result.error);
  }
  return {
    text: result.text || null,
    jobId: result.jobId || result.workloadId || null,
    workloadId: result.workloadId || result.jobId || null,
    usedStt: true,
    status: result.status,
  };
}

/** Speak text via TTS create/poll then play. */
export async function speakText(
  client: CommandClient,
  input: {
    modelId: string;
    text: string;
    voice?: string | null;
    onPlaybackStream?: PlayAudioUrlOpts['onPlaybackStream'];
  },
): Promise<TtsPlaybackResult & { ok: boolean }> {
  if (!client) {
    return { ok: false, errorMessage: 'No command client' };
  }
  if (!input.modelId) {
    return { ok: false, errorMessage: 'No TTS model selected' };
  }
  const result = await createAndPollTts(
    client,
    { model: input.modelId, text: input.text, voice: input.voice || undefined },
    { intervalMs: 1000, maxAttempts: 60 },
  );
  if (!result.ok) return result;
  try {
    await playAudioUrl(result.audioUrl, {
      onPlaybackStream: input.onPlaybackStream,
    });
  } catch (err) {
    return {
      ok: false,
      errorMessage: err instanceof Error ? err.message : 'Audio playback failed',
      workloadId: result.workloadId,
    };
  }
  return result;
}
