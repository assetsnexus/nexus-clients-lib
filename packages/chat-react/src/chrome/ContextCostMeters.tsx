import { useState } from 'react';
import type { PanelState } from '@nexus/chat-core';
import { usageBarModel } from '@nexus/chat-core';
import { contextDonutModel } from './context-donut.js';
import { ContextDonut } from './ContextDonut.js';
import { UsageBars } from './UsageBars.js';

/** Context + cache-hit dual bar (opens the usage pie), for the column header. */
export function ContextCostMeters({ panel }: { panel: PanelState | null }) {
  const [open, setOpen] = useState(false);
  const usage = panel?.usage;
  const model = contextDonutModel({
    snapshot: usage?.contextSnapshot,
    tokensUsed: usage?.tokensUsed,
    maxContextTokens: usage?.maxContextTokens,
  });
  const bars = usageBarModel(usage);

  return (
    <div className="nexus-chat__column-meters">
      <button
        type="button"
        className="nexus-chat__meter"
        data-nexus-context=""
        aria-label={`Context ${model.pct == null ? '—' : `${model.pct}%`}`}
        title="Context usage and prompt-cache hit rate"
        onClick={() => setOpen(true)}
      >
        <UsageBars usage={usage} compact />
      </button>
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
            {bars.hasAny ? (
              <div className="nexus-chat__context-bars" data-nexus-usage="">
                <UsageBars usage={usage} />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
