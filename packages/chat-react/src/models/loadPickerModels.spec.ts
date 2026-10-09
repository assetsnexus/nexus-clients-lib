import { describe, expect, it } from 'vitest';
import { formatIntelScore, intelTone } from './intel.js';
import { authorMarkInput, compactIntelLabel, compactPriceLabel } from './picker-row.js';
import { readUsdPerM } from './picker-types.js';
import { buildModelOverride, loadPickerModels, mergePickerModels } from './loadPickerModels.js';
import { mergeEntitledModelsForPicker } from './mergeEntitledModels.js';
import { modelDisplayName, resolveModelProvider } from './providerMark.js';
import { sortContactsForList } from '../utils/sortContacts.js';

describe('mergePickerModels', () => {
  it('keeps catalog intelligenceIndex and prefers catalog iconUrl', () => {
    const models = mergePickerModels(
      [
        {
          id: 'm1',
          name: 'Sonnet',
          externalModelId: 'anthropic/claude-sonnet-4',
          capabilities: ['chat_agent'],
          intelligenceIndex: 40,
          providerId: 'anthropic',
        },
      ],
      [
        {
          id: 'm1',
          name: 'Sonnet catalog',
          capabilities: ['chat_agent'],
          intelligenceIndex: 42,
          iconUrl: 'https://cdn.example/anthro.png',
          externalModelId: 'anthropic/claude-sonnet-4',
        },
      ],
    );
    expect(models).toHaveLength(1);
    expect(models[0].intelligenceIndex).toBe(40);
    expect(models[0].iconUrl).toBe('https://cdn.example/anthro.png');
  });

  it('drops non-chat catalog rows', () => {
    const models = mergePickerModels(
      [],
      [{ id: 'img', capabilities: ['image_gen'], category: 'image', externalModelId: 'openai/gpt-image-1' }],
    );
    expect(models).toEqual([]);
  });
});

describe('buildModelOverride', () => {
  it('sends bare UUID catalog ids', () => {
    const override = buildModelOverride('11111111-1111-4111-8111-111111111111', [
      {
        id: '11111111-1111-4111-8111-111111111111',
        label: 'X',
        intelligenceIndex: 12,
        inputPerM: null,
        outputPerM: null,
        chatPriceCreditsPerMillion: null,
        externalModelId: 'openai/gpt-5',
        preferredHostingType: 'public_cloud',
      },
    ]);
    expect(override).toMatchObject({
      modelId: '11111111-1111-4111-8111-111111111111',
      externalModelId: 'openai/gpt-5',
      preferredHostingType: 'public_cloud',
    });
  });

  it('returns null for agent default', () => {
    expect(buildModelOverride(null, [])).toBeNull();
    expect(buildModelOverride('__agent_default__', [])).toBeNull();
  });
});

describe('compact picker chips', () => {
  it('reads token millicent rows as USD per million', () => {
    expect(
      readUsdPerM(
        { costPricing: [{ unit: 'token_in', unitPriceMillicents: 0.3 }] },
        'input',
      ),
    ).toBeCloseTo(3);
    expect(
      readUsdPerM(
        { costPricing: [{ unit: 'token_out', unitPriceMillicents: 1.5 }] },
        'output',
      ),
    ).toBeCloseTo(15);
  });

  it('omits price and intelligence when the catalog row has neither', () => {
    expect(compactPriceLabel({ inputPerM: null, chatPriceCreditsPerMillion: null })).toBeNull();
    expect(compactIntelLabel(null)).toBeNull();
    expect(compactIntelLabel(undefined)).toBeNull();
  });

  it('uses the catalog author, not the OpenRouter gateway, for the mark', () => {
    const mark = resolveModelProvider(
      authorMarkInput({
        id: 'm1',
        label: 'Claude Sonnet',
        externalModelId: 'anthropic/claude-sonnet-latest',
        providerId: 'openrouter',
        iconUrl: null,
      }),
    );
    expect(mark.prefix).toBe('anthropic');
    expect(mark.label).toBe('Anthropic');
  });

  it('shows catalog USD, credit symbols, and the intelligence index unchanged', () => {
    expect(compactPriceLabel({ inputPerM: 3, chatPriceCreditsPerMillion: 40 })).toBe('$3.00/M');
    expect(compactPriceLabel({ inputPerM: null, chatPriceCreditsPerMillion: 5 })).toBe('$');
    expect(compactIntelLabel(41.2)).toBe('41.2');
  });
});

describe('intelligence display (oc-controller bands)', () => {
  it('formats and tones AA index without rescoring', () => {
    expect(formatIntelScore(42)).toBe('42.0');
    expect(formatIntelScore(8.2)).toBe('8.20');
    expect(intelTone(42)).toBe('high');
    expect(intelTone(50)).toBe('top');
    expect(intelTone(null)).toBe('unknown');
  });
});

describe('provider mark', () => {
  it('uses catalog iconUrl first, then providerId / prefix map', () => {
    expect(
      resolveModelProvider({
        modelId: 'openai/gpt-5',
        iconUrl: 'https://cdn.example/o.png',
      }).iconUrl,
    ).toBe('https://cdn.example/o.png');
    expect(resolveModelProvider({ modelId: 'anthropic/claude-3' }).prefix).toBe('anthropic');
    expect(modelDisplayName('openrouter:anthropic/claude-sonnet-4')).toBe('claude-sonnet-4');
  });
});

