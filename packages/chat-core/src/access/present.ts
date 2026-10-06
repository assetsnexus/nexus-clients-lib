import type { FundingGateState, FundedModality } from './types.js';
import { coverageByModality } from './coverage.js';

/** Millicents to a major-unit string using the currency exponent. EUR exponent 2: 140000 → "1.40". */
export function formatMillicents(millicents: number, exponent = 2): string {
  if (!Number.isFinite(millicents)) return '0';
  const minor = millicents / 1000;
  const major = minor / 10 ** exponent;
  return major.toFixed(exponent);
}

export function formatMinor(minor: number, exponent = 2): string {
  if (!Number.isFinite(minor)) return '0';
  return (minor / 10 ** exponent).toFixed(exponent);
}

export interface FundingQuickSelectModel {
  visible: boolean;
  blocking: boolean;
  meter: string | null;
  showByo: boolean;
  showResale: boolean;
  switchMessage: string | null;
  marginLabel: string | null;
  modalityGaps: string[];
  resalePrices: Array<{ modality: string; label: string }>;
}

export function fundingQuickSelectModel(state: FundingGateState, exponent = 2): FundingQuickSelectModel {
  const decision = state.decision;
  const caller = decision && decision.mode === 'caller_required' ? decision : null;
  const showByo = Boolean(caller?.options.byo);
  const showResale = Boolean(caller?.options.ownerResale);
  const visible = state.phase === 'open' || state.phase === 'switch' || state.phase === 'meter';
  let meter: string | null = null;
  if (decision && decision.mode === 'sponsored') {
    const daily = decision.allowanceMillicents?.daily;
    const weekly = decision.allowanceMillicents?.weekly;
    const left = formatMillicents(decision.remainingMillicents, exponent);
    if (daily != null) {
      meter = `${left} of ${formatMillicents(daily, exponent)} left today`;
      if (weekly != null) meter += `, weekly cap ${formatMillicents(weekly, exponent)}`;
    } else {
      meter = `${left} left before the allowance resets`;
    }
  }
  if (decision && decision.mode === 'funded' && decision.funding === 'owner_resale') {
    meter = `${formatMillicents(decision.remainingMillicents, exponent)} left on the pass`;
  }
  const gaps: string[] = [];
  if (caller?.options.byo) {
    const summary = coverageByModality(caller.options.byo.rows, caller.options.byo.models);
    for (const [modality, counts] of Object.entries(summary)) {
      if (counts.total > 0 && counts.covered === 0) gaps.push(`${modality}: not covered`);
    }
  }
  const prices =
    caller?.options.ownerResale?.unitPrices.map((row) => ({
      modality: row.modality,
      label: `${row.modality} ${formatMinor(row.priceMinorPerDisplayUnit, exponent)}`,
    })) || [];
  const marginBps = caller?.options.byo?.marginBps ?? caller?.options.ownerResale?.marginBps ?? 0;
  return {
    visible,
    blocking: state.phase === 'open' || state.phase === 'switch' || state.phase === 'denied',
    meter,
    showByo,
    showResale,
    switchMessage: state.phase === 'switch' ? state.switchOffer?.message || 'Subscription limit reached' : null,
    marginLabel: marginBps > 0 ? `Owner fee ${(marginBps / 100).toFixed(2)}% plus platform fee` : null,
    modalityGaps: gaps,
    resalePrices: prices,
  };
}

export const FUNDED_MODALITY_LABEL: Record<FundedModality, string> = {
  chat: 'Chat',
  vision: 'Vision',
  stt: 'Speech to text',
  tts: 'Text to speech',
  realtime: 'Realtime',
  image: 'Image',
  embedding: 'Embedding',
};
