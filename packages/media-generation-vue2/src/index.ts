export {
  createMediaGenerationSession,
  isImageResultModel,
  isVideoResultModel,
  resolveModelOutputType,
  modelSupportsNegativePrompt,
  modelReferenceImageLimits,
  getModelGenerationIo,
} from '@nexus/media-generation-core';

export type {
  GenerationIo,
  MediaGenerationModel,
  MediaCandidate,
  MediaReference,
  WorkloadSnapshot,
  MediaGenerationAdapter,
  MediaGenerationSession,
  MediaGenerationSessionState,
  MediaKind,
  GenerateRequestBody,
  GenerateResult,
} from '@nexus/media-generation-core';

export { default as MediaGenerationDialog } from './MediaGenerationDialog.vue';
export { default as VrmPreview } from './VrmPreview.vue';
export {
  MEDIA_GENERATION_PROMPT_EXAMPLES,
  pickRandomMediaPromptExample,
} from './prompt-examples';
