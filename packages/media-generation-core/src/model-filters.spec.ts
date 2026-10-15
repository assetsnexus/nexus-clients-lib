import { describe, expect, it } from 'vitest';
import {
  isImageResultModel,
  isVideoResultModel,
  modelReferenceImageLimits,
  resolveModelOutputType,
} from './model-filters.js';
import type { MediaGenerationModel } from './types.js';

function imageIoModel(partial?: Partial<MediaGenerationModel>): MediaGenerationModel {
  return {
    id: 'img-1',
    name: 'Image Model',
    generationIo: {
      outputType: 'image',
      prompt: true,
      negativePrompt: false,
      seed: { supported: false },
      size: { mode: 'none' },
      referenceImages: { min: 0, max: 1 },
    },
    ...partial,
  };
}

function videoIoModel(partial?: Partial<MediaGenerationModel>): MediaGenerationModel {
  return {
    id: 'vid-1',
    name: 'Video Model',
    generationIo: {
      outputType: 'video',
      prompt: true,
      negativePrompt: false,
      seed: { supported: false },
      size: { mode: 'none' },
      referenceImages: { min: 0, max: 0 },
      durationSec: { min: 1, max: 8, default: 4 },
    },
    ...partial,
  };
}

describe('model filters', () => {
  it('uses generationIo.outputType when present', () => {
    expect(isImageResultModel(imageIoModel())).toBe(true);
    expect(isVideoResultModel(imageIoModel())).toBe(false);
    expect(isImageResultModel(videoIoModel())).toBe(false);
    expect(isVideoResultModel(videoIoModel())).toBe(true);
  });

  it('falls back to category / outputTypes', () => {
    expect(
      resolveModelOutputType({
        id: 'a',
        category: 'video',
      }),
    ).toBe('video');
    expect(
      resolveModelOutputType({
        id: 'b',
        outputTypes: ['image'],
      }),
    ).toBe('image');
    expect(
      isVideoResultModel({
        id: 'c',
        capabilities: ['t2v'],
      }),
    ).toBe(true);
  });

  it('uses generationIo reference max, and i2i caps when that max is missing', () => {
    expect(modelReferenceImageLimits(imageIoModel()).max).toBe(1);
    expect(
      modelReferenceImageLimits({
        id: 't2i',
        capabilities: ['t2i', 'image_gen'],
        generationIo: {
          outputType: 'image',
          prompt: true,
          negativePrompt: false,
          seed: { supported: false },
          size: { mode: 'none' },
          referenceImages: { min: 0, max: 0 },
        },
      }).max,
    ).toBe(0);
    expect(
      modelReferenceImageLimits({
        id: 'i2i',
        capabilities: ['i2i'],
      }).max,
    ).toBe(1);
    expect(
      modelReferenceImageLimits({
        id: 'edit',
        capabilities: ['image_edit'],
      }).max,
    ).toBe(1);
    expect(
      modelReferenceImageLimits({
        id: 'declared',
        capabilities: ['i2i'],
        generationIo: {
          outputType: 'image',
          prompt: true,
          negativePrompt: false,
          seed: { supported: false },
          size: { mode: 'none' },
          referenceImages: { min: 1, max: 4 },
        },
      }),
    ).toEqual({ min: 1, max: 4 });
    expect(
      modelReferenceImageLimits({
        id: 't2i-bare',
        capabilities: ['t2i'],
      }).max,
    ).toBe(0);
  });
});
