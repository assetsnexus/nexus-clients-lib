import {
  getModelGenerationIo,
  isVideoResultModel,
  modelReferenceImageLimits,
  resolveModelOutputType,
} from './model-filters.js';
import type {
  GenerateRequestBody,
  MediaCandidate,
  MediaGenerationAdapter,
  MediaGenerationOptions,
  MediaGenerationSessionState,
  MediaKind,
  MediaReference,
  WorkloadSnapshot,
} from './types.js';

export type MediaGenerationSession = {
  getState(): MediaGenerationSessionState;
  subscribe(listener: () => void): () => void;
  loadModels(): Promise<void>;
  setPrompt(prompt: string): void;
  setNegativePrompt(prompt: string): void;
  setModelId(modelId: string): void;
  setOptions(patch: Partial<MediaGenerationOptions>): void;
  addReferenceFromFile(input: { base64: string; mime: string; preview?: string }): MediaReference;
  removeReference(id: string): void;
  useSelectedAsReference(candidateIds?: string[]): Promise<void>;
  selectCandidate(id: string | null): void;
  appendCandidate(input: { url: string; kind: MediaKind; generated?: boolean }): MediaCandidate;
  clearCandidates(): void;
  clear(): void;
  setError(message: string | null): void;
  generate(): Promise<void>;
  cancelWorkload(): Promise<void>;
  applySelected(): MediaCandidate | null;
};

export type CreateMediaGenerationSessionOptions = {
  adapter: MediaGenerationAdapter;
  /** Poll interval for async workloads (ms). Default 2000. */
  pollIntervalMs?: number;
  /** Optional: convert a remote URL into base64+mime for reference reuse. */
  fetchUrlAsReference?: (url: string) => Promise<{ base64: string; mime: string; preview?: string }>;
};

function resolveCreateArgs(
  adapterOrOpts: MediaGenerationAdapter | CreateMediaGenerationSessionOptions,
  maybeOpts?: Omit<CreateMediaGenerationSessionOptions, 'adapter'>,
): CreateMediaGenerationSessionOptions {
  if (adapterOrOpts && typeof adapterOrOpts === 'object' && 'listModels' in adapterOrOpts) {
    return { adapter: adapterOrOpts, ...maybeOpts };
  }
  return adapterOrOpts as CreateMediaGenerationSessionOptions;
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultOptionsFromModel(
  modelId: string,
  models: MediaGenerationSessionState['models'],
): MediaGenerationOptions {
  const model = models.find((m) => m.id === modelId);
  const io = getModelGenerationIo(model);
  const opts: MediaGenerationOptions = {
    seed: null,
    size: null,
    width: null,
    height: null,
    batchSize: 1,
    durationSec: null,
    fps: null,
  };
  if (!io) return opts;
  if (io.size.mode === 'enum') {
    opts.size = io.size.default ?? io.size.options?.[0] ?? null;
  } else if (io.size.mode === 'wxh') {
    opts.width = io.size.width?.default ?? null;
    opts.height = io.size.height?.default ?? null;
  }
  if (io.batchSize) {
    opts.batchSize = io.batchSize.default;
  }
  if (io.durationSec) {
    opts.durationSec = io.durationSec.default;
  }
  if (io.fps) {
    opts.fps = io.fps.default;
  }
  return opts;
}

function kindFromModel(modelId: string, models: MediaGenerationSessionState['models']): MediaKind {
  const model = models.find((m) => m.id === modelId);
  if (isVideoResultModel(model)) return 'video';
  return 'image';
}

function collectUrlsFromWorkload(wl: WorkloadSnapshot): Array<{ url: string; kind: MediaKind }> {
  const out: Array<{ url: string; kind: MediaKind }> = [];
  const seen = new Set<string>();
  const push = (url: string | null | undefined, kind: MediaKind) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ url, kind });
  };
  push(wl.resultImageUrl, 'image');
  push(wl.resultVideoUrl, 'video');
  for (const u of wl.resultPayload?.batchAcceptedImageUrls ?? []) push(u, 'image');
  for (const u of wl.resultPayload?.batchAcceptedVideoUrls ?? []) push(u, 'video');
  return out;
}

