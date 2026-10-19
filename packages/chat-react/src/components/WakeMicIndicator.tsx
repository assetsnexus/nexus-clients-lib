/**
 * Plan Part W3 — visible mic indicator + opt-in toggle for wake listening.
 *
 * Shows a mic chip while the chat surface is open and reflect the idle
 * `wake_listening` state. The toggle only opts in/out of on-device listening;
 * it never authorizes, grants, or approves anything.
 *
 * When the surface reports `unavailable` (e.g. the openWakeWord ONNX artifact
 * is not installed) the indicator is informational only and the toggle is
 * hidden — a stub engine must never look enabled.
 */

import { useState } from 'react';
import {
  WAKE_NOT_AUTH_COPY,
  wakeIndicatorFacts,
  wakeIndicatorView,
  wakeToggleVisible,
  type WakeSurfaceStateSnapshot,
} from './wake-word-chrome.js';

export type WakeMicIndicatorProps = {
  snapshot: WakeSurfaceStateSnapshot | null;
  /** Opt in to on-device listening. Resolves false when the engine is unusable. */
  onOptIn?: () => void | Promise<void>;
  onOptOut?: () => void;
  className?: string;
  /** Render a compact dot-only chip (thread header). */
  compact?: boolean;
};

export function WakeMicIndicator({
  snapshot,
  onOptIn,
  onOptOut,
  className,
  compact,
}: WakeMicIndicatorProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const view = wakeIndicatorView(snapshot);

  if (!snapshot) return null;

  const runToggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (snapshot.optedIn) onOptOut?.();
      else await onOptIn?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`nexus-chat__wake${className ? ` ${className}` : ''}`}
      data-nexus-surface="wake-mic"
      data-wake-state={view.state}
      data-wake-live={view.live ? 'true' : 'false'}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6 }}
    >
      <button
        type="button"
        className="nexus-chat__chip nexus-chat__chip--clickable nexus-chat__wake-chip"
        aria-label={`Wake word: ${view.label}`}
        aria-pressed={snapshot.optedIn}
        aria-expanded={open}
        title={view.detail || view.label}
        onClick={() => setOpen((value) => !value)}
      >
        <span
          aria-hidden
          className={`nexus-chat__wake-dot${view.pulse ? ' nexus-chat__wake-dot--pulse' : ''}`}
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            display: 'inline-block',
            background: view.live
              ? 'var(--nx-chat-accent, #3fb950)'
              : view.unavailable
                ? 'var(--nx-chat-muted, #8b949e)'
                : 'var(--nx-chat-muted, #8b949e)',
            opacity: view.live ? 1 : 0.6,
          }}
        />
        <span aria-hidden>🎙</span>
        {!compact ? <span>{view.label}</span> : null}
      </button>

      {open ? (
        <div
          className="nexus-chat__wake-popover"
          role="dialog"
          aria-label="Wake word"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 6,
            zIndex: 30,
            minWidth: 240,
            maxWidth: 320,
            padding: 10,
            border: '1px solid var(--nx-chat-border, #2a3138)',
            borderRadius: 10,
            background: 'var(--nx-chat-surface, #161b22)',
            fontSize: 12,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
            {wakeIndicatorFacts(snapshot).map((fact) => (
              <div key={fact.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ color: 'var(--nx-chat-muted, #8b949e)' }}>{fact.label}</span>
                <span>{fact.value}</span>
              </div>
            ))}
          </div>
          {view.detail ? (
            <div style={{ color: 'var(--nx-chat-muted, #8b949e)', marginBottom: 8 }}>{view.detail}</div>
          ) : null}
          <div style={{ color: 'var(--nx-chat-muted, #8b949e)', marginBottom: 8 }}>{WAKE_NOT_AUTH_COPY}</div>
          {wakeToggleVisible(snapshot) ? (
            <button
              type="button"
              className={`nexus-chat__btn${snapshot.optedIn ? '' : ' nexus-chat__btn--primary'}`}
              disabled={busy}
              onClick={() => void runToggle()}
            >
              {snapshot.optedIn ? 'Turn off listening' : 'Listen for wake word'}
            </button>
          ) : (
            <div style={{ color: 'var(--nx-chat-muted, #8b949e)' }}>Wake word is not available here.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
