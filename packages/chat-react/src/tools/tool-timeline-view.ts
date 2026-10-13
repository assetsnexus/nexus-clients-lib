/** How many live tool rows stay on screen before older ones are only a count. */
export const TOOL_TIMELINE_COMPACT_VISIBLE = 3;

export function isToolErrorStatus(status: string | undefined): boolean {
  return status === 'error' || status === 'reverted';
}

export function formatToolsSummary(total: number, errors: number): string {
  const tools = total === 1 ? '1 tool called' : `${total} tools called`;
  if (errors <= 0) return tools;
  return `${tools} · ${errors === 1 ? '1 error' : `${errors} errors`}`;
}

export type ToolTimelineItem<T> = { run: T; fadeLevel: number };

export type ToolTimelineMode = 'empty' | 'summary' | 'compact' | 'full';

/**
 * Same rules as the portal timeline.
 * A finished turn is one summary until expanded.
 * A live turn keeps the newest three, fading the older of those, until expanded.
 */
export function toolTimelinePresentation<T extends { status?: string }>(input: {
  runs: readonly T[];
  streaming: boolean;
  expanded: boolean;
}): {
  mode: ToolTimelineMode;
  items: ToolTimelineItem<T>[];
  hiddenCount: number;
  errorCount: number;
  summary: string;
} {
  const runs = input.runs;
  const errorCount = runs.filter((run) => isToolErrorStatus(run.status)).length;
  const summary = formatToolsSummary(runs.length, errorCount);
  if (!runs.length) {
    return { mode: 'empty', items: [], hiddenCount: 0, errorCount, summary };
  }
  const liveCompact =
    input.streaming && !input.expanded && runs.length > TOOL_TIMELINE_COMPACT_VISIBLE;
  if (!input.streaming && !input.expanded) {
    return { mode: 'summary', items: [], hiddenCount: runs.length, errorCount, summary };
  }
  if (!liveCompact) {
    return {
      mode: 'full',
      items: runs.map((run) => ({ run, fadeLevel: 0 })),
      hiddenCount: 0,
      errorCount,
      summary,
    };
  }
  const slice = runs.slice(-TOOL_TIMELINE_COMPACT_VISIBLE);
  return {
    mode: 'compact',
    items: slice.map((run, index) => ({
      run,
      fadeLevel: slice.length - 1 - index,
    })),
    hiddenCount: runs.length - slice.length,
    errorCount,
    summary,
  };
}
