/**
 * Presentation helpers for one picker row: the name column, the row tooltip and
 * the pricing badge. All pure, so they are asserted directly.
 */
import { describe, expect, it } from 'vitest';
import {
  badgeUsdPerM,
  compactPriceLabel,
  displayModelName,
  isOpaqueModelId,
  modelIdentifier,
  modelTooltipText,
  pricingTooltipText,
  stripSynthesizedProviderPrefix,
  authorMarkInput,
} from './picker-row.js';
import { readCachedUsdPerM, readExplicitCachedUsdPerM } from './picker-types.js';
import { resolveModelProvider } from './providerMark.js';

const UUID = 'd2285bf8-c00d-4e85-82d9-6b7c331b9629';

/** Provider mark exactly as the picker resolves it for one row. */
function providerOf(model: Parameters<typeof authorMarkInput>[0]) {
  return resolveModelProvider(authorMarkInput(model));
}

describe('name column: synthesized provider prefix', () => {
  it('drops the `<Provider>: ` prefix the region composes', () => {
    expect(
      stripSynthesizedProviderPrefix('Anthropic: Claude Fable 5.1', {
        label: 'Anthropic',
        prefix: 'anthropic',
      }),
    ).toBe('Claude Fable 5.1');
    expect(
      stripSynthesizedProviderPrefix('Google: Nano Banana 2 (Gemini 3.1 Flash Image)', {
        label: 'Google',
        prefix: 'google',
      }),
    ).toBe('Nano Banana 2 (Gemini 3.1 Flash Image)');
  });

  it('keeps the model name byte-for-byte (casing, digits, parentheses)', () => {
    expect(
      stripSynthesizedProviderPrefix('OpenAI: GPT Astra Latest', {
        label: 'OpenAI',
        prefix: 'openai',
      }),
    ).toBe('GPT Astra Latest');
  });

  it('leaves a colon that is not this row\'s provider untouched', () => {
    // `:free` / `:batch` style suffixes and unknown vendors are not prefixes.
    expect(
      stripSynthesizedProviderPrefix('Gemma 4 26b :free', {
        label: 'Google',
        prefix: 'google',
      }),
    ).toBe('Gemma 4 26b :free');
    expect(
      stripSynthesizedProviderPrefix('SpaceXAI: Grok 4.6', {
        label: 'x-ai',
        prefix: 'x-ai',
      }),
    ).toBe('SpaceXAI: Grok 4.6');
    expect(stripSynthesizedProviderPrefix('No colon here', { label: 'Anthropic' })).toBe(
      'No colon here',
    );
  });

  it('resolves the provider itself when the caller passes the row', () => {
    const row = {
      id: UUID,
      label: 'Anthropic: Claude Haiku 4.5 (batch)',
      externalModelId: 'anthropic/claude-haiku-4.5:batch',
      providerId: 'openrouter',
    };
    expect(displayModelName(row)).toBe('Claude Haiku 4.5 (batch)');
    expect(displayModelName({ ...row, label: 'Anthropic: Claude Haiku 4.5' })).toBe(
      'Claude Haiku 4.5',
    );
  });

  it('keeps a real model name that has no provider prefix', () => {
    expect(
      displayModelName({
        id: 'm1',
        label: 'DeepSeek V4 Flash',
        externalModelId: 'deepseek/deepseek-v4-flash',
        providerId: 'openrouter',
      }),
    ).toBe('DeepSeek V4 Flash');
  });

  it('never falls back to a UUID / entity id', () => {
    expect(displayModelName({ id: UUID, label: UUID, externalModelId: '' })).toBe('');
    expect(displayModelName({ id: '1792314373467-jt6sx0c8z', label: UUID })).toBe('');
    expect(isOpaqueModelId(UUID)).toBe(true);
    expect(isOpaqueModelId('1792314373467-jt6sx0c8z')).toBe(true);
    expect(isOpaqueModelId('claude-sonnet-5')).toBe(false);
  });

  it('falls back to the id part of the identifier when the label is missing', () => {
    expect(
      displayModelName({ id: 'static:abc', label: '', externalModelId: 'anthropic/claude-sonnet-5' }),
    ).toBe('claude-sonnet-5');
  });
});

