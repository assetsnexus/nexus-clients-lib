import { describe, expect, it } from 'vitest';
import { ElevationPromptTracker } from './elevation-prompt-tracker.js';

describe('ElevationPromptTracker', () => {
  it('raises each elevation id once per conversation', () => {
    const t = new ElevationPromptTracker();
    expect(t.shouldRaise('c1', 'e1')).toBe(true);
    expect(t.shouldRaise('c1', 'e1')).toBe(false);
    // A different id is a genuinely new request.
    expect(t.shouldRaise('c1', 'e2')).toBe(true);
    // Ids are scoped per conversation.
    expect(t.shouldRaise('c2', 'e1')).toBe(true);
  });

  it('never dedupes frames without an id', () => {
    const t = new ElevationPromptTracker();
    expect(t.shouldRaise('c1', null)).toBe(true);
    expect(t.shouldRaise('c1', null)).toBe(true);
    expect(t.shouldRaise('c1', undefined)).toBe(true);
    expect(t.shouldRaise('c1', '  ')).toBe(true);
    expect(t.shouldRaise(null, 'e1')).toBe(true);
    expect(t.shouldRaise(null, 'e1')).toBe(true);
  });

  it('forgets marks after the ttl so a reused id can surface again', () => {
    let now = 1_000;
    const t = new ElevationPromptTracker(500, () => now);
    expect(t.shouldRaise('c1', 'e1')).toBe(true);
    expect(t.shouldRaise('c1', 'e1')).toBe(false);
    now += 501;
    expect(t.shouldRaise('c1', 'e1')).toBe(true);
  });

  it('exposes hasRaised / markRaised and can forget a conversation', () => {
    const t = new ElevationPromptTracker();
    expect(t.hasRaised('c1', 'e1')).toBe(false);
    t.markRaised('c1', 'e1');
    expect(t.hasRaised('c1', 'e1')).toBe(true);
    t.forget('c1');
    expect(t.hasRaised('c1', 'e1')).toBe(false);
  });
});
