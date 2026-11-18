import { describe, expect, it, vi } from 'vitest';
import { createCustomBrain } from './custom-brain.js';
import { createFallbackChat } from './fallback-chat.js';

describe('createCustomBrain', () => {
  it('is read-only without an ingest handler', async () => {
    const brain = createCustomBrain({ query: () => ({ items: [] }) });
    expect(brain.writable).toBe(false);
    expect(brain.health()).toEqual({ healthy: true, readyForIngestion: false });
    await expect(brain.ingest({ items: [] })).rejects.toMatchObject({ code: 'BRAIN_READ_ONLY' });
  });

  it('reports writable and accepts a batch when ingest is configured', async () => {
    const brain = createCustomBrain({
      query: () => ({ items: [{ id: '1', text: 'x', score: 1, metadata: {} }] }),
      ingest: () => ({ batchId: 'b1' }),
      ingestStatus: () => ({ status: 'completed', processedCount: 1, totalCount: 1 }),
    });
    expect(brain.writable).toBe(true);
    expect(brain.health()).toEqual({ healthy: true, readyForIngestion: true });
    expect(await brain.ingest({ items: [{ externalId: 'e', text: 't', type: 'knowledge' }] })).toEqual({
      batchId: 'b1',
    });
    expect(await brain.ingestStatus('b1')).toMatchObject({ status: 'completed' });
  });

  it('normalizes a malformed query result to an empty list', async () => {
    const brain = createCustomBrain({ query: () => ({}) as never });
    expect(await brain.query({ query: 'x' })).toEqual({ items: [] });
  });

  it('returns null for an unknown batch', async () => {
    const brain = createCustomBrain({ query: () => ({ items: [] }) });
    expect(await brain.ingestStatus('nope')).toBeNull();
  });
});

describe('createFallbackChat', () => {
  it('answers locally when no provider is configured', async () => {
    const chat = createFallbackChat({ localAnswer: (q) => `local:${q}` });
    const result = await chat.complete({ messages: [{ role: 'user', content: 'hi' }] });
    expect(result.source).toBe('local');
    expect(result.choices[0].message.content).toBe('local:hi');
  });

  it('uses the provider and labels the source', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'provider answer' } }] }),
    })) as unknown as typeof fetch;
    const chat = createFallbackChat({
      baseUrl: 'https://llm.example/v1',
      apiKey: 'k',
      model: 'm',
      localAnswer: () => 'local',
      fetchImpl,
    });
    const result = await chat.complete({ messages: [{ role: 'user', content: 'hi' }] });
    expect(result.source).toBe('provider');
    expect(result.choices[0].message.content).toBe('provider answer');
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('https://llm.example/v1/chat/completions');
  });

  it('degrades to the local answer when the provider fails', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) })) as unknown as typeof fetch;
    const chat = createFallbackChat({
      baseUrl: 'https://llm.example/v1',
      localAnswer: () => 'local',
      fetchImpl,
    });
    const result = await chat.complete({ messages: [{ role: 'user', content: 'hi' }] });
    expect(result.source).toBe('local');
    expect(result.choices[0].message.content).toContain('provider failed');
  });
});