async function defaultFetchUrlAsReference(
  url: string,
): Promise<{ base64: string; mime: string; preview: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch reference (${res.status})`);
  }
  const blob = await res.blob();
  const mime = blob.type || 'image/png';
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read reference blob'));
    reader.readAsDataURL(blob);
  });
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1]! : dataUrl;
  return { base64, mime, preview: dataUrl };
}

/** Accepts adapter directly or `{ adapter, pollIntervalMs?, fetchUrlAsReference? }`. */
export function createMediaGenerationSession(
  adapterOrOpts: MediaGenerationAdapter | CreateMediaGenerationSessionOptions,
  maybeOpts?: Omit<CreateMediaGenerationSessionOptions, 'adapter'>,
): MediaGenerationSession {
  const opts = resolveCreateArgs(adapterOrOpts, maybeOpts);
  const { adapter, pollIntervalMs = 2000 } = opts;
  const fetchUrlAsReference = opts.fetchUrlAsReference ?? defaultFetchUrlAsReference;

  let state: MediaGenerationSessionState = {
    prompt: '',
    negativePrompt: '',
    modelId: '',
    models: [],
    generationEnabled: true,
    options: {
      seed: null,
      size: null,
      width: null,
      height: null,
      batchSize: 1,
      durationSec: null,
      fps: null,
    },
    references: [],
    candidates: [],
    selectedCandidateId: null,
    busy: false,
    error: null,
    workloadId: null,
    workload: null,
  };

  const listeners = new Set<() => void>();
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const setState = (patch: Partial<MediaGenerationSessionState>) => {
    state = { ...state, ...patch };
    emit();
  };

  const stopPolling = () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  const selectedModel = () => state.models.find((m) => m.id === state.modelId);

  const trimReferencesToMax = (refs: MediaReference[], max: number): MediaReference[] => {
    if (max <= 0) return [];
    if (refs.length <= max) return refs;
    return refs.slice(0, max);
  };

  const appendCandidates = (items: Array<{ url: string; kind: MediaKind }>, generated: boolean) => {
    const next = items
      .filter((i) => Boolean(i.url))
      .map((i) => ({
        id: newId(),
        url: i.url,
        kind: i.kind,
        generated,
      }));
    if (!next.length) return;
    const candidates = [...next, ...state.candidates];
    setState({
      candidates,
      selectedCandidateId: state.selectedCandidateId ?? next[0]!.id,
      busy: false,
      workloadId: null,
      workload: null,
    });
  };

  const handleWorkloadTerminal = (wl: WorkloadSnapshot) => {
    stopPolling();
    if (wl.status === 'completed') {
      appendCandidates(collectUrlsFromWorkload(wl), true);
      return;
    }
    if (wl.status === 'failed' || wl.status === 'cancelled') {
      setState({
        busy: false,
        workloadId: null,
        workload: null,
        error:
          wl.status === 'failed'
            ? 'Generation failed. Try again or adjust the prompt.'
            : null,
      });
    }
  };

  const pollWorkload = (id: string) => {
    stopPolling();
    if (!adapter.getWorkload) {
      setState({
        busy: false,
        error: 'Async generation requires adapter.getWorkload',
      });
      return;
    }
    pollTimer = setInterval(() => {
      void adapter
        .getWorkload!(id)
        .then((wl) => {
          if (!wl) return;
          setState({
            workload: {
              status: wl.status,
              progressPercent: wl.progressPercent ?? 0,
              estimatedWaitSec: wl.estimatedWaitSec,
              estimatedCompleteAt: wl.estimatedCompleteAt,
              subjobs: wl.subjobs,
              resultImageUrl: wl.resultImageUrl,
              resultVideoUrl: wl.resultVideoUrl,
              resultPayload: wl.resultPayload,
              reject: wl.reject,
              cancelReason: wl.cancelReason,
              complianceVerdict: wl.complianceVerdict,
            },
          });
          if (wl.status === 'completed' || wl.status === 'failed' || wl.status === 'cancelled') {
            handleWorkloadTerminal(wl);
          }
        })
        .catch((e: unknown) => {
          stopPolling();
          setState({
            busy: false,
            workloadId: null,
            workload: null,
            error: e instanceof Error ? e.message : String(e),
          });
        });
    }, pollIntervalMs);
  };

  const session: MediaGenerationSession = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async loadModels() {
      const catalog = await adapter.listModels();
      const models = catalog.models ?? [];
      const preferred =
        catalog.defaultModelId && models.some((m) => m.id === catalog.defaultModelId)
          ? catalog.defaultModelId
          : models[0]?.id ?? '';
      setState({
        models,
        generationEnabled: catalog.generationEnabled !== false,
        modelId: preferred,
        options: defaultOptionsFromModel(preferred, models),
        error: null,
      });
    },

    setPrompt(prompt) {
      setState({ prompt });
    },

    setNegativePrompt(prompt) {
      setState({ negativePrompt: prompt });
    },

    setModelId(modelId) {
      const max = modelReferenceImageLimits(state.models.find((m) => m.id === modelId)).max;
      setState({
        modelId,
        options: defaultOptionsFromModel(modelId, state.models),
        references: trimReferencesToMax(state.references, max),
        error: null,
      });
    },

    setOptions(patch) {
      setState({ options: { ...state.options, ...patch } });
    },

    addReferenceFromFile(input) {
      const { max } = modelReferenceImageLimits(selectedModel());
      if (max <= 0) {
        setState({
          error: 'Selected model does not accept reference images.',
        });
        throw new Error('Selected model does not accept reference images.');
      }
      if (state.references.length >= max) {
        const msg = `This model accepts at most ${max} reference image(s). Remove one or pick a model with a higher limit.`;
        setState({ error: msg });
        throw new Error(msg);
      }
      const mime = input.mime || 'image/png';
      const preview =
        input.preview ??
        (input.base64.startsWith('data:')
          ? input.base64
          : `data:${mime};base64,${input.base64}`);
      const base64 = input.base64.includes(',')
        ? input.base64.split(',')[1]!
        : input.base64;
      const entry: MediaReference = {
        id: newId(),
        preview,
        base64,
        mime,
      };
      setState({
        references: [...state.references, entry],
        error: null,
      });
      return entry;
    },

    removeReference(id) {
      setState({
        references: state.references.filter((r) => r.id !== id),
      });
    },

    async useSelectedAsReference(candidateIds) {
      const ids =
        candidateIds && candidateIds.length
          ? candidateIds
          : state.selectedCandidateId
            ? [state.selectedCandidateId]
            : [];
      for (const id of ids) {
        const candidate = state.candidates.find((c) => c.id === id);
        if (!candidate || candidate.kind !== 'image') continue;
        const fetched = await fetchUrlAsReference(candidate.url);
        session.addReferenceFromFile({
          base64: fetched.base64,
          mime: fetched.mime,
          preview: fetched.preview,
        });
      }
    },

    selectCandidate(id) {
      setState({ selectedCandidateId: id });
    },

    appendCandidate(input) {
      const entry: MediaCandidate = {
        id: newId(),
        url: input.url,
        kind: input.kind,
        generated: input.generated ?? false,
      };
      setState({
        candidates: [entry, ...state.candidates],
        selectedCandidateId: state.selectedCandidateId ?? entry.id,
        error: null,
      });
      return entry;
    },

    clearCandidates() {
      setState({ candidates: [], selectedCandidateId: null });
    },

    setError(message) {
      setState({ error: message });
    },

    clear() {
      stopPolling();
      setState({
        prompt: '',
        negativePrompt: '',
        options: {
          seed: null,
          size: null,
          width: null,
          height: null,
          batchSize: 1,
          durationSec: null,
          fps: null,
        },
        references: [],
        candidates: [],
        selectedCandidateId: null,
        busy: false,
        error: null,
        workloadId: null,
        workload: null,
      });
    },

    async generate() {
      if (!state.generationEnabled) {
        setState({ error: 'Generation is disabled.' });
        return;
      }
      if (!state.modelId) {
        setState({ error: 'Select a model first.' });
        return;
      }
      const model = selectedModel();
      const { min, max } = modelReferenceImageLimits(model);
      if (state.references.length < min) {
        setState({
          error: `This model requires at least ${min} reference image(s).`,
        });
        return;
      }
      if (state.references.length > max) {
        setState({
          error: `This model accepts at most ${max} reference image(s).`,
        });
        return;
      }

      const io = getModelGenerationIo(model);
      const refs =
        max > 0
          ? state.references.slice(0, max).map((r) => ({
              base64: r.base64,
              mime: r.mime,
            }))
          : [];

      const body: GenerateRequestBody = {
        modelId: state.modelId,
        prompt: state.prompt,
        outputType: resolveModelOutputType(model) === 'video' ? 'video' : 'image',
        negativePrompt: io?.negativePrompt ? state.negativePrompt.trim() || null : null,
        referenceImages: refs.length ? refs : undefined,
        seed: io?.seed?.supported ? state.options.seed ?? null : null,
        size: io?.size?.mode === 'enum' ? state.options.size ?? null : null,
        width: io?.size?.mode === 'wxh' ? state.options.width ?? null : null,
        height: io?.size?.mode === 'wxh' ? state.options.height ?? null : null,
        batchSize: io?.batchSize ? state.options.batchSize ?? io.batchSize.default : undefined,
        durationSec: io?.durationSec
          ? state.options.durationSec ?? io.durationSec.default
          : null,
        fps: io?.fps ? state.options.fps ?? io.fps.default : null,
      };

      setState({ busy: true, error: null, workloadId: null, workload: null });
      try {
        const result = await adapter.generate(body);
        if (result.reject === true) {
          setState({ busy: false, error: 'Generation rejected by compliance.' });
          return;
        }
        if (result.mode === 'gpu_async' && result.workloadId) {
          setState({
            workloadId: result.workloadId,
            workload: {
              status: result.status ?? 'queued',
              progressPercent: 0,
            },
          });
          pollWorkload(result.workloadId);
          return;
        }

        const kind = kindFromModel(state.modelId, state.models);
        const fromResult: Array<{ url: string; kind: MediaKind }> = [];
        if (result.candidates?.length) {
          for (const c of result.candidates) {
            fromResult.push({ url: c.url, kind: c.kind });
          }
        } else {
          const url =
            result.imageUrl ||
            result.videoUrl ||
            result.previewDataUrl ||
            null;
          if (url) {
            fromResult.push({
              url,
              kind: result.videoUrl ? 'video' : kind,
            });
          }
        }
        appendCandidates(fromResult, true);
        if (!fromResult.length) {
          setState({ busy: false, error: 'Generation returned no media.' });
        }
      } catch (e: unknown) {
        setState({
          busy: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },

    async cancelWorkload() {
      const id = state.workloadId;
      if (!id) return;
      try {
        if (adapter.cancelWorkload) {
          await adapter.cancelWorkload(id);
        }
      } catch {
        /* ignore cancel errors */
      }
      stopPolling();
      setState({
        busy: false,
        workloadId: null,
        workload: null,
      });
    },

    applySelected() {
      return (
        state.candidates.find((c) => c.id === state.selectedCandidateId) ??
        state.candidates[0] ??
        null
      );
    },
  };

  return session;
}
