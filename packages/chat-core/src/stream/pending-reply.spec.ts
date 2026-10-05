import { describe, expect, it } from 'vitest';
import {
  findNewerAssistantMessage,
  pollNewerAssistantMessage,
  watermarkFromMessages,
} from './pending-reply.js';

const oldReply = {
  id: 'old',
  role: 'assistant',
  content: 'Hello again!',
  createdAt: '2020-01-01T00:00:00.000Z',
};

describe('pending reply', () => {
  it('ignores the pre-send assistant row and returns a later id', () => {
    const watermark = watermarkFromMessages([oldReply]);
    const sentAt = Date.parse('2026-10-05T00:00:00.000Z');
    expect(
      findNewerAssistantMessage([oldReply], watermark, sentAt),
    ).toBeNull();
    const fresh = {
      id: 'new',
      role: 'assistant',
      content: 'Fresh reply',
      createdAt: '2026-10-05T00:00:01.000Z',
    };
    expect(findNewerAssistantMessage([oldReply, fresh], watermark, sentAt)).toEqual(fresh);
  });

  it('polls until a new assistant row is ready', async () => {
    const watermark = watermarkFromMessages([oldReply]);
    let calls = 0;
    const found = await pollNewerAssistantMessage({
      list: async () => {
        calls += 1;
        if (calls < 2) return [oldReply];
        return [oldReply, { id: 'new', role: 'assistant', content: 'Fresh reply' }];
      },
      watermark,
      sentAtMs: Date.now(),
      intervalMs: 0,
      maxAttempts: 4,
    });
    expect(found?.content).toBe('Fresh reply');
    expect(calls).toBe(2);
  });
});