describe('mergeEntitledModelsForPicker', () => {
  it('does not seed from available-only rows when entitlements are empty', () => {
    const models = mergeEntitledModelsForPicker({
      availableRows: [
        {
          id: 'stt-1',
          displayName: 'Whisper',
          category: 'stt',
          capabilities: ['stt', 'stt_stream'],
        },
      ],
      catalogRows: [],
      entitlementsPayload: { models: [] },
    });
    expect(models).toEqual([]);
  });

  it('seeds from entitlements when models.available is empty and enriches UUID + IQ', () => {
    const catalogId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const models = mergeEntitledModelsForPicker({
      availableRows: [],
      catalogRows: [
        {
          id: catalogId,
          displayName: 'Claude Sonnet 4',
          externalModelId: 'anthropic/claude-sonnet-4',
          capabilities: ['text_gen', 'tool_calling'],
          intelligenceIndex: 41,
          iconUrl: 'https://cdn.example/anthro.png',
        },
      ],
      entitlementsPayload: {
        models: [
          {
            id: 'reseller::sub-or::rs-sonnet-4',
            name: 'claude-sonnet-4',
            source: 'native',
            subscriptionId: 'sub-or',
            inferenceCatalogModelId: catalogId,
            externalModelId: 'anthropic/claude-sonnet-4',
            routes: [{ subscriptionId: 'sub-or', hostingType: 'public_cloud' }],
          },
        ],
      },
    });
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe(catalogId);
    expect(models[0].modelRef).toBe(catalogId);
    expect(models[0].label).toMatch(/Sonnet 4/i);
    expect(models[0].intelligenceIndex).toBe(41);
    expect(models[0].iconUrl).toBe('https://cdn.example/anthro.png');
  });
});

describe('loadPickerModels', () => {
  it('calls available + entitlements.list + models.list', async () => {
    const sent: string[] = [];
    const models = await loadPickerModels({
      send: async (command) => {
        sent.push(command);
        if (command === 'anx.inference.models.available') {
          return { ok: true, data: { models: [] } };
        }
        if (command === 'anx.ai-agents.entitlements.list') {
          return {
            ok: true,
            data: {
              models: [
                {
                  id: 'private::sub::m1',
                  name: 'Entitled',
                  source: 'private_byok',
                  subscriptionId: 'sub',
                  externalModelId: 'anthropic/claude-sonnet-4',
                  capabilities: ['chat_agent'],
                },
              ],
            },
          };
        }
        if (command === 'anx.inference.models.list') {
          return { ok: true, data: { models: [] } };
        }
        throw new Error(command);
      },
    });
    expect(sent).toEqual([
      'anx.inference.models.available',
      'anx.ai-agents.entitlements.list',
      'anx.inference.models.list',
    ]);
    expect(models).toHaveLength(1);
    expect(models[0].externalModelId).toBe('anthropic/claude-sonnet-4');
  });

  it('scopes entitlements to the virtual employee and leaves models.available unscoped', async () => {
    const sent: Array<{ command: string; payload: unknown }> = [];
    await loadPickerModels(
      {
        send: async (command, payload) => {
          sent.push({ command, payload });
          return { ok: true, data: { models: [] } };
        },
      },
      { employeeId: 've-1' },
    );
    expect(sent).toEqual([
      { command: 'anx.inference.models.available', payload: {} },
      { command: 'anx.ai-agents.entitlements.list', payload: { employeeId: 've-1' } },
      { command: 'anx.inference.models.list', payload: { publishedOnly: false } },
    ]);
  });

  it('does not seed the picker from the catalog when entitlements.list fails', async () => {
    await expect(
      loadPickerModels({
        send: async (command) => {
          if (command === 'anx.inference.models.available') {
            return {
              ok: true,
              data: {
                models: [
                  {
                    id: 'm1',
                    capabilities: ['chat_agent'],
                    intelligenceIndex: 12,
                  },
                ],
              },
            };
          }
          if (command === 'anx.ai-agents.entitlements.list') {
            return { ok: false, message: 'denied' };
          }
          if (command === 'anx.inference.models.list') {
            return { ok: true, data: { models: [] } };
          }
          throw new Error(command);
        },
      }),
    ).rejects.toThrow('denied');
  });

  it('returns an empty picker when entitlements succeed with no models', async () => {
    const models = await loadPickerModels({
      send: async (command) => {
        if (command === 'anx.inference.models.available') {
          return {
            ok: true,
            data: {
              models: [
                {
                  id: 'm1',
                  capabilities: ['chat_agent'],
                },
              ],
            },
          };
        }
        if (command === 'anx.ai-agents.entitlements.list') {
          return { ok: true, data: { models: [] } };
        }
        if (command === 'anx.inference.models.list') {
          return { ok: true, data: { models: [] } };
        }
        throw new Error(command);
      },
    });
    expect(models).toEqual([]);
  });
});

describe('sortContactsForList', () => {
  it('orders by conversation activity when rows are provided', () => {
    const sorted = sortContactsForList(
      [
        { id: 'quiet', name: 'Quiet', type: 'agent' },
        { id: 'hot', name: 'Hot', type: 'agent' },
      ],
      [
        {
          conversationId: 'c1',
          virtualEmployeeId: 'hot',
          lastActivityAt: '2026-04-01T00:00:00Z',
          hasMessages: true,
        },
      ],
    );
    expect(sorted.map((c) => c.id)).toEqual(['hot', 'quiet']);
  });
});
