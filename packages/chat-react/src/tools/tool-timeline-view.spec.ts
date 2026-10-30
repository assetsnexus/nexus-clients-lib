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

  it('promotes a waiting check-back out of the collapsed summary', () => {
    const waiting = {
      id: 'cb',
      status: 'success',
      tool: 'schedule_check_back',
      result: {
        scheduled: true,
        delaySec: 90,
        reason: 'Wait for upload',
        wakeAt: new Date(Date.now() + 90_000).toISOString(),
      },
    };
    const view = toolTimelinePresentation({
      runs: [run('a'), waiting],
      streaming: false,
      expanded: false,
    });
    expect(view.mode).toBe('summary');
    expect(view.promotedCheckBack).toBe(waiting);
  });

  it('does not promote a check-back that already woke up', () => {
    const fired = {
      id: 'cb',
      status: 'success',
      tool: 'schedule_check_back',
      result: {
        scheduled: true,
        delaySec: 90,
        reason: 'Wait for upload',
        wakeAt: new Date().toISOString(),
        wakeUp: true,
      },
    };
    const view = toolTimelinePresentation({
      runs: [run('a'), fired],
      streaming: false,
      expanded: false,
    });
    expect(view.promotedCheckBack).toBeNull();
  });

  it('never promotes while expanded or streaming — the row is already visible', () => {
    const waiting = {
      id: 'cb',
      status: 'success',
      tool: 'schedule_check_back',
      result: {
        scheduled: true,
        delaySec: 90,
        reason: 'Wait for upload',
        wakeAt: new Date(Date.now() + 90_000).toISOString(),
      },
    };
    const expandedView = toolTimelinePresentation({
      runs: [run('a'), waiting],
      streaming: false,
      expanded: true,
    });
    expect(expandedView.mode).toBe('full');
    expect(expandedView.promotedCheckBack).toBeNull();
  });
});
