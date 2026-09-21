import { describe, expect, it } from 'vitest';
import {
  formatCatalogModelLabel,
  inferSupportsReasoning,
  isChatAgentPickerModel,
  modelSupportsToolCalling,
  resolveReasoningEffortLevels,
} from './model-capabilities.js';

describe('inferSupportsReasoning', () => {
  it('detects o-series, GPT-5, branded tiers, Claude, and thinking models', () => {
    expect(inferSupportsReasoning('openai/o3-mini')).toBe(true);
    expect(inferSupportsReasoning('openai/gpt-5')).toBe(true);
    expect(inferSupportsReasoning('~openai/gpt-5.2')).toBe(true);
    expect(inferSupportsReasoning('~openai/gpt-astra-latest')).toBe(true);
    expect(inferSupportsReasoning('~openai/gpt-sol-latest')).toBe(true);
    expect(inferSupportsReasoning('anthropic/claude-fable-5.1')).toBe(true);
    expect(inferSupportsReasoning('anthropic/claude-sonnet-5')).toBe(true);
    expect(inferSupportsReasoning('deepseek/deepseek-r1')).toBe(true);
    expect(inferSupportsReasoning('qwen/qwen3-235b-a22b-thinking-2507')).toBe(true);
    expect(inferSupportsReasoning('openai/gpt-4.1-mini')).toBe(false);
    expect(inferSupportsReasoning('openai/gpt-5-image-mini')).toBe(false);
    expect(inferSupportsReasoning('anthropic/claude-fable-5.1:batch')).toBe(false);
  });

  it('honours explicit reasoning capabilities', () => {
    expect(
      inferSupportsReasoning('vendor/custom', 'chat', ['text_gen', 'reasoning']),
    ).toBe(true);
  });
});

describe('resolveReasoningEffortLevels', () => {
  it('returns model-family specific levels', () => {
    expect(resolveReasoningEffortLevels('openai/gpt-5')).toEqual([
      'minimal',
      'low',
      'medium',
      'high',
    ]);
    expect(resolveReasoningEffortLevels('openai/gpt-5.1')).toEqual([
      'none',
      'low',
      'medium',
      'high',
    ]);
    expect(resolveReasoningEffortLevels('openai/gpt-5.2')).toContain('xhigh');
    expect(resolveReasoningEffortLevels('openai/o3-mini')).toEqual([
      'low',
      'medium',
      'high',
    ]);
    expect(resolveReasoningEffortLevels('openai/gpt-4.1')).toBeNull();
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

  it('excludes batch and image-specialized catalog variants', () => {
    expect(
      isChatAgentPickerModel({
        category: 'chat',
        capabilities: ['text_gen', 'tool_calling', 'batch_inference'],
        externalModelId: 'anthropic/claude-sonnet-5:batch',
      }),
    ).toBe(false);
    expect(
      isChatAgentPickerModel({
        category: 'chat',
        capabilities: ['text_gen', 'chat_agent', 'image_gen'],
        externalModelId: 'openai/gpt-5-image-mini',
      }),
    ).toBe(false);
  });
});

describe('formatCatalogModelLabel', () => {
  it('joins name and vendor', () => {
    expect(formatCatalogModelLabel('GPT-4.1', 'OpenAI')).toBe('GPT-4.1 · OpenAI');
    expect(formatCatalogModelLabel('GPT-4.1')).toBe('GPT-4.1');
    expect(formatCatalogModelLabel(null)).toBe('Model');
  });
});
