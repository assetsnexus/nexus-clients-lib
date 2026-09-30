import { describe, expect, it } from 'vitest';
import { formatIntelScore, intelTone } from './intel.js';
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

  it('falls back to available+list when entitlements.list fails', async () => {
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
    });
    expect(models.map((m) => m.id)).toEqual(['m1']);
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
