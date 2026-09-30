import { describe, expect, it } from 'vitest';
import {
  buildChatModelOverride,
  mapAvailableChatModels,
} from './available-models.js';

describe('mapAvailableChatModels', () => {
  it('keeps chat_agent rows and intelligenceIndex / providerId from the catalog', () => {
    const catalog = mapAvailableChatModels({
      ok: true,
      data: {
        models: [
          {
            id: 'm1',
            displayName: 'GPT-4.1',
            externalModelId: 'openai/gpt-4.1',
            providerId: 'openai',
            intelligenceIndex: 44.2,
            chatPriceCreditsPerMillion: 12,
            capabilities: ['chat_agent', 'text_gen'],
            category: 'chat',
          },
          {
            id: 'img',
            displayName: 'Image',
            category: 'image',
            capabilities: ['image_gen'],
          },
        ],
      },
    });
    expect(catalog.models).toHaveLength(1);
    expect(catalog.models[0]).toMatchObject({
      id: 'm1',
      providerId: 'openai',
      intelligenceIndex: 44.2,
      chatPriceCreditsPerMillion: 12,
    });
  });

  it('builds a send modelOverride from catalog id', () => {
    const { models } = mapAvailableChatModels({
      models: [
        {
          id: 'abc',
          displayName: 'Local',
          capabilities: ['chat_agent'],
          preferredHostingType: 'private_cloud',
          externalModelId: 'qwen/qwen3',
          visionSupported: true,
        },
      ],
    });
    expect(buildChatModelOverride('abc', models)).toEqual({
      modelId: 'static:abc',
      externalModelId: 'qwen/qwen3',
      preferredHostingType: 'private_cloud',
      visionSupported: true,
    });
    expect(buildChatModelOverride(null, models)).toBeNull();
  });
});
