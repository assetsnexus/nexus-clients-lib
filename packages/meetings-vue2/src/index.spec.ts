import { describe, expect, it } from 'vitest';
import { buildMeetingCard, meetingViewTabs } from '@nexus/meetings-core';
import { MeetingCard } from './MeetingCard.js';
import { MeetingView } from './MeetingView.js';

const base = {
  id: 'm1',
  title: 'Standup',
  startsAt: '2026-05-01T09:00:00.000Z',
  endsAt: '2026-05-01T09:30:00.000Z',
};

describe('@nexus/meetings-vue2 components', () => {
  it('exports Vue 2 components/constructors', () => {
    expect(typeof MeetingCard).toBe('function');
    expect(typeof MeetingView).toBe('function');
  });

  it('gates tabs by provider capability from the shared core rule', () => {
    const zoom = buildMeetingCard({ ...base, provider: 'zoom', joinUrl: 'https://zoom.us/j/1' });
    expect(meetingViewTabs(zoom)).toEqual(['participants']);

    const nexus = buildMeetingCard({ ...base, provider: 'nexus', roomId: 'room-1' });
    expect(meetingViewTabs(nexus)).toEqual(['video', 'participants', 'screenshare', 'scene']);
  });

  it('renders a card vnode with option-style render fn', () => {
    const card = buildMeetingCard({ ...base, provider: 'teams', joinUrl: 'https://teams.microsoft.com/l/1' });
    const vnode = new MeetingCard({ propsData: { card } }).$mount();
    expect(vnode).toBeTruthy();
    expect(card.provider).toBe('teams');
  });
});
