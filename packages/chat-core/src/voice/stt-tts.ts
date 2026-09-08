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

export type AudioModelListItem = {
  id: string;
  displayName: string;
  modality: 'stt' | 'tts';
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
      return {
        id,
        displayName: String(r.displayName || r.externalModelId || id),
        modality: m,
        capabilities: Array.isArray(r.capabilities) ? (r.capabilities as string[]) : [],
        runnable: r.runnable !== false,
        externalModelId: r.externalModelId != null ? String(r.externalModelId) : null,
        dataPolicyBadges: Array.isArray(r.dataPolicyBadges)
          ? (r.dataPolicyBadges as string[])
          : [],
      } satisfies AudioModelListItem;
    })
    .filter((x): x is AudioModelListItem => Boolean(x));
}

export type SttCreateResult = {
  jobId: string;
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
    jobId: String(data.jobId || data.id || ''),
    status: String(data.status || 'queued'),
    model: data.model != null ? String(data.model) : null,
    text,
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

function pickAudioUrl(data: Record<string, unknown>): string | null {
  if (typeof data.audioUrl === 'string' && data.audioUrl) return data.audioUrl;
  if (typeof data.resultServeUrl === 'string' && data.resultServeUrl) return data.resultServeUrl;
  const result = data.result && typeof data.result === 'object' ? (data.result as Record<string, unknown>) : null;
  if (result) {
    if (typeof result.audioUrl === 'string' && result.audioUrl) return result.audioUrl;
    if (typeof result.resultServeUrl === 'string' && result.resultServeUrl) return result.resultServeUrl;
  }
  const payload =
    data.resultPayload && typeof data.resultPayload === 'object'
      ? (data.resultPayload as Record<string, unknown>)
      : null;
  if (payload) {
    if (typeof payload.audioUrl === 'string' && payload.audioUrl) return payload.audioUrl;
    if (typeof payload.resultServeUrl === 'string' && payload.resultServeUrl) {
      return payload.resultServeUrl;
    }
  }
  // Inline IoSink: dataBase64 on result payload
  const inlineB64 =
    (typeof payload?.dataBase64 === 'string' && payload.dataBase64) ||
    (typeof result?.dataBase64 === 'string' && result.dataBase64) ||
    (typeof data.dataBase64 === 'string' && data.dataBase64) ||
    null;
  const mime =
    (typeof payload?.mimeType === 'string' && payload.mimeType) ||
    (typeof data.resultMime === 'string' && data.resultMime) ||
    'audio/mpeg';
  if (inlineB64) {
    return `data:${mime};base64,${inlineB64}`;
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

export async function playAudioUrl(audioUrl: string): Promise<HTMLAudioElement> {
  const audio = new Audio(audioUrl);
  await audio.play();
  return audio;
}
