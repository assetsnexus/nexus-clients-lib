import type { GenerationIo, MediaGenerationModel } from './types.js';

function normalizeList(values: string[] | null | undefined): string[] {
  return (values ?? []).map((v) => String(v).trim().toLowerCase()).filter(Boolean);
}

/** Resolve generationIo.outputType, else category / outputTypes / capabilities. */
export function resolveModelOutputType(
  model: MediaGenerationModel | null | undefined,
): 'image' | 'video' | null {
  if (!model) return null;
  const io = model.generationIo;
  if (io?.outputType === 'image' || io?.outputType === 'video') {
    return io.outputType;
  }

  const category = String(model.category ?? '')
    .trim()
    .toLowerCase();
  if (category === 'image' || category === 'video') return category;

  const outputTypes = normalizeList(model.outputTypes);
  if (outputTypes.includes('video') && !outputTypes.includes('image')) return 'video';
  if (outputTypes.includes('image') && !outputTypes.includes('video')) return 'image';
  if (outputTypes.includes('video')) return 'video';
  if (outputTypes.includes('image')) return 'image';

  const caps = normalizeList(model.capabilities);
  const videoCaps = ['video', 't2v', 'i2v', 'video_gen'];
  const imageCaps = ['image_gen', 't2i', 'i2i', 'image_edit'];
  if (videoCaps.some((c) => caps.includes(c)) && !imageCaps.some((c) => caps.includes(c))) {
    return 'video';
  }
  if (imageCaps.some((c) => caps.includes(c))) return 'image';
  if (videoCaps.some((c) => caps.includes(c))) return 'video';

  return null;
}

export function isImageResultModel(model: MediaGenerationModel | null | undefined): boolean {
  return resolveModelOutputType(model) === 'image';
}

export function isVideoResultModel(model: MediaGenerationModel | null | undefined): boolean {
  return resolveModelOutputType(model) === 'video';
}

export function modelSupportsNegativePrompt(model: MediaGenerationModel | null | undefined): boolean {
  return Boolean(model?.generationIo?.negativePrompt);
}

export function modelReferenceImageLimits(
  model: MediaGenerationModel | null | undefined,
): { min: number; max: number } {
  const refs = model?.generationIo?.referenceImages;
  return {
    min: Math.max(0, refs?.min ?? 0),
    max: Math.max(0, refs?.max ?? 0),
  };
}

export function getModelGenerationIo(
  model: MediaGenerationModel | null | undefined,
): GenerationIo | null {
  return model?.generationIo ?? null;
}
