import { afterEach, describe, expect, it } from 'vitest';
import { createNexusChat } from '@nexus/chat-core';
import {
  advancedCatalogNotice,
  advancedModelFacts,
  resolveEffectivePickerModel,
} from './advanced-model-facts.js';
import { contextDonutModel } from './context-donut.js';
import { contextUsageVisible } from './advanced-model-facts.js';
import { planHoldStt } from '../dictation/holdStt.js';

type Sent = { command: string; payload?: Record<string, unknown> };

const storage = new Map<string, string>();

afterEach(() => {
  storage.clear();
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

function rememberThreads() {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
  };
}

function chatClient(
  sent: Sent[],
  replies: Record<string, (payload?: Record<string, unknown>) => unknown>,
) {
  return {
    send: async (command: string, payload?: Record<string, unknown>) => {
      sent.push({ command, payload });
      const reply = replies[command];
      return reply ? reply(payload) : { ok: true, data: {} };
    },
  };
}

describe('advanced catalog', () => {
  it('shows a failed catalog as an error and does not invent a model row', () => {
    const notice = advancedCatalogNotice({
      modelsError: 'Models could not be loaded.',
      modelCount: 0,
      loading: false,
    });
    expect(notice).toBe('Models could not be loaded.');
    expect(notice).not.toContain('—');
    expect(advancedCatalogNotice({ modelCount: 0, loading: false })).toBe('No models are available.');
    expect(resolveEffectivePickerModel([], null, 'anthropic/claude-haiku-latest')).toBeNull();
    expect(advancedModelFacts(null)).toBeNull();
    const empty = contextDonutModel({});
    expect(contextUsageVisible(empty)).toBe(false);
    expect(empty.tokenLabel).toBe('—');
  });
});

describe('hold speech rail', () => {
  it('does not call speech commands when the grant is missing', () => {
    expect(planHoldStt({ grantMissing: true, models: [{ id: 'stt-1', modalityTransport: 'stt_stream' }] })).toEqual({
      action: 'sign-in',
      commands: [],
    });
  });

  it('opens a live session and falls back to a batch transcript', () => {
    expect(
      planHoldStt({
        grantMissing: false,
        models: [{ id: 'stt-live', modalityTransport: 'stt_stream', runnable: true }],
      }),
    ).toEqual({
      action: 'insert',
      modelId: 'stt-live',
      live: true,
      commands: ['anx.inference.stt.live-session.create', 'anx.inference.stt.create'],
    });
  });
});

describe('locked agent greeting', () => {
  it('asks for the conversation-open greeting once and keeps that text', async () => {
    const sent: Sent[] = [];
    const chat = createNexusChat({
      lockedAgent: { virtualEmployeeId: 've-greet' },
      client: chatClient(sent, {
        'anx.communicate.conversations.list': () => ({ ok: true, data: { conversations: [] } }),
        'anx.communicate.conversations.create': () => ({
          ok: true,
          data: { conversationId: 'conv-new' },
        }),
        'anx.communicate.conversations.messages.list': () => ({ ok: true, data: { messages: [] } }),
        'anx.communicate.stream-init': () => ({ ok: true, data: { endpoints: [] } }),
        'anx.communicate.message.send': () => ({
          ok: true,
          data: { greetingText: 'Hello from the agent.', dispatched: false },
        }),
      }),
    });

    await chat.whenLockedAgentReady;
    const opening = sent.find((entry) => entry.command === 'anx.communicate.message.send');
    expect(opening?.payload?.text).toBe('');
    expect(opening?.payload?.conversationOpen).toBe(true);
    expect(sent.filter((entry) => entry.command === 'anx.communicate.message.send')).toHaveLength(1);
    expect(chat.getState().turns.map((turn) => turn.text)).toEqual(['Hello from the agent.']);
    expect(chat.getState().turns.some((turn) => turn.role === 'user')).toBe(false);
  });

  it('does not ask again when the thread already has an assistant message', async () => {
    const sent: Sent[] = [];
    const chat = createNexusChat({
      lockedAgent: { virtualEmployeeId: 've-existing' },
      client: chatClient(sent, {
        'anx.communicate.conversations.list': () => ({
          ok: true,
          data: {
            conversations: [
              {
                conversationId: 'conv-old',
                virtualEmployeeId: 've-existing',
                status: 'active',
                lastActivityAt: '2026-06-01T00:00:00.000Z',
              },
            ],
          },
        }),
        'anx.communicate.conversations.messages.list': () => ({
          ok: true,
          data: { messages: [{ id: 'm1', role: 'assistant', content: 'Already here.' }] },
        }),
        'anx.communicate.stream-init': () => ({ ok: true, data: { endpoints: [] } }),
      }),
    });

    await chat.whenLockedAgentReady;
    expect(sent.some((entry) => entry.command === 'anx.communicate.message.send')).toBe(false);
    expect(chat.getState().turns.map((turn) => turn.text)).toEqual(['Already here.']);
  });

  it('reopens the remembered conversation instead of creating an empty thread', async () => {
    rememberThreads();
    const sent: Sent[] = [];
    const replies = {
      'anx.communicate.conversations.list': () => ({ ok: true, data: { conversations: [] } }),
      'anx.communicate.conversations.create': () => ({
        ok: true,
        data: { conversationId: 'conv-kept' },
      }),
      'anx.communicate.conversations.get': () => ({
        ok: true,
        data: { conversationId: 'conv-kept', virtualEmployeeId: 've-remember' },
      }),
      'anx.communicate.conversations.messages.list': () => ({
        ok: true,
        data: { messages: [{ messageId: 'g1', role: 'assistant', content: 'Hello from the agent.' }] },
      }),
      'anx.communicate.stream-init': () => ({ ok: true, data: { endpoints: [] } }),
      'anx.communicate.message.send': () => ({
        ok: true,
        data: { greetingText: 'Hello from the agent.', dispatched: false },
      }),
    };
    const first = createNexusChat({
      lockedAgent: { virtualEmployeeId: 've-remember' },
      client: chatClient(sent, replies),
    });
    await first.whenLockedAgentReady;

    const secondSent: Sent[] = [];
    const second = createNexusChat({
      lockedAgent: { virtualEmployeeId: 've-remember' },
      client: chatClient(secondSent, replies),
    });
    await second.whenLockedAgentReady;
    expect(secondSent.some((entry) => entry.command === 'anx.communicate.conversations.create')).toBe(false);
    expect(secondSent.some((entry) => entry.command === 'anx.communicate.conversations.get')).toBe(true);
    expect(secondSent.some((entry) => entry.command === 'anx.communicate.message.send')).toBe(false);
    expect(second.getState().turns.map((turn) => turn.text)).toEqual(['Hello from the agent.']);
  });
});
