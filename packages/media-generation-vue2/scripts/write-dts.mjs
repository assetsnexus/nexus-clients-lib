import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const dts = `export {
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

export declare const MediaGenerationDialog: Record<string, unknown>;
export declare const VrmPreview: Record<string, unknown>;
export declare const MEDIA_GENERATION_PROMPT_EXAMPLES: readonly string[];
export declare function pickRandomMediaPromptExample(): string;
`;

writeFileSync(join(dir, 'index.d.ts'), dts);
writeFileSync(join(dir, 'index.d.cts'), dts);
console.log('wrote dist/index.d.ts');
