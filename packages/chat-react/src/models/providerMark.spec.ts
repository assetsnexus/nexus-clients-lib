import { describe, expect, it } from 'vitest';
import { resolveModelProvider, sanitizeProviderIconUrl } from './providerMark.js';

describe('sanitizeProviderIconUrl', () => {
  it('keeps a remote https URL', () => {
    expect(sanitizeProviderIconUrl('https://cdn.example.com/openai.png')).toBe(
      'https://cdn.example.com/openai.png',
    );
  });

  it('keeps a remote http URL', () => {
    expect(sanitizeProviderIconUrl('http://cdn.example.com/openai.png')).toBe(
      'http://cdn.example.com/openai.png',
    );
  });

  it('drops an inline data: image so bytes never ride in a list payload', () => {
    expect(
      sanitizeProviderIconUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'),
    ).toBeNull();
  });

  it('drops a blob: URL (not stable across clients)', () => {
    expect(sanitizeProviderIconUrl('blob:https://app.local/1234')).toBeNull();
  });

  it('drops a relative path that would 404 from the picker origin', () => {
    expect(sanitizeProviderIconUrl('/assets/icons/openai.png')).toBeNull();
  });

  it('drops an oversized string masquerading as a URL', () => {
    expect(sanitizeProviderIconUrl(`https://x.test/${'a'.repeat(3000)}`)).toBeNull();
  });

  it('treats blank / non-string input as absent', () => {
    expect(sanitizeProviderIconUrl('')).toBeNull();
    expect(sanitizeProviderIconUrl(null)).toBeNull();
    expect(sanitizeProviderIconUrl(undefined)).toBeNull();
    expect(sanitizeProviderIconUrl(42)).toBeNull();
  });
});

describe('resolveModelProvider icon gate', () => {
  it('uses a sanitized catalog icon URL', () => {
    const info = resolveModelProvider({
      modelId: 'openai/gpt-4o',
      providerId: 'openai',
      iconUrl: 'https://cdn.example.com/openai.png',
    });
    expect(info.iconUrl).toBe('https://cdn.example.com/openai.png');
  });

  it('falls back to the author-prefix lobehub CDN when the icon is a data: URL', () => {
    const info = resolveModelProvider({
      modelId: 'anthropic/claude-4-5-sonnet',
      providerId: 'anthropic',
      iconUrl: 'data:image/png;base64,AAAA',
    });
    expect(info.iconUrl).toMatch(/^https:\/\//);
    expect(info.iconUrl).not.toContain('data:');
    expect(info.prefix).toBe('anthropic');
  });

  it('falls back to a letter badge (no iconUrl) for an unknown provider', () => {
    const info = resolveModelProvider({ modelId: 'acme/widget-7', providerId: 'acme' });
    expect(info.iconUrl).toBeUndefined();
    expect(info.prefix).toBe('acme');
  });

  it('defaults to dark-folder icons and switches to light for white chrome', () => {
    expect(resolveModelProvider({ modelId: 'openai/gpt-4o' }).iconUrl).toContain('/dark/openai.png');
    expect(resolveModelProvider({ modelId: 'openai/gpt-4o', theme: 'light' }).iconUrl).toContain(
      '/light/openai.png',
    );
  });

  it('resolves grok / gpt author aliases', () => {
    expect(resolveModelProvider({ modelId: 'xai/grok-2', providerId: 'grok' }).label).toBe('xAI');
    expect(resolveModelProvider({ modelId: 'openai/gpt-4o', providerId: 'gpt' }).label).toBe('OpenAI');
  });

  it('inherits the author icon for ~vendor/:latest private-subscription ids', () => {
    const haiku = resolveModelProvider({
      modelId: '~anthropic/claude-haiku-latest',
      providerId: 'openrouter',
    });
    expect(haiku.prefix).toBe('anthropic');
    expect(haiku.iconUrl).toContain('/dark/anthropic.png');

    const flash = resolveModelProvider({ modelId: '~deepseek/deepseek-v4-flash-latest' });
    expect(flash.prefix).toBe('deepseek');
    expect(flash.iconUrl).toContain('/dark/deepseek.png');
  });
});
