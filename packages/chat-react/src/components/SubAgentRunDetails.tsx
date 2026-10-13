import { useState } from 'react';
import type { MessageDelivery, SubAgentStripItem } from '@nexus/chat-core';
import {
  SUB_AGENT_DELIVERIES,
  type SubAgentRunControls,
} from '../utils/sub-agent-overlay.js';

export function SubAgentRunDetails({
  run,
  busy,
  controls,
  onPause,
  onResume,
  onCancel,
  onOpen,
  onSteer,
}: {
  run: SubAgentStripItem;
  busy: boolean;
  controls: SubAgentRunControls;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onOpen: () => void;
  onSteer: (text: string, delivery: MessageDelivery) => Promise<boolean>;
}) {
  const [delivery, setDelivery] = useState<MessageDelivery>('steer');
  const [text, setText] = useState('');
  const canSend = text.trim().length > 0 && !busy;

  return (
    <div className="nexus-chat__subagents-row">
      <div>
        <strong>{run.mission}</strong>
        <div className="nexus-chat__muted">{run.status}</div>
        {run.error ? <div className="nexus-chat__error">{run.error}</div> : null}
      </div>
      <div className="nexus-chat__subagents-actions">
        {controls.openChat ? (
          <button
            type="button"
            className="nexus-chat__btn nexus-chat__btn--primary"
            disabled={busy}
            onClick={onOpen}
          >
            View chat
          </button>
        ) : null}
        {controls.pause ? (
          <button type="button" className="nexus-chat__btn" disabled={busy} onClick={onPause}>
            Pause
          </button>
        ) : null}
        {controls.resume ? (
          <button type="button" className="nexus-chat__btn" disabled={busy} onClick={onResume}>
            Resume
          </button>
        ) : null}
        {controls.cancel ? (
          <button type="button" className="nexus-chat__btn" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
      {controls.steer ? (
        <form
          className="nexus-chat__subagents-steer"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSend) return;
            void onSteer(text, delivery).then((sent) => {
              if (sent) setText('');
            });
          }}
        >
          <div className="nexus-chat__subagents-delivery" role="group" aria-label="Message delivery">
            {SUB_AGENT_DELIVERIES.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`nexus-chat__btn${delivery === option.value ? ' nexus-chat__btn--primary' : ''}`}
                aria-pressed={delivery === option.value}
                title={option.hint}
                disabled={busy}
                onClick={() => setDelivery(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="nexus-chat__subagents-compose">
            <input
              className="nexus-chat__subagents-input"
              type="text"
              value={text}
              maxLength={2000}
              placeholder="Message the sub-agent…"
              aria-label="Message the sub-agent"
              disabled={busy}
              onChange={(event) => setText(event.target.value)}
            />
            <button type="submit" className="nexus-chat__btn nexus-chat__btn--primary" disabled={!canSend}>
              Send
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
