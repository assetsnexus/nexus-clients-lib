import { useState } from 'react';
import type { PanelState } from '@nexus/chat-core';
import { contextDonutModel } from './context-donut.js';
import { ContextDonut } from './ContextDonut.js';

function formatMinor(minor: number | undefined, currency?: string | null): string | null {
  if (minor == null || !Number.isFinite(minor)) return null;
  const cur = (currency || 'EUR').toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${cur}`;
  }
}

function costLabel(panel: PanelState | null): string {
  const usage = panel?.usage;
  const label =
    formatMinor(usage?.displayCostMinor, usage?.displayCurrency) ||
    formatMinor(usage?.costCents, usage?.displayCurrency);
  return label || '—';
}

/** Context percent (opens the usage pie) and conversation cost, for the column header. */
export function ContextCostMeters({ panel }: { panel: PanelState | null }) {
  const [open, setOpen] = useState(false);
  const usage = panel?.usage;
  const model = contextDonutModel({
    snapshot: usage?.contextSnapshot,
    tokensUsed: usage?.tokensUsed,
    maxContextTokens: usage?.maxContextTokens,
  });
  const pctLabel = model.pct == null ? '—' : `${model.pct}%`;
  const cost = costLabel(panel);

  return (
    <div className="nexus-chat__column-meters">
      <button
        type="button"
        className="nexus-chat__meter"
        data-nexus-context=""
        aria-label={`Context ${pctLabel}`}
        title="Context usage"
        onClick={() => setOpen(true)}
      >
        {pctLabel}
      </button>
      <span className="nexus-chat__meter nexus-chat__meter--cost" data-nexus-cost="" title="Cost">
        {cost}
      </span>
      {open ? (
        <div className="nexus-chat__sheet-backdrop" onClick={() => setOpen(false)} role="presentation">
          <div
            className="nexus-chat__sheet nexus-chat__context-panel"
            role="dialog"
            aria-label="Context"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="nexus-chat__sheet-header">
              <strong>Context</strong>
              <button type="button" className="nexus-chat__btn" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <ContextDonut model={model} />
            {model.slices.length ? (
              <ul className="nexus-chat__donut-legend">
                {model.slices.map((slice) => (
                  <li key={slice.category}>
                    <span>
                      <span className="nexus-chat__donut-dot" style={{ background: slice.color }} />
                      {slice.label}
                    </span>
                    <span>{slice.pct}%</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="nexus-chat__muted">{model.tokenLabel}</p>
            )}
            <p className="nexus-chat__context-cost" data-nexus-cost="">
              {cost}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
