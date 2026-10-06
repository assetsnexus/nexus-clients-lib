import { describe, expect, it } from 'vitest';
import { applyAccessDecision, applyTurnFailure, initialFundingGate, selectFunding } from './gate.js';
import { annotateCoverage } from './coverage.js';
import { fundingQuickSelectModel } from './present.js';
import type { AccessDecision } from './types.js';

const both: AccessDecision = {
  mode: 'caller_required',
  reason: 'allowance_exhausted',
  options: {
    byo: {
      marginBps: 1500,
      minPerTurnMillicents: 0,
      models: { chat: 'deepseek/deepseek-v4-pro', stt: 'stt-1' },
      rows: [
        { id: 'sub-1', source: 'subscription', label: 'Pro', covers: { chat: true, stt: false } },
        { id: 'key-1', source: 'proxy_key', label: 'Proxy', covers: {}, modelRefs: ['other-model'] },
      ],
    },
    ownerResale: {
      marginBps: 0,
      minPassMinor: 500,
      passTtlHours: 24,
      models: { chat: 'deepseek/deepseek-v4-pro' },
      unitPrices: [],
      realtimeAvailable: false,
    },
  },
};

describe('funding gate', () => {
  it('walks sponsored, then exhausted, then a grant, then expiry, then renew', () => {
    let state = applyAccessDecision(initialFundingGate(), {
      mode: 'sponsored',
      remainingMillicents: 140_000,
      resetsAt: '2026-10-07T00:00:00.000Z',
      allowanceMillicents: { daily: 200_000, weekly: 500_000 },
    });
    expect(state.phase).toBe('meter');
    expect(state.activeFunding).toBe('sponsor');
    expect(fundingQuickSelectModel(state).meter).toContain('1.40 of 2.00');

    state = applyAccessDecision(state, both);
    expect(state.phase).toBe('open');
    expect(state.activeFunding).toBeNull();

    state = selectFunding(state, 'byo');
    expect(state.selectedFunding).toBe('byo');
    expect(state.activeFunding).toBeNull();

    state = applyAccessDecision(state, {
      mode: 'funded',
      grantId: 'grant-1',
      funding: 'byo',
      remainingMillicents: 5_000_000,
    });
    expect(state.phase).toBe('closed');
    expect(state.grantId).toBe('grant-1');

    state = applyTurnFailure(state, { httpStatus: 402, code: 'AGENT_ACCESS_REQUIRED', message: 'funding.expired' });
    expect(state.phase).toBe('open');
    expect(state.grantId).toBeNull();

    state = applyAccessDecision(state, {
      mode: 'funded',
      grantId: 'grant-1',
      funding: 'byo',
      remainingMillicents: 4_000_000,
    });
    expect(state.phase).toBe('closed');
    expect(state.grantId).toBe('grant-1');
  });

  it('offers the other paid mode on a subscription limit and does not switch by itself', () => {
    let state = applyAccessDecision(initialFundingGate(), {
      mode: 'funded',
      grantId: 'grant-byo',
      funding: 'byo',
      remainingMillicents: 1000,
    });
    state = {
      ...state,
      decision: both,
    };
    state = applyTurnFailure(state, {
      httpStatus: 402,
      code: 'SUBSCRIPTION_LIMIT_REACHED',
      switchOffer: {
        code: 'SUBSCRIPTION_LIMIT_REACHED',
        failedFunding: 'byo',
        alternateFunding: 'owner_resale',
        message: 'Your subscription hit its limit. Buy a pass to continue.',
      },
    });
    expect(state.phase).toBe('switch');
    expect(state.activeFunding).toBe('byo');
    expect(state.grantId).toBe('grant-byo');
    expect(state.selectedFunding).toBe('byo');

    const ignored = selectFunding(state, 'byo');
    expect(ignored.selectedFunding).toBe('byo');
    expect(ignored.phase).toBe('switch');

    const switched = selectFunding(state, 'owner_resale');
    expect(switched.selectedFunding).toBe('owner_resale');
    expect(switched.activeFunding).toBe('byo');
    expect(switched.phase).toBe('open');
  });

  it('denies a subscription limit when the other mode is not offered', () => {
    const state = applyAccessDecision(initialFundingGate(), {
      mode: 'funded',
      grantId: 'g',
      funding: 'byo',
      remainingMillicents: 1,
    });
    const next = applyTurnFailure(state, {
      code: 'SUBSCRIPTION_LIMIT_REACHED',
      switchOffer: null,
    });
    expect(next.phase).toBe('denied');
    expect(next.activeFunding).toBe('byo');
  });

  it('marks coverage per modality and leaves uncovered rows visible', () => {
    const rows = annotateCoverage(both.mode === 'caller_required' ? both.options.byo!.rows : [], 'chat', 'deepseek/deepseek-v4-pro');
    expect(rows.find((row) => row.id === 'sub-1')?.coversModel).toBe(true);
    const proxy = rows.find((row) => row.id === 'key-1');
    expect(proxy?.coversModel).toBe(false);
    expect(proxy?.disabledReason).toContain('deepseek/deepseek-v4-pro');
    const voice = annotateCoverage(both.mode === 'caller_required' ? both.options.byo!.rows : [], 'stt', 'stt-1');
    expect(voice.find((row) => row.id === 'sub-1')?.coversModel).toBe(false);
  });
});
