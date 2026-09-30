import { describe, expect, it } from 'vitest';
import {
  formatIntelScore,
  intelTone,
  modelDisplayName,
  modelProviderPrefix,
  resolveModelProvider,
} from './providerLogos.js';

describe('model picker catalog mapping', () => {
  it('prefers catalog providerId over id prefix', () => {
    expect(modelProviderPrefix('static:abc', 'anthropic')).toBe('anthropic');
    expect(modelProviderPrefix('openai/gpt-4.1', null)).toBe('openai');
  });

  it('maps known providers to lobe-icons URLs', () => {
    const p = resolveModelProvider('openai/gpt-4.1', 'openai');
    expect(p.iconUrl).toContain('openai.png');
    expect(resolveModelProvider('unknown-model', 'acme').iconUrl).toBeUndefined();
  });

  it('formats intelligence index like oc-controller', () => {
    expect(formatIntelScore(44.21)).toBe('44.2');
    expect(formatIntelScore(8.5)).toBe('8.50');
    expect(formatIntelScore(null)).toBe('—');
    expect(intelTone(50)).toBe('top');
  });

  it('uses catalog displayName when present', () => {
    expect(modelDisplayName('openai/gpt-4.1', 'GPT-4.1')).toBe('GPT-4.1');
    expect(modelDisplayName('openrouter:openai/gpt-4.1')).toBe('gpt-4.1');
  });
});
