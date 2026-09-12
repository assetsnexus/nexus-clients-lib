import { describe, expect, it } from 'vitest';
import { listTtsVoices, ttsVoicesForPicker } from './stt-tts.js';
import {
  filterSttModelsForPicker,
  findSttModel,
  modelHasSttCapability,
  modelSupportsSttStream,
} from './stt-models-picker.js';

describe('ttsVoicesForPicker', () => {
  it('maps fetched Fish voices into select options', () => {
    const result = ttsVoicesForPicker({
      voices: [
        { id: 'ref-1', title: 'Alice' },
        { id: 'ref-2', title: 'Bob' },
      ],
      currentVoiceId: 'ref-1',
    });
    expect(result.options.map((o) => o.id)).toEqual(['ref-1', 'ref-2']);
    expect(result.selectedId).toBe('ref-1');
  });

  it('keeps a custom override not in the list', () => {
    const result = ttsVoicesForPicker({
      voices: [{ id: 'ref-1', title: 'Alice' }],
      currentVoiceId: 'custom-xyz',
    });
    expect(result.options[0]?.id).toBe('custom-xyz');
    expect(result.selectedId).toBe('custom-xyz');
  });

  it('falls back to catalog preview when live list is empty', () => {
    const result = ttsVoicesForPicker({
      voices: [],
      catalogPreview: [{ id: 'preview-1', title: 'Preview' }],
      currentVoiceId: null,
    });
    expect(result.options).toEqual([{ id: 'preview-1', title: 'Preview' }]);
  });
});

describe('listTtsVoices', () => {
  it('maps command response', async () => {
    const client = {
      send: async () => ({
        ok: true,
        data: {
          voices: [{ id: 'v1', title: 'One' }],
          voiceSelectMode: 'reference_id',
          source: 'live',
        },
      }),
    };
    const out = await listTtsVoices(client as never, { modelId: 'm1' });
    expect(out.source).toBe('live');
    expect(out.voices[0]?.id).toBe('v1');
  });
});

describe('stt models picker', () => {
  it('filters STT capability rows', () => {
    const rows = [
      { id: 'a', capabilities: ['tts'] },
      { id: 'b', capabilities: ['stt'] },
      { id: 'c', category: 'stt' },
    ];
    expect(filterSttModelsForPicker(rows).map((r) => r.id)).toEqual(['b', 'c']);
    expect(modelHasSttCapability(rows[1])).toBe(true);
    expect(modelSupportsSttStream({ id: 'x', capabilities: ['stt_stream'] })).toBe(true);
    expect(findSttModel(rows, 'b')?.id).toBe('b');
  });
});
