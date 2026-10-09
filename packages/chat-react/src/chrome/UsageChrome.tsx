import { useState, type ReactNode } from 'react';
import type { PanelState, ReasoningEffortLevel } from '@nexus/chat-core';
import { ModelPicker } from '../components/ModelPicker.js';
import type { PickerModel } from '../models/picker-types.js';
import { contextDonutModel } from './context-donut.js';
import { ContextDonut } from './ContextDonut.js';
import { ReasoningEffortControl } from './ReasoningEffortControl.js';

function formatMinor(minor: number | undefined, currency?: string | null): string {
  if (minor == null || !Number.isFinite(minor)) return '—';
  const cur = (currency || 'EUR').toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${cur}`;
  }
}

export function UsageChrome({
  panel,
  models,
  modelsLoading,
  selectedModelId,
  onSelectModel,
  reasoningLevels,
  reasoningEffort,
  onReasoningEffort,
  unavailable,
  nexusLogin,
}: {
  panel: PanelState | null;
  models: PickerModel[];
  modelsLoading?: boolean;
  selectedModelId: string | null;
  onSelectModel: (modelId: string | null) => void;
  reasoningLevels: readonly ReasoningEffortLevel[] | null;
  reasoningEffort: ReasoningEffortLevel | null;
  onReasoningEffort: (next: ReasoningEffortLevel | null) => void;
  unavailable?: boolean;
  nexusLogin?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (unavailable) {
    if (!nexusLogin) return null;
    return (
      <div className="nexus-chat__usage" data-nexus-surface="nexus-login">
        {nexusLogin}
      </div>
    );
  }

  const usage = panel?.usage;
  const model = contextDonutModel({
    snapshot: usage?.contextSnapshot,
    tokensUsed: usage?.tokensUsed,
    maxContextTokens: usage?.maxContextTokens,
  });
  const cost =
    usage?.displayCostMinor != null
      ? formatMinor(usage.displayCostMinor, usage.displayCurrency)
      : usage?.costCents != null
        ? formatMinor(usage.costCents, usage.displayCurrency)
        : '—';

  return (
    <div className="nexus-chat__usage">
      <div data-nexus-model="">
        <ModelPicker models={models} value={selectedModelId} loading={modelsLoading} onChange={onSelectModel} />
      </div>
      <ReasoningEffortControl levels={reasoningLevels} value={reasoningEffort} onChange={onReasoningEffort} />
      <button
        type="button"
        className="nexus-chat__btn"
        data-nexus-context=""
        title="Context usage"
        onClick={() => setOpen(true)}
      >
        {model.pct == null ? '—' : `${model.pct}%`}
      </button>
      <span data-nexus-cost="" title="Cost">
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
            <div>{cost}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
