import { useState } from 'react';
import {
  fundingQuickSelectModel,
  type FundingGateState,
} from '@nexus/chat-core';

export type FundingQuickSelectProps = {
  gate: FundingGateState;
  currencyExponent?: number;
  busy?: boolean;
  onSelectFunding?: (funding: 'byo' | 'owner_resale') => void;
  onRenew?: () => void;
  onByok?: () => void;
};

/** Shared funding dialog. The gate state machine lives in chat-core. */
export function FundingQuickSelect({
  gate,
  currencyExponent = 2,
  busy = false,
  onSelectFunding,
  onRenew,
  onByok,
}: FundingQuickSelectProps) {
  const model = fundingQuickSelectModel(gate, currencyExponent);
  const [passAmount, setPassAmount] = useState('');
  if (!model.visible && gate.phase !== 'denied') return null;
  const resale = gate.decision && gate.decision.mode === 'caller_required' ? gate.decision.options.ownerResale : null;
  return (
    <section className="nexus-funding-quick" role="dialog" aria-label="How this chat is paid">
      {model.meter ? <p className="nexus-funding-quick__meter">{model.meter}</p> : null}
      {model.switchMessage ? <p className="nexus-funding-quick__switch">{model.switchMessage}</p> : null}
      {gate.phase === 'denied' ? <p className="nexus-funding-quick__switch">{gate.reason || 'This agent is not available.'}</p> : null}
      {model.marginLabel ? <p className="nexus-funding-quick__meter">{model.marginLabel}</p> : null}
      {model.modalityGaps.map((gap) => (
        <p key={gap} className="nexus-funding-quick__gap">{gap}</p>
      ))}
      <div className="nexus-funding-quick__actions">
        {model.showByo ? (
          <button type="button" disabled={busy} onClick={() => onSelectFunding?.('byo')}>
            Use my subscription
          </button>
        ) : null}
        {model.showByo && onByok ? (
          <button type="button" disabled={busy} onClick={onByok}>
            Add my own key
          </button>
        ) : null}
        {model.showResale ? (
          <button type="button" disabled={busy} onClick={() => onSelectFunding?.('owner_resale')}>
            Buy a pass
          </button>
        ) : null}
        {gate.phase === 'open' && gate.reason === 'expired' && onRenew ? (
          <button type="button" disabled={busy} onClick={onRenew}>
            Renew
          </button>
        ) : null}
      </div>
      {model.showResale && resale ? (
        <label className="nexus-funding-quick__pass">
          Pass amount ({resale.minPassMinor}
          {resale.maxPassMinor != null ? `–${resale.maxPassMinor}` : ''})
          <input
            inputMode="numeric"
            value={passAmount}
            onChange={(event) => setPassAmount(event.target.value)}
            aria-label="Pass amount"
          />
        </label>
      ) : null}
      {model.resalePrices.map((row) => (
        <p key={row.modality} className="nexus-funding-quick__gap">{row.label}</p>
      ))}
    </section>
  );
}
