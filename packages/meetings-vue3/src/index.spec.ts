import { describe, expect, it } from 'vitest';
import { h } from 'vue';
import { buildMeetingCard, createEmptyRoomSession, meetingViewTabs, upsertParticipant } from '@nexus/meetings-core';
import { MeetingCard } from './MeetingCard.js';
import { MeetingView } from './MeetingView.js';

const base = {
  id: 'm1',
  title: 'Standup',
  startsAt: '2026-05-01T09:00:00.000Z',
  endsAt: '2026-05-01T09:30:00.000Z',
};

describe('@nexus/meetings-vue3 components', () => {
  it('exposes a meeting card component that projects the core model', () => {
    const card = buildMeetingCard({ ...base, provider: 'zoom', joinUrl: 'https://zoom.us/j/123' });
    const vnode = h(MeetingCard, { card });
    expect(vnode.type).toBe(MeetingCard);
    expect(card.provider).toBe('zoom');
    expect(card.clickable).toBe(true);
  });

  it('routes nexus rooms in-app via resolveOpenTarget semantics', () => {
    const card = buildMeetingCard({ ...base, provider: 'nexus', roomId: 'room-42' });
    expect(meetingViewTabs(card)).toContain('video');
    const vnode = h(MeetingView, { card, session: createEmptyRoomSession('room-42') });
    expect(vnode.type).toBe(MeetingView);
  });

  it('offers agent moderation only when the provider supports native media', () => {
    const zoom = buildMeetingCard({ ...base, provider: 'zoom', joinUrl: 'https://zoom.us/j/1' });
    const zoomTabs = meetingViewTabs(zoom);
    expect(zoomTabs).toEqual(['participants']);

    const nexus = buildMeetingCard({ ...base, provider: 'nexus', roomId: 'r' });
    const session = upsertParticipant(createEmptyRoomSession('r'), {
      id: 'a1',
      displayName: 'Tank',
      kind: 'asset_agent',
      transport: 'audio',
      muted: false,
      listening: true,
      volume: 1,
    });
    expect(session.participants).toHaveLength(1);
    expect(meetingViewTabs(nexus)).toContain('participants');
  });
});
