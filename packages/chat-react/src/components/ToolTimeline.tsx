import { useEffect, useState } from 'react';
import type { ChatToolRun, NexusChat } from '@nexus/chat-core';
import { toolTimelinePresentation } from '../tools/tool-timeline-view.js';
import { ToolTimelineRow } from './ToolTimelineRow.js';
import type { ViewerFileRef } from '../viewer/load-preview.js';

export function ToolTimeline({
  runs,
  streaming,
  chat,
  conversationId,
  onOpenFile,
}: {
  runs: ChatToolRun[];
  streaming?: boolean;
  chat?: NexusChat;
  conversationId?: string | null;
  onOpenFile?: (file: ViewerFileRef) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    setExpanded(false);
  }, [streaming]);

  const view = toolTimelinePresentation({
    runs,
    streaming: Boolean(streaming),
    expanded,
  });
  if (view.mode === 'empty') return null;

  return (
    <div
      className={`nexus-chat__tool-timeline${view.mode === 'compact' ? ' nexus-chat__tool-timeline--compact' : ''}${view.mode === 'summary' ? ' nexus-chat__tool-timeline--summary' : ''}`}
      data-nexus-tool-timeline={view.mode}
    >
      {view.mode === 'summary' ? (
        <button
          type="button"
          className={`nexus-chat__tool-summary${view.errorCount > 0 ? ' nexus-chat__tool-summary--errors' : ''}`}
          aria-expanded={false}
          title="Show tool calls"
          onClick={() => setExpanded(true)}
        >
          <span>{view.summary}</span>
          <span aria-hidden="true">▸</span>
        </button>
      ) : null}
      {view.mode === 'summary' && view.promotedCheckBack ? (
        // A waiting schedule_check_back must stay visible outside the collapsed
        // tools, otherwise the countdown hides behind the summary row.
        <div className="nexus-chat__tool-timeline-promoted">
          <ToolTimelineRow
            run={view.promotedCheckBack}
            chat={chat}
            conversationId={conversationId}
            onOpenFile={onOpenFile}
          />
        </div>
      ) : null}
      {view.mode !== 'summary' && expanded ? (
        <button
          type="button"
          className="nexus-chat__tool-expand"
          aria-expanded
          onClick={() => setExpanded(false)}
        >
          {streaming && runs.length > 3 ? 'Show compact' : view.summary}
        </button>
      ) : null}
      {view.mode === 'compact' && view.hiddenCount > 0 ? (
        <button type="button" className="nexus-chat__tool-expand" onClick={() => setExpanded(true)}>
          {`Show all ${runs.length} tools`}
        </button>
      ) : null}
      {view.items.map(({ run, fadeLevel }) => (
        <div
          key={run.id}
          className={`nexus-chat__tool-timeline-item${fadeLevel === 1 ? ' nexus-chat__tool-timeline-item--fade-1' : ''}${fadeLevel === 2 ? ' nexus-chat__tool-timeline-item--fade-2' : ''}`}
        >
          <ToolTimelineRow
            run={run}
            chat={chat}
            conversationId={conversationId}
            onOpenFile={onOpenFile}
          />
        </div>
      ))}
    </div>
  );
}
