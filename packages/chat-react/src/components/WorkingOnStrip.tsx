/**
 * Plan Part C9 — "working on" strip (active runs + open ledger items).
 *
 * Shown in the chat chrome for both the app and the portal. Purely presentational:
 * it reads the runs/ledger the host already has.
 */

import {
  buildWorkingOnSummary,
  type WorkingOnLedgerInput,
  type WorkingOnRunInput,
} from '../chrome/chat-chrome-cards.js';

export type WorkingOnStripProps = {
  runs?: WorkingOnRunInput[];
  ledger?: WorkingOnLedgerInput[];
  className?: string;
  /** Called when a run chip is clicked (e.g. open run details). */
  onSelect?: (item: { id: string; kind: 'run' | 'ledger' }) => void;
};

export function WorkingOnStrip({
  runs,
  ledger,
  className,
  onSelect,
}: WorkingOnStripProps) {
  const summary = buildWorkingOnSummary({ runs, ledger });
  if (!summary.items.length) {
    return <div className={className} data-nexus-surface="working-on" hidden />;
  }

  return (
    <div
      className={className}
      data-nexus-surface="working-on"
      role="region"
      aria-label="Working on"
      style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12 }}
    >
      <span style={{ color: 'var(--nx-chat-muted)' }}>{summary.headline}</span>
      {summary.items.map((item) => (
        <button
          key={`${item.kind}:${item.id}`}
          type="button"
          className={`nexus-chat__chip${item.needsUser ? ' nexus-chat__chip--warn' : ''}`}
          title={item.status}
          onClick={onSelect ? () => onSelect({ id: item.id, kind: item.kind }) : undefined}
          style={{ padding: '1px 8px', cursor: onSelect ? 'pointer' : 'default' }}
        >
          {item.kind === 'run' ? '⏳ ' : '• '}
          {item.label}
        </button>
      ))}
    </div>
  );
}
