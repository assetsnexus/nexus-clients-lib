import { describe, expect, it } from 'vitest';
import { SubAgentSeqTracker } from './sub-agent-seq-tracker.js';

describe('SubAgentSeqTracker', () => {
  it('skips side-effect frames at or below the applied high-water mark', () => {
    const t = new SubAgentSeqTracker();
    t.record('c1', { type: 'sub_agent_token', seq: 5 } as never);
    expect(t.alreadyApplied('c1', { type: 'sub_agent_token', seq: 5 } as never)).toBe(true);
    expect(t.alreadyApplied('c1', { type: 'permission_elevation_request', seq: 3 } as never)).toBe(true);
    expect(t.alreadyApplied('c1', { type: 'sub_agent_token', seq: 6 } as never)).toBe(false);
    expect(t.alreadyApplied('c2', { type: 'sub_agent_token', seq: 1 } as never)).toBe(false);
  });

  it('never skips untracked types or frames without seq', () => {
    const t = new SubAgentSeqTracker();
    t.record('c1', { type: 'sub_agent_progress', seq: 10 } as never);
    expect(t.alreadyApplied('c1', { type: 'token', seq: 2 } as never)).toBe(false);
    expect(t.alreadyApplied('c1', { type: 'turn_snapshot', seq: 2 } as never)).toBe(false);
    expect(t.alreadyApplied('c1', { type: 'sub_agent_token' })).toBe(false);
  });

  it('forgets marks after the TTL so a restarted server counter is not skipped', () => {
    let now = 1_000;
    const t = new SubAgentSeqTracker(60_000, () => now);
    t.record('c1', { type: 'sub_agent_token', seq: 500 } as never);
    now += 60_001;
    expect(t.alreadyApplied('c1', { type: 'sub_agent_token', seq: 1 } as never)).toBe(false);
  });

  it('reset clears one conversation', () => {
    const t = new SubAgentSeqTracker();
    t.record('c1', { type: 'sub_agent_token', seq: 5 } as never);
    t.reset('c1');
    expect(t.alreadyApplied('c1', { type: 'sub_agent_token', seq: 1 } as never)).toBe(false);
  });
});
