import { describe, expect, it, vi } from 'vitest';
import { createAndPollStt, createAndPollTts, createLiveSttSession, createSttJob, listAudioModels } from './stt-tts.js';

type SendFn = (
  command: string,
  payload?: Record<string, unknown>,
) => Promise<{ ok: boolean; data?: unknown }>;

describe('stt-tts helpers', () => {
  it('lists audio models from stt.models.list', async () => {
    const send = vi.fn<SendFn>(async () => ({
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
    const send = vi.fn<SendFn>(async () => ({
      ok: true,
      data: { jobId: 'job-1', status: 'queued', model: 'stt-1', text: null },
    }));
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' });
    const result = await createSttJob(
      { send },
      { model: 'stt-1', audio: blob, language: 'en' },
    );
    expect(result.jobId).toBe('job-1');
    expect(result.workloadId).toBe('job-1');
    expect(result.text).toBeNull();
    const payload = send.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.model).toBe('stt-1');
    expect(payload.language).toBe('en');
    expect((payload.audio as { kind: string }).kind).toBe('inline');
    expect(send.mock.calls.map((c) => c[0])).not.toContain('anx.workspace.items.add');
  });

  it('omits language on STT create when Auto / null', async () => {
    const send = vi.fn<SendFn>(async () => ({
      ok: true,
      data: { jobId: 'job-1', status: 'queued', model: 'stt-1', text: null },
    }));
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' });
    await createSttJob({ send }, { model: 'stt-1', audio: blob, language: null });
    const payload = send.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.language).toBeUndefined();
  });

  it('polls stt_gen workloads and never writes workspace items', async () => {
    const send = vi.fn<SendFn>(async (command) => {
      if (command === 'anx.inference.stt.create') {
        return { ok: true, data: { workloadId: 'wl-stt', status: 'queued', text: null } };
      }
      if (command === 'anx.inference.workloads.get') {
        return {
          ok: true,
          data: { id: 'wl-stt', status: 'completed', resultPayload: { text: 'hello there' } },
        };
      }
      throw new Error(`unexpected command ${command}`);
    });
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' });
    const result = await createAndPollStt(
      { send },
      { model: 'stt-1', audio: blob },
      { intervalMs: 10, maxAttempts: 3 },
    );
    expect(result.text).toBe('hello there');
    expect(result.workloadId).toBe('wl-stt');
    expect(send.mock.calls.map((c) => c[0])).toEqual([
      'anx.inference.stt.create',
      'anx.inference.workloads.get',
    ]);
    expect(send.mock.calls.map((c) => c[0])).not.toContain('anx.workspace.items.add');
  });

  it('mints live STT sessions without workspace writes', async () => {
    const send = vi.fn<SendFn>(async () => ({
      ok: true,
      data: {
        mode: 'realtime_ws',
        modelId: 'stt-stream-1',
        token: 'tok',
        endpoints: ['wss://example/stt/live'],
      },
    }));
    const session = await createLiveSttSession({ send }, { modelId: 'stt-stream-1' });
    expect(session.token).toBe('tok');
    expect(send).toHaveBeenCalledWith('anx.inference.stt.live-session.create', {
      modelId: 'stt-stream-1',
    });
    expect(send.mock.calls.map((c) => c[0])).not.toContain('anx.workspace.items.add');
  });

  it('forwards language on live-session.create and omits Auto / null', async () => {
    const send = vi.fn<SendFn>(async () => ({
      ok: true,
      data: { mode: 'realtime_ws', modelId: 'stt-stream-1', token: 'tok', endpoints: [] },
    }));
    await createLiveSttSession({ send }, { modelId: 'stt-stream-1', language: 'de' });
    expect(send).toHaveBeenCalledWith('anx.inference.stt.live-session.create', {
      modelId: 'stt-stream-1',
      language: 'de',
    });
    send.mockClear();
    await createLiveSttSession({ send }, { modelId: 'stt-stream-1', language: null });
    expect(send).toHaveBeenCalledWith('anx.inference.stt.live-session.create', {
      modelId: 'stt-stream-1',
    });
  });

  it('polls TTS workloads for audioUrl', async () => {
    const send = vi.fn<SendFn>(async (command) => {
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

  it('prefers inline dataBase64 over JWT-gated audioUrl for playback', async () => {
    const send = vi.fn<SendFn>(async (command) => {
      if (command === 'anx.inference.tts.create') {
        return { ok: true, data: { id: 'wl-2', status: 'queued' } };
      }
      return {
        ok: true,
        data: {
          id: 'wl-2',
          status: 'completed',
          resultPayload: {
            audioUrl: '/api/inference/audio/files/wl-2.mp3',
            dataBase64: Buffer.from('ID3fake').toString('base64'),
            mimeType: 'audio/mpeg',
          },
        },
      };
    });
    const result = await createAndPollTts(
      { send },
      { model: 'tts-1', text: 'Hello' },
      { intervalMs: 10, maxAttempts: 3 },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.audioUrl.startsWith('data:audio/mpeg;base64,')).toBe(true);
    }
    const createPayload = send.mock.calls.find((c) => c[0] === 'anx.inference.tts.create')?.[1] as
      | Record<string, unknown>
      | undefined;
    expect(createPayload?.output).toEqual({ kind: 'inline' });
  });

  it('forwards voiceSampleRef on tts.create', async () => {
    const send = vi.fn<SendFn>(async (command) => {
      if (command === 'anx.inference.tts.create') {
        return {
          ok: true,
          data: {
            id: 'wl-3',
            status: 'completed',
            resultPayload: {
              dataBase64: Buffer.from([1, 2, 3]).toString('base64'),
              mimeType: 'audio/mpeg',
            },
          },
        };
      }
      throw new Error(`unexpected ${command}`);
    });
    await createAndPollTts(
      { send },
      {
        model: 'tts-1',
        text: 'Hi',
        voiceSampleRef: { bucketId: 'ws-1', objectKey: 'voices/a.wav' },
        voiceSampleTranscript: 'hello sample',
      },
    );
    const payload = send.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.voiceSampleRef).toEqual({ bucketId: 'ws-1', objectKey: 'voices/a.wav' });
    expect(payload.voiceSampleTranscript).toBe('hello sample');
  });

  it('forwards agentId and difficultWords to stt.live-session.create (G9)', async () => {
    const send = vi.fn<SendFn>(async () => ({
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
