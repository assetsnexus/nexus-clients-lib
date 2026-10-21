import { describe, expect, it } from 'vitest';
import { buildMeetingCard, meetingViewTabs } from '@nexus/meetings-core';

const base = { id: 'm1', title: 'Sync', startsAt: '2026-01-01T09:00:00Z', endsAt: '2026-01-01T10:00:00Z' };

describe('meetingViewTabs', () => {
  it('shows video + screenshare + scene for a nexus room', () => {
    const card = buildMeetingCard({ ...base, provider: 'nexus', roomId: 'r1' });
    expect(meetingViewTabs(card)).toEqual(['video', 'participants', 'screenshare', 'scene']);
  });

  it('shows only participants for an external provider', () => {
    const card = buildMeetingCard({ ...base, provider: 'zoom', joinUrl: 'https://z/x' });
    expect(meetingViewTabs(card)).toEqual(['participants']);
  });

  it('shows no video for in-person but keeps participants', () => {
    const card = buildMeetingCard({ ...base, provider: 'in_person' });
    expect(meetingViewTabs(card)).toEqual(['participants']);
  });
});