describe('row tooltip: name + identifier, never a UUID', () => {
  it('shows the display name then the provider/model:tag identifier', () => {
    expect(
      modelTooltipText({
        id: UUID,
        label: 'Anthropic: Claude Fable 5.1',
        externalModelId: 'anthropic/claude-fable-5.1',
        providerId: 'openrouter',
      }),
    ).toBe('Anthropic: Claude Fable 5.1\nanthropic/claude-fable-5.1');
  });

  it('keeps the `:tag` suffix of the region identifier', () => {
    expect(
      modelIdentifier({ id: UUID, externalModelId: 'anthropic/claude-sonnet-4-6:latest' }),
    ).toBe('anthropic/claude-sonnet-4-6:latest');
  });

  it('prefixes a bare upstream slug with its provider', () => {
    expect(
      modelTooltipText({
        id: UUID,
        label: 'GPT Realtime',
        externalModelId: 'gpt-realtime',
        providerId: 'openai',
      }),
    ).toBe('GPT Realtime\nopenai/gpt-realtime');
  });

  it('never renders a UUID line', () => {
    const tip = modelTooltipText({ id: UUID, label: 'Some Model', externalModelId: undefined });
    expect(tip).toBe('Some Model');
    expect(tip).not.toContain(UUID);
  });

  it('returns null when neither a name nor an identifier is honest', () => {
    expect(modelTooltipText({ id: UUID, label: UUID })).toBeNull();
  });
});

describe('pricing badge: output price', () => {
  it('shows the out (token_out) rate, not the input rate', () => {
    expect(badgeUsdPerM({ inputPerM: 3, outputPerM: 15 })).toBe(15);
    expect(compactPriceLabel({ inputPerM: 3, outputPerM: 15, chatPriceCreditsPerMillion: 40 })).toBe(
      '$15.0/M',
    );
  });

  it('falls back to the input rate when no out row exists', () => {
    expect(badgeUsdPerM({ inputPerM: 3, outputPerM: null })).toBe(3);
    expect(compactPriceLabel({ inputPerM: 3, outputPerM: null, chatPriceCreditsPerMillion: null })).toBe(
      '$3.00/M',
    );
  });

  it('marks a free out rate free, before credits', () => {
    expect(compactPriceLabel({ inputPerM: 3, outputPerM: 0, chatPriceCreditsPerMillion: 40 })).toBe(
      'free',
    );
  });

  it('uses the credit rate only when no USD price exists at all', () => {
    expect(compactPriceLabel({ inputPerM: null, outputPerM: null, chatPriceCreditsPerMillion: 5 })).toBe(
      '$',
    );
  });

  it('resolves the provider mark the stripper compares against', () => {
    expect(providerOf({ id: UUID, label: 'x', externalModelId: 'anthropic/claude-3', providerId: 'openrouter' }).label).toBe(
      'Anthropic',
    );
  });
});

describe('cached price provenance (explicit vs derived)', () => {
  it('prefers an explicit `cache_read` row over the input-rate estimate', () => {
    const row = {
      costPricing: [
        { unit: 'token_in', unitPriceMillicents: 3, currency: 'USD' },
        { unit: 'cache_read', unitPriceMillicents: 0.3, currency: 'USD' },
      ],
    };
    expect(readExplicitCachedUsdPerM(row)).toBeCloseTo(3);
    expect(readCachedUsdPerM(row)).toEqual({ cachedPerM: 3, source: 'catalog' });
  });

  it('accepts the legacy `cached_input` unit alias', () => {
    const row = {
      costPricing: [
        { unit: 'token_in', unitPriceMillicents: 3, currency: 'USD' },
        { unit: 'cached_input', unitPriceMillicents: 0.3, currency: 'USD' },
      ],
    };
    expect(readCachedUsdPerM(row)).toEqual({ cachedPerM: 3, source: 'catalog' });
  });

  it('shows the real cached price with NO estimate suffix when cache_read exists', () => {
    const tip = pricingTooltipText({
      inputPerM: 3,
      outputPerM: 15,
      cachedPerM: 0.3,
      cachedPerMSource: 'catalog',
      costCurrency: 'USD',
      chatPriceCreditsPerMillion: null,
    });
    expect(tip).toBe('In: $3.00/M tokens\nOut: $15.00/M tokens\nCached: $0.300/M tokens');
    expect(tip).not.toContain('est. 10% of input');
  });

  it('labels the derived estimate only when no explicit row exists', () => {
    const tip = pricingTooltipText({
      inputPerM: 3,
      outputPerM: 15,
      cachedPerM: 0.3,
      cachedPerMSource: 'derived',
      costCurrency: 'USD',
      chatPriceCreditsPerMillion: null,
    });
    expect(tip).toContain('Cached: $0.300/M tokens (est. 10% of input)');
  });
});
