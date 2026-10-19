/**
 * Plan Part C5 — read-only "What can my agent do?" card.
 *
 * Renders a summary of capabilities, tool packs, outbound channels and masked
 * audiences. Read-only: it never grants or revokes anything.
 */

import {
  buildPermissionSummary,
  type PermissionSummaryInput,
} from '../chrome/chat-chrome-cards.js';

export type PermissionSummaryCardProps = PermissionSummaryInput & {
  className?: string;
  /** When true renders a compact single-line summary (chat chrome chip). */
  compact?: boolean;
};

export function PermissionSummaryCard({
  className,
  compact,
  ...input
}: PermissionSummaryCardProps) {
  const summary = buildPermissionSummary(input);

  if (compact) {
    return (
      <div
        className={className}
        data-nexus-surface="permission-summary"
        title={summary.headline}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: 'var(--nx-chat-muted)',
        }}
      >
        <span aria-hidden>🔐</span>
        <span>{summary.headline}</span>
      </div>
    );
  }

  return (
    <div
      className={className}
      data-nexus-surface="permission-summary"
      role="region"
      aria-label="What this agent can do"
      style={{
        border: '1px solid var(--nx-chat-border, #2a3138)',
        borderRadius: 10,
        padding: 12,
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>What this agent can do</div>
      <div style={{ color: 'var(--nx-chat-muted)', marginBottom: 8 }}>{summary.headline}</div>
      {summary.sections.map((section) => (
        <div key={section.key} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {section.label}
            {section.masked ? ' (masked)' : ''}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {section.items.map((item, i) => (
              <span
                key={`${section.key}:${i}`}
                className="nexus-chat__chip"
                style={{ padding: '1px 6px' }}
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      ))}
      <div style={{ fontSize: 12, color: 'var(--nx-chat-muted)', marginTop: 6 }}>
        Approvals: {summary.approvalMode === 'auto' ? 'automatic' : 'ask me per command'}
      </div>
    </div>
  );
}
