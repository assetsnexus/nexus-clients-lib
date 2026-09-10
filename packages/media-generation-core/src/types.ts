/** First-class generation I/O for image/video catalog models. */

export type GenerationOutputType = 'image' | 'video';

export type GenerationSizeMode = 'none' | 'enum' | 'wxh';

export type GenerationSizeIo = {
  mode: GenerationSizeMode;
  /** When mode=enum (e.g. OpenAI image sizes). */
  options?: string[];
  default?: string;
  /** When mode=wxh. */
  width?: { min: number; max: number; step: number; default: number };
  height?: { min: number; max: number; step: number; default: number };
};

export type GenerationRangeIo = {
  min: number;
  max: number;
  default: number;
};

export type GenerationIo = {
  outputType: GenerationOutputType;
  prompt: boolean;
  negativePrompt: boolean;
  seed: { supported: boolean };
  size: GenerationSizeIo;
  referenceImages: { min: number; max: number };
  batchSize?: GenerationRangeIo;
  durationSec?: GenerationRangeIo;
  fps?: GenerationRangeIo;
  /** Human note for ref-image UI (optional). */
  referenceImageNote?: string | null;
};

export type MediaGenerationModel = {
  id: string;
  name?: string | null;
  displayName?: string | null;
  shortSummary?: string | null;
  category?: string | null;
  capabilities?: string[] | null;
  outputTypes?: string[] | null;
  generationIo?: GenerationIo | null;
  referenceImageNote?: string | null;
  computeTier?: string | null;
  externalModelId?: string | null;
  providerId?: string | null;
};

export type MediaKind = 'image' | 'video';

export type MediaCandidate = {
  id: string;
  url: string;
  kind: MediaKind;
  generated: boolean;
};

export type MediaReference = {
  id: string;
  preview: string;
  base64: string;
  mime: string;
};

export type WorkloadSubjob = {
  order: number;
  purpose: string;
  status: string;
};

export type WorkloadSnapshot = {
  status: string;
  progressPercent?: number;
  estimatedWaitSec?: number | null;
  estimatedCompleteAt?: string | null;
  resultImageUrl?: string | null;
  resultVideoUrl?: string | null;
  cancelReason?: string | null;
  complianceVerdict?: { reject?: boolean; reasonCode?: string | null } | null;
  reject?: boolean;
  subjobs?: WorkloadSubjob[];
  resultPayload?: {
    batchAcceptedImageUrls?: string[];
    batchAcceptedVideoUrls?: string[];
    batchRejectedCount?: number;
  } | null;
};

export type MediaGenerationOptions = {
  seed?: number | null;
  size?: string | null;
  width?: number | null;
  height?: number | null;
  batchSize?: number;
  durationSec?: number | null;
  fps?: number | null;
};

export type GenerateRequestBody = {
  modelId: string;
  prompt: string;
  /** Mirrors dialog filter / model generationIo.outputType — adapters route image vs video create. */
  outputType?: 'image' | 'video';
  negativePrompt?: string | null;
  referenceImages?: Array<{ base64: string; mime: string }>;
  seed?: number | null;
  size?: string | null;
  width?: number | null;
  height?: number | null;
  batchSize?: number;
  durationSec?: number | null;
  fps?: number | null;
};

export type GenerateResultCandidate = {
  url: string;
  kind: MediaKind;
};

export type GenerateResult = {
  mode?: 'gpu_async' | 'inline';
  workloadId?: string;
  status?: string;
  previewDataUrl?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  candidates?: GenerateResultCandidate[];
  reject?: boolean;
};

export type ListModelsResult = {
  models: MediaGenerationModel[];
  generationEnabled?: boolean;
  defaultModelId?: string | null;
};

export type MediaGenerationAdapter = {
  listModels(): Promise<ListModelsResult>;
  generate(body: GenerateRequestBody): Promise<GenerateResult>;
  getWorkload?(id: string): Promise<WorkloadSnapshot | null>;
  cancelWorkload?(id: string): Promise<unknown>;
};

export type MediaGenerationSessionState = {
  prompt: string;
  negativePrompt: string;
  modelId: string;
  models: MediaGenerationModel[];
  generationEnabled: boolean;
  options: MediaGenerationOptions;
  references: MediaReference[];
  candidates: MediaCandidate[];
  selectedCandidateId: string | null;
  busy: boolean;
  error: string | null;
  workloadId: string | null;
  workload: WorkloadSnapshot | null;
};
