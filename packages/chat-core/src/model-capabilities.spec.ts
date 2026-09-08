import { describe, expect, it } from 'vitest';
import {
  formatCatalogModelLabel,
  inferSupportsReasoning,
  isChatAgentPickerModel,
  modelSupportsToolCalling,
} from './model-capabilities.js';

describe('inferSupportsReasoning', () => {
  it('detects o-series and thinking models', () => {
    expect(inferSupportsReasoning('openai/o3-mini')).toBe(true);
    expect(inferSupportsReasoning('deepseek/deepseek-r1')).toBe(true);
    expect(inferSupportsReasoning('qwen/qwen3-235b-a22b-thinking-2507')).toBe(true);
    expect(inferSupportsReasoning('openai/gpt-4.1-mini')).toBe(false);
  });
});

describe('modelSupportsToolCalling', () => {
  it('honours supportsTools flag then capabilities', () => {
    expect(modelSupportsToolCalling(['text_gen'], true)).toBe(true);
    expect(modelSupportsToolCalling(['tool_calling'], false)).toBe(false);
    expect(modelSupportsToolCalling(['chat_agent'])).toBe(true);
    expect(modelSupportsToolCalling(['text_gen'])).toBe(false);
    expect(modelSupportsToolCalling([])).toBe(true);
  });
});

describe('isChatAgentPickerModel', () => {
  it('excludes dedicatedGpu and non-chat categories', () => {
    expect(isChatAgentPickerModel({ dedicatedGpu: true, capabilities: ['chat_agent'] })).toBe(
      false,
    );
    expect(
      isChatAgentPickerModel({ category: 'image', capabilities: ['text_gen', 'image_gen'] }),
    ).toBe(false);
    expect(
      isChatAgentPickerModel({
        category: 'chat',
        capabilities: ['text_gen', 'tool_calling'],
        externalModelId: 'openai/gpt-4.1',
      }),
    ).toBe(true);
  });
});

describe('formatCatalogModelLabel', () => {
  it('joins name and vendor', () => {
    expect(formatCatalogModelLabel('GPT-4.1', 'OpenAI')).toBe('GPT-4.1 · OpenAI');
    expect(formatCatalogModelLabel('GPT-4.1')).toBe('GPT-4.1');
    expect(formatCatalogModelLabel(null)).toBe('Model');
  });
});
