import { useEffect, useState } from 'react';
import {
  isScheduleCheckBackTool,
  parseMediaImages,
  presentToolRunRow,
  type ChatToolRun,
  type NexusChat,
} from '@nexus/chat-core';
import { CheckBackCard } from './grants/CheckBackCard.js';
import { ExplainActionChip } from './ExplainActionChip.js';
import {
  explainHasReason,
  explainInputFromRun,
  type ExplainActionInput,
} from '../chrome/chat-chrome-cards.js';
import type { ViewerFileRef } from '../viewer/load-preview.js';

export type ToolTimelineRowProps = {
  run: ChatToolRun;
  chat?: NexusChat;
  conversationId?: string | null;
  onOpenFile?: (file: ViewerFileRef) => void;
};

// Plan Part C8 — `explainInputFromRun` / `explainHasReason` now live in
// `@nexus/chat-core` so the portal (chat-vue2) shares the exact same derivation.
export { explainInputFromRun, explainHasReason };
export type { ExplainActionInput };

function startsOpen(status: string): boolean {
  return status === 'error' || status === 'reverted' || status === 'needs_approval' || status === 'mode_blocked';
}

export function ToolTimelineRow({ run, chat, conversationId, onOpenFile }: ToolTimelineRowProps) {
  const status = run.status || 'running';
  const [open, setOpen] = useState(() => startsOpen(status));
  useEffect(() => {
    if (startsOpen(status)) setOpen(true);
  }, [status]);

  const mod =
    status === 'error' || status === 'mode_blocked' || status === 'reverted'
      ? 'nexus-chat__tool-row--error'
      : status === 'needs_approval'
        ? 'nexus-chat__tool-row--approval'
        : '';

  if (chat && isScheduleCheckBackTool(run.tool)) {
    return (
      <div className={`nexus-chat__tool-row ${mod}`.trim()}>
        <strong>{run.label || run.tool}</strong>
        <span> · {status}</span>
        <CheckBackCard run={run} chat={chat} conversationId={conversationId} />
        {run.error ? <div className="nexus-chat__error">{run.error}</div> : null}
      </div>
    );
  }

  const images = parseMediaImages(run.result);
  const row = presentToolRunRow(run);
  const argsText = Object.keys(run.args || {}).length ? JSON.stringify(run.args, null, 2) : '';

  return (
    <div className={`nexus-chat__tool-row ${mod}${open ? ' nexus-chat__tool-row--open' : ''}`.trim()}>
      <button
        type="button"
        className="nexus-chat__tool-head"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <strong>{row.name}</strong>
        {row.server ? <span className="nexus-chat__tool-server">{row.server}</span> : null}
        <span className="nexus-chat__tool-status">{row.status}</span>
        <span className="nexus-chat__tool-chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {/* Plan Part C8 — explain the last action ("why") when the backend supplies
          a reason. No reason => no chip (rather than an "unknown" affordance). */}
      {explainHasReason(run) ? (
        <div style={{ margin: '2px 0 6px' }}>
          <ExplainActionChip {...explainInputFromRun(run)} />
        </div>
      ) : null}
      {images.length ? (
        <div className="nexus-chat__media-strip" role="list">
          {images.map((img) => (
            <button
              key={`${img.index}-${img.imageUrl}`}
              type="button"
              className="nexus-chat__media-thumb"
              title={img.label}
              onClick={() =>
                onOpenFile?.({
                  id: img.fileId || `img-${img.index}-${img.imageUrl}`,
                  name: img.label || `Image ${img.index}`,
                  mimeType: 'image/*',
                  url: img.imageUrl,
                })
              }
            >
              <img src={img.imageUrl} alt={img.label} />
            </button>
          ))}
        </div>
      ) : null}
      {row.files.length ? (
        <div className="nexus-chat__file-chips">
          {row.files.map((file, index) => (
            <button
              key={`${file.fileId || file.label}-${index}`}
              type="button"
              className="nexus-chat__chip nexus-chat__chip--clickable"
              onClick={() =>
                onOpenFile?.({
                  id: file.fileId || `file-${file.label}-${index}`,
                  name: file.label,
                  mimeType: file.mimeType,
                  url: file.presignedUrl,
                  downloadUrl: file.presignedUrl,
                })
              }
            >
              {file.label}
            </button>
          ))}
        </div>
      ) : null}
      {open ? (
        <div className="nexus-chat__tool-details">
          {run.error ? <div className="nexus-chat__error">{run.error}</div> : null}
          {row.resultText ? <pre className="nexus-chat__tool-result">{row.resultText}</pre> : null}
          {argsText ? <pre className="nexus-chat__tool-result">{argsText}</pre> : null}
        </div>
      ) : null}
    </div>
  );
}
