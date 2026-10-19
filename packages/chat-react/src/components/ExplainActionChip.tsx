/**
 * Plan Part C8 — explain-last-action chip.
 *
 * A small chip that answers "why did the agent do that?" using the reason /
 * activity data the backend supplies. It never fabricates a reason; when none is
 * available it says so.
 */

import { useState } from 'react';
import { explainLastAction, type ExplainActionInput } from '../chrome/chat-chrome-cards.js';

export type ExplainActionChipProps = ExplainActionInput & {
  className?: string;
  /** Controlled open state (optional). */
  open?: boolean;
  onToggle?: (open: boolean) => void;
};

export function ExplainActionChip({
  className,
  open,
  onToggle,
  ...input
}: ExplainActionChipProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const action = explainLastAction(input);

  const toggle = () => {
    const next = !isOpen;
    if (onToggle) onToggle(next);
    else setInternalOpen(next);
  };

  return (
    <span
      className={className}
      data-nexus-surface="explain-action"
      style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}
    >
      <button
        type="button"
        className="nexus-chat__chip"
        aria-expanded={isOpen}
        title="Why did the agent do this?"
        onClick={toggle}
        style={{ padding: '1px 8px', cursor: 'pointer' }}
      >
        Why? {action.needsApproval ? '⚠︎ ' : ''}
        {action.title}
      </button>
      {isOpen ? (
        <span
          role="note"
          style={{
            display: 'block',
            fontSize: 12,
            color: 'var(--nx-chat-muted)',
            padding: '6px 8px',
            borderLeft: '2px solid var(--nx-chat-border, #2a3138)',
          }}
        >
          <span style={{ display: 'block' }}>{action.why}</span>
          {action.argSummary ? (
            <span style={{ display: 'block', opacity: 0.75 }}>args: {action.argSummary}</span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
