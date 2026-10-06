import type { AccessDecision, FundingGateState, SubscriptionLimitSwitch } from './types.js';

export function initialFundingGate(): FundingGateState {
  return {
    phase: 'closed',
    decision: null,
    activeFunding: null,
    grantId: null,
    selectedFunding: null,
    switchOffer: null,
    reason: null,
  };
}

function bothPaidModes(decision: AccessDecision | null): boolean {
  if (!decision || decision.mode !== 'caller_required') return false;
  return Boolean(decision.options.byo && decision.options.ownerResale);
}

/**
 * Apply a region resolve decision. Sponsored stays on the meter.
 * Caller-required opens the gate. Nothing picks a paid mode for the user.
 */
export function applyAccessDecision(state: FundingGateState, decision: AccessDecision): FundingGateState {
  if (!decision || typeof decision !== 'object' || !('mode' in decision)) {
    return { ...state, phase: 'denied', reason: 'invalid_decision' };
  }
  if (decision.mode === 'owner') {
    return { ...initialFundingGate(), decision, activeFunding: 'owner', phase: 'closed' };
  }
  if (decision.mode === 'sponsored') {
    return {
      ...initialFundingGate(),
      decision,
      activeFunding: 'sponsor',
      phase: 'meter',
    };
  }
  if (decision.mode === 'funded') {
    return {
      ...initialFundingGate(),
      decision,
      activeFunding: decision.funding,
      grantId: decision.grantId,
      selectedFunding: decision.funding,
      phase: 'closed',
    };
  }
  if (decision.mode === 'denied') {
    return { ...initialFundingGate(), decision, phase: 'denied', reason: decision.reason || 'denied' };
  }
  return {
    ...state,
    decision,
    phase: 'open',
    activeFunding: state.activeFunding === 'byo' || state.activeFunding === 'owner_resale' ? state.activeFunding : null,
    grantId: null,
    switchOffer: null,
    reason: decision.reason || null,
  };
}

export interface TurnFundingFailure {
  httpStatus?: number;
  code?: string;
  kind?: string;
  message?: string;
  switchOffer?: SubscriptionLimitSwitch | null;
}

function isExpired(failure: TurnFundingFailure): boolean {
  const code = String(failure.code || failure.kind || '').toUpperCase();
  if (code === 'AGENT_ACCESS_REQUIRED' || code === 'FUNDING_EXPIRED' || code === 'EXPIRED' || code === 'GRANT_EXPIRED') {
    return true;
  }
  if (failure.httpStatus === 402 && code !== 'SUBSCRIPTION_LIMIT_REACHED') return true;
  return /funding\.expired/i.test(String(failure.message || ''));
}

/**
 * A 402 or an expired grant re-opens the gate.
 * A subscription limit offers the other mode and leaves the active funding unchanged.
 */
export function applyTurnFailure(state: FundingGateState, failure: TurnFundingFailure): FundingGateState {
  const code = String(failure.code || '').toUpperCase();
  if (code === 'SUBSCRIPTION_LIMIT_REACHED') {
    const offer = failure.switchOffer;
    if (!offer || offer.alternateFunding === offer.failedFunding) {
      return {
        ...state,
        phase: 'denied',
        switchOffer: null,
        reason: 'subscription_limit',
      };
    }
    if (offer.failedFunding !== state.activeFunding && state.activeFunding) {
      return state;
    }
    return {
      ...state,
      phase: 'switch',
      switchOffer: offer,
      reason: offer.message || 'subscription_limit',
    };
  }
  if (isExpired(failure)) {
    return {
      ...state,
      phase: 'open',
      grantId: null,
      switchOffer: null,
      reason: 'expired',
    };
  }
  return state;
}

/**
 * Record the user's choice. Does not attach a grant and does not change activeFunding.
 * Switching is refused when the agent does not offer that mode.
 */
export function selectFunding(
  state: FundingGateState,
  funding: 'byo' | 'owner_resale',
): FundingGateState {
  const decision = state.decision;
  const options = decision && decision.mode === 'caller_required' ? decision.options : null;
  const offered =
    (funding === 'byo' && Boolean(options?.byo)) ||
    (funding === 'owner_resale' && Boolean(options?.ownerResale));
  if (!offered && state.phase !== 'switch') {
    return state;
  }
  if (state.phase === 'switch' && state.switchOffer && funding !== state.switchOffer.alternateFunding) {
    return state;
  }
  return {
    ...state,
    selectedFunding: funding,
    phase: state.phase === 'switch' ? 'open' : state.phase,
    switchOffer: state.phase === 'switch' ? null : state.switchOffer,
  };
}

export function paidModesOffered(state: FundingGateState): { byo: boolean; ownerResale: boolean } {
  const decision = state.decision;
  if (!decision || decision.mode !== 'caller_required') {
    return { byo: false, ownerResale: false };
  }
  return {
    byo: Boolean(decision.options.byo),
    ownerResale: Boolean(decision.options.ownerResale),
  };
}

export function canSwitchFunding(state: FundingGateState): boolean {
  return bothPaidModes(state.decision) || state.phase === 'switch';
}
