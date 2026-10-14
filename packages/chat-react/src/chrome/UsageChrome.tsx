import { useState, type ReactNode } from 'react';
import type { PanelState, ReasoningEffortLevel } from '@nexus/chat-core';
import { ModelPicker } from '../components/ModelPicker.js';
import type { PickerModel } from '../models/picker-types.js';
import { contextDonutModel } from './context-donut.js';
import { ContextDonut } from './ContextDonut.js';
import { ReasoningEffortControl } from './ReasoningEffortControl.js';
import { ADVANCED_USAGE_OPEN_BY_DEFAULT } from './usage-disclosure.js';
import { advancedCatalogNotice, advancedModelFacts, contextUsageVisible } from './advanced-model-facts.js';

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
  variant = 'bar',
  effectiveModel = null,
  modelsError = null,
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
  /** `advanced` hides context, cost, and model selection until the user opens it. */
  variant?: 'bar' | 'advanced';
  /** Selected model, or the agent default resolved from the catalog. */
  effectiveModel?: PickerModel | null;
  /** Catalog command failed. Shown instead of placeholder values. */
  modelsError?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const usage = panel?.usage;
  const model = contextDonutModel({
    snapshot: usage?.contextSnapshot,
    tokensUsed: usage?.tokensUsed,
    maxContextTokens: usage?.maxContextTokens,
  });
  const costLabel =
    usage?.displayCostMinor != null
      ? formatMinor(usage.displayCostMinor, usage.displayCurrency)
      : usage?.costCents != null
        ? formatMinor(usage.costCents, usage.displayCurrency)
        : null;
  const cost = costLabel && costLabel !== '—' ? costLabel : null;
  const facts = models.length ? advancedModelFacts(effectiveModel ?? null) : null;
  const showContext = contextUsageVisible(model);
  const catalogNotice = advancedCatalogNotice({
    modelsError,
    modelCount: models.length,
    loading: modelsLoading,
  });

  if (variant === 'advanced') {
    return (
      <details className="nexus-chat__advanced" open={ADVANCED_USAGE_OPEN_BY_DEFAULT || undefined}>
        <summary>Advanced</summary>
        <div className="nexus-chat__advanced-body">
          {unavailable ? nexusLogin : null}
          <div data-nexus-model="">
            <ModelPicker
              models={models}
              value={selectedModelId}
              loading={modelsLoading}
              onChange={onSelectModel}
            />
          </div>
          <ReasoningEffortControl
            levels={reasoningLevels}
            value={reasoningEffort}
            onChange={onReasoningEffort}
          />
          {catalogNotice ? (
            <p className="nexus-chat__muted" role={modelsError ? 'alert' : undefined}>
              {catalogNotice}
            </p>
          ) : null}
          {facts ? (
            <div className="nexus-chat__model-facts" data-nexus-model-facts="">
              {facts.name ? <strong>{facts.name}</strong> : null}
              {facts.author ? <span>{facts.author}</span> : null}
              {facts.price ? <span title="Catalog price">{facts.price}</span> : null}
              {facts.intel ? <span title="Intelligence score">{facts.intel}</span> : null}
            </div>
          ) : null}
          {showContext ? (
            <div data-nexus-context="">
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
              ) : model.tokenLabel && model.tokenLabel !== '—' ? (
                <p className="nexus-chat__muted">{model.tokenLabel}</p>
              ) : null}
            </div>
          ) : null}
          {cost ? (
            <div data-nexus-cost="" title="Cost">
              {cost}
            </div>
          ) : null}
        </div>
      </details>
    );
  }

  if (unavailable) {
    if (!nexusLogin) return null;
    return (
      <div className="nexus-chat__usage" data-nexus-surface="nexus-login">
        {nexusLogin}
      </div>
    );
  }

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
        {cost || '—'}
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
            <div>{cost || '—'}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
