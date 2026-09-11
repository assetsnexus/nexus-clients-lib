import { describe, expect, it } from 'vitest';
import { computeActivityBar, fabBadgeCount } from '../chat-chrome.js';

describe('activity bar subagent badges', () => {
  it('counts active subagents and background completions', () => {
    const activity = computeActivityBar([
      { unreadCount: 1, streaming: true, activeSubAgentCount: 2 },
      { unreadCount: 0, backgroundSubAgentCompleted: true, activeSubAgentCount: 1 },
    ]);
    expect(activity.unreadTotal).toBe(1);
    expect(activity.activeStreams).toBe(1);
    expect(activity.activeSubAgents).toBe(3);
    expect(activity.backgroundSubAgentCompleted).toBe(1);
    expect(fabBadgeCount(activity)).toBe(2); // unread + background completed
  });
});
