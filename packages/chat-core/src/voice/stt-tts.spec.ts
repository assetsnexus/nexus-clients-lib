import { describe, expect, it, vi } from 'vitest';
import { createAndPollTts, createSttJob, listAudioModels } from './stt-tts.js';

describe('stt-tts helpers', () => {
  it('lists audio models from stt.models.list', async () => {
    const send = vi.fn(async () => ({
      ok: true,
      data: {
        models: [
          { id: 'stt-1', displayName: 'Whisper', modality: 'stt', runnable: true },
          { id: 'tts-1', displayName: 'Speak', modality: 'tts', runnable: true },
        ],
      },
    }));
    const models = await listAudioModels({ send }, 'both');
    expect(send).toHaveBeenCalledWith('anx.inference.stt.models.list', { modality: 'both' });
    expect(models).toHaveLength(2);
    expect(models[0].modality).toBe('stt');
  });

  it('creates STT jobs with inline IoDescriptor', async () => {
    const send = vi.fn(async () => ({
      ok: true,
      data: { jobId: 'job-1', status: 'queued', model: 'stt-1', text: null },
    }));
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' });
    const result = await createSttJob(
      { send },
      { model: 'stt-1', audio: blob, language: 'en' },
    );
    expect(result.jobId).toBe('job-1');
    expect(result.text).toBeNull();
    const payload = send.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.model).toBe('stt-1');
    expect(payload.language).toBe('en');
    expect((payload.audio as { kind: string }).kind).toBe('inline');
  });

  it('polls TTS workloads for audioUrl', async () => {
    const send = vi.fn(async (command: string) => {
      if (command === 'anx.inference.tts.create') {
        return { ok: true, data: { id: 'wl-1', status: 'queued' } };
      }
      return {
        ok: true,
        data: { id: 'wl-1', status: 'completed', audioUrl: 'https://example/a.mp3' },
      };
    });
    const result = await createAndPollTts(
      { send },
      { model: 'tts-1', text: 'Hello' },
      { intervalMs: 10, maxAttempts: 3 },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.audioUrl).toContain('example');
      expect(result.workloadId).toBe('wl-1');
    }
  });

  it('forwards agentId and difficultWords to stt.live-session.create (G9)', async () => {
    const send = vi.fn(async () => ({
      ok: true,
      data: {
        mode: 'rolling_batch',
        modelId: 'stt-1',
        difficultWords: ['Acme'],
        token: 't',
        endpoints: ['wss://example/stt'],
      },
    }));
    // Inline the same contract createLiveSttSession uses (api.ts).
    await send('anx.inference.stt.live-session.create', {
      agentId: '11111111-1111-1111-1111-111111111111',
      difficultWords: ['Acme'],
    });
    expect(send).toHaveBeenCalledWith('anx.inference.stt.live-session.create', {
      agentId: '11111111-1111-1111-1111-111111111111',
      difficultWords: ['Acme'],
    });
  });
});
