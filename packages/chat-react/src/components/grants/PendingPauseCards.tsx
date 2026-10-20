import { useState } from 'react';
import {
  modeLabel,
  type NexusChat,
  type PendingApprovalCard,
  type PendingClientToolCard,
  type PendingModeSwitchCard,
  type PendingPauseCard,
} from '@nexus/chat-core';

/**
 * One-click cards for the three pending-pause rails. The server has already
 * paused the turn; the host decides, and the matching `resolve*` call resumes it.
 * A `client_tool` card is only rendered when the tool needs an explicit
 * approval (a Plan-mode `write`); a runnable client tool resumes itself.
 */
export function PendingPauseCardView({
  card,
  chat,
  onResolved,
}: {
  card: PendingPauseCard;
  chat: NexusChat;
  onResolved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      if (!result.ok) {
        setError(result.message || 'Failed to resume');
        return;
      }
      onResolved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (card.kind === 'approval') {
    return (
      <ApprovalCardBody
        card={card}
        busy={busy}
        error={error}
        onApprove={() => void run(() => chat.resolveApproval({ callId: card.callId, approved: true }))}
        onContinueAgent={() =>
          void run(() => chat.resolveApproval({ callId: card.callId, approved: true, switchToMode: 'agent' }))
        }
        onDeny={() => void run(() => chat.resolveApproval({ callId: card.callId, approved: false }))}
      />
    );
  }

  if (card.kind === 'mode_switch') {
    return (
      <ModeSwitchCardBody
        card={card}
        busy={busy}
        error={error}
        onApprove={() => void run(() => chat.resolveModeSwitch({ callId: card.callId, approved: true }))}
        onDecline={() => void run(() => chat.resolveModeSwitch({ callId: card.callId, approved: false }))}
      />
    );
  }

  return (
    <ClientToolApprovalCardBody
      card={card}
      busy={busy}
      error={error}
      onApprove={() =>
        // Run the registered handler and resume with its REAL result. The old
        // synthetic `{ granted: true }` stub never executed the tool.
        void run(() => chat.approveClientTool({ callId: card.callId }))
      }
      onDeny={() =>
        void run(() => chat.approveClientTool({ callId: card.callId, approved: false }))
      }
    />
  );
}

function ApprovalCardBody({
  card,
  busy,
  error,
  onApprove,
  onContinueAgent,
  onDeny,
}: {
  card: PendingApprovalCard;
  busy: boolean;
  error: string | null;
  onApprove: () => void;
  onContinueAgent: () => void;
  onDeny: () => void;
}) {
  return (
    <div className="nexus-chat__grant-card" role="region" aria-label="Plan-mode write approval">
      <strong>Approval needed</strong>
      <div className="nexus-chat__muted">
        <code>{card.command}</code>
        {card.mutationClass ? ` · ${card.mutationClass}` : ''}
        {card.mode ? ` · ${modeLabel(card.mode)} mode` : ''}
      </div>
      <pre className="nexus-chat__viewer-pre nexus-chat__grant-args">
        {JSON.stringify(card.preview ?? card.arguments, null, 2)}
      </pre>
      <div className="nexus-chat__grant-actions">
        <button type="button" className="nexus-chat__btn nexus-chat__btn--primary" disabled={busy} onClick={onApprove}>
          Approve
        </button>
        <button type="button" className="nexus-chat__btn" disabled={busy} onClick={onContinueAgent}>
          Continue in Agent mode
        </button>
        <button type="button" className="nexus-chat__btn" disabled={busy} onClick={onDeny}>
          Decline
        </button>
      </div>
      {error ? <div className="nexus-chat__error">{error}</div> : null}
    </div>
  );
}

function ModeSwitchCardBody({
  card,
  busy,
  error,
  onApprove,
  onDecline,
}: {
  card: PendingModeSwitchCard;
  busy: boolean;
  error: string | null;
  onApprove: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="nexus-chat__grant-card" role="region" aria-label="Mode switch request">
      <strong>Switch mode?</strong>
      <div className="nexus-chat__muted">
        {modeLabel(card.from)} → {modeLabel(card.to)}
      </div>
      {card.reason ? <p className="nexus-chat__muted">{card.reason}</p> : null}
      {card.planRef ? <div className="nexus-chat__muted">Plan: {card.planRef}</div> : null}
      <div className="nexus-chat__grant-actions">
        <button type="button" className="nexus-chat__btn nexus-chat__btn--primary" disabled={busy} onClick={onApprove}>
          Switch to {modeLabel(card.to)}
        </button>
        <button type="button" className="nexus-chat__btn" disabled={busy} onClick={onDecline}>
          Stay in {modeLabel(card.from)}
        </button>
      </div>
      {error ? <div className="nexus-chat__error">{error}</div> : null}
    </div>
  );
}

function ClientToolApprovalCardBody({
  card,
  busy,
  error,
  onApprove,
  onDeny,
}: {
  card: PendingClientToolCard;
  busy: boolean;
  error: string | null;
  onApprove: () => void;
  onDeny: () => void;
}) {
  return (
    <div className="nexus-chat__grant-card" role="region" aria-label="Client tool approval">
      <strong>Client tool needs approval</strong>
      <div className="nexus-chat__muted">{card.name}</div>
      <pre className="nexus-chat__viewer-pre nexus-chat__grant-args">
        {JSON.stringify(card.arguments, null, 2)}
      </pre>
      <div className="nexus-chat__grant-actions">
        <button type="button" className="nexus-chat__btn nexus-chat__btn--primary" disabled={busy} onClick={onApprove}>
          Run
        </button>
        <button type="button" className="nexus-chat__btn" disabled={busy} onClick={onDeny}>
          Deny
        </button>
      </div>
      {error ? <div className="nexus-chat__error">{error}</div> : null}
    </div>
  );
}
