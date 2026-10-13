import { describe, expect, it } from 'vitest';
import { formatToolsSummary, toolTimelinePresentation } from './tool-timeline-view.js';

const run = (id: string, status = 'success') => ({ id, status });

describe('tool timeline presentation', () => {
  it('summarizes a finished turn until it is expanded', () => {
    const view = toolTimelinePresentation({
      runs: [run('a'), run('b', 'error'), run('c'), run('d')],
      streaming: false,
      expanded: false,
    });
    expect(view.mode).toBe('summary');
    expect(view.items).toEqual([]);
    expect(view.summary).toBe('4 tools called · 1 error');
    expect(formatToolsSummary(1, 0)).toBe('1 tool called');
  });

  it('fades the older live rows and keeps the newest at full strength', () => {
    const view = toolTimelinePresentation({
      runs: [run('a'), run('b'), run('c'), run('d'), run('e')],
      streaming: true,
      expanded: false,
    });
    expect(view.mode).toBe('compact');
    expect(view.hiddenCount).toBe(2);
    expect(view.items.map((item) => [item.run.id, item.fadeLevel])).toEqual([
      ['c', 2],
      ['d', 1],
      ['e', 0],
    ]);
  });

  it('shows every row after expand, including while the turn is still running', () => {
    const runs = [run('a'), run('b'), run('c'), run('d')];
    const live = toolTimelinePresentation({ runs, streaming: true, expanded: true });
    const done = toolTimelinePresentation({ runs, streaming: false, expanded: true });
    expect(live.mode).toBe('full');
    expect(done.mode).toBe('full');
    expect(live.items).toHaveLength(4);
    expect(live.items.every((item) => item.fadeLevel === 0)).toBe(true);
  });
});
