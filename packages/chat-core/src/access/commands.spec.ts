import { describe, expect, it, vi } from 'vitest';
import { createAgentAccessClient, unwrapCommand } from './commands.js';

describe('agent access client', () => {
  it('runs BYOK quick mode through register, discover, and models.save', async () => {
    const sent: string[] = [];
    const client = createAgentAccessClient({
      async send(command, payload) {
        sent.push(command);
        if (command === 'anx.ai.byok.register') return { ok: true, data: { providerId: payload?.providerId } };
        if (command === 'anx.ai.byok.discover-models') {
          return { ok: true, data: { models: [{ id: 'deepseek/deepseek-v4-pro' }, { id: 'other' }] } };
        }
        if (command === 'anx.ai.byok.fee-quote') return { ok: true, data: { consentRequired: false } };
        if (command === 'anx.ai.byok.models.save') {
          expect(payload?.models).toEqual([{ id: 'deepseek/deepseek-v4-pro', enabled: true }]);
          return { ok: true, data: { saved: true } };
        }
        return { ok: true, data: {} };
      },
    });
    const result = await client.byokQuick({
      providerId: 'openrouter',
      apiKey: 'sk-test',
      idempotencyKey: 'once',
      agentModelKey: 'deepseek/deepseek-v4-pro',
    });
    expect(result.step).toBe('saved');
    expect(sent).toEqual([
      'anx.ai.byok.register',
      'anx.ai.byok.discover-models',
      'anx.ai.byok.fee-quote',
      'anx.ai.byok.models.save',
    ]);
  });

  it('surfaces a subscription-limit switch from a 402 body', () => {
    expect(() =>
      unwrapCommand({
        responseCode: 402,
        responseObject: {
          code: 'SUBSCRIPTION_LIMIT_REACHED',
          message: 'limit',
          failedFunding: 'byo',
          alternateFunding: 'owner_resale',
        },
      }),
    ).toThrow(/limit/);
  });

  it('attaches a grant to a room and rejects a bad pass amount', async () => {
    const send = vi.fn(async () => ({ ok: true, data: { roomId: 'room-1' } }));
    const client = createAgentAccessClient({ send });
    await client.attachToRoom('room-1', 'grant-1');
    expect(send).toHaveBeenCalledWith('anx.communicate.rooms.funding.attach', {
      roomId: 'room-1',
      grantId: 'grant-1',
    });
    expect(() =>
      client.purchasePass({
        target: { kind: 'virtual_employee', veId: 've-1' },
        amountMinor: 1.5,
        currency: 'EUR',
        buyerWalletId: 'wallet-1',
        idempotencyKey: 'idem-1234',
      }),
    ).toThrow(/positive integer/);
  });
});
