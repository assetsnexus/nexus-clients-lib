import {
  isScheduleCheckBackTool,
  parseMediaImages,
  parsePresentFileItems,
  type ChatToolRun,
  type NexusChat,
} from '@nexus/chat-core';
import { CheckBackCard } from './grants/CheckBackCard.js';
import type { ViewerFileRef } from '../viewer/load-preview.js';

export type ToolTimelineRowProps = {
  run: ChatToolRun;
  chat?: NexusChat;
  conversationId?: string | null;
  onOpenFile?: (file: ViewerFileRef) => void;
};

export function ToolTimelineRow({ run, chat, conversationId, onOpenFile }: ToolTimelineRowProps) {
  const status = run.status || 'running';
  const mod =
    status === 'error' || status === 'mode_blocked'
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
  const files = parsePresentFileItems(run.result);
  const showMedia = images.length > 0;
  const showFiles = files.length > 0;

  return (
    <div className={`nexus-chat__tool-row ${mod}`.trim()}>
      <strong>{run.label || run.tool}</strong>
      <span> · {status}</span>
      {run.error ? <div className="nexus-chat__error">{run.error}</div> : null}
      {showMedia ? (
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
      {showFiles ? (
        <div className="nexus-chat__file-chips">
          {files.map((f, i) => (
            <button
              key={`${f.fileId || f.label}-${i}`}
              type="button"
              className="nexus-chat__chip nexus-chat__chip--clickable"
              onClick={() =>
                onOpenFile?.({
                  id: f.fileId || `file-${f.label}-${i}`,
                  name: f.label,
                  mimeType: f.mimeType,
                  url: f.presignedUrl,
                  downloadUrl: f.presignedUrl,
                })
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
