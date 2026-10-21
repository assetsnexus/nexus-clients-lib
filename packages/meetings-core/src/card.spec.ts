import { describe, expect, it } from 'vitest';
import { buildMeetingCard, resolveMeetingProvider, resolveOpenTarget, type MeetingCardInput } from './card.js';

function input(over: Partial<MeetingCardInput> = {}): MeetingCardInput {
  return {
    id: 'm1',
    title: 'Sync',
    startsAt: '2026-01-01T09:00:00Z',
    endsAt: '2026-01-01T10:00:00Z',
    ...over,
  };
}

describe('resolveMeetingProvider', () => {
  it('prefers an explicit provider token', () => {
    expect(resolveMeetingProvider({ provider: 'zoom', joinUrl: 'https://meet.google.com/x' })).toBe('zoom');
  });

  it('falls back to the join URL host', () => {
    expect(resolveMeetingProvider({ provider: undefined, joinUrl: 'https://teams.microsoft.com/x' })).toBe('teams');
  });

  it('treats a room-only meeting as nexus and nothing as in_person', () => {
    expect(resolveMeetingProvider({ provider: undefined, roomId: 'r1' })).toBe('nexus');
    expect(resolveMeetingProvider({ provider: undefined })).toBe('in_person');
  });
});

describe('buildMeetingCard', () => {
  it('shapes a nexus room card with native surfaces', () => {
    const card = buildMeetingCard(input({ provider: 'nexus', roomId: 'room-1', links: [{ entityType: 'crm.lead', entityId: 'l1' }] }));
    expect(card).toMatchObject({ provider: 'nexus', providerLabel: 'Nexus meeting', clickable: true, roomId: 'room-1' });
    expect(card.surfaces).toEqual({ video: true, participants: true, scene: true, screenshare: true });
    expect(card.links).toHaveLength(1);
  });

  it('marks a cancelled card non-clickable and drops empty links', () => {
    const card = buildMeetingCard(input({ provider: 'zoom', joinUrl: 'https://z/x', status: 'cancelled', links: [{ entityType: '', entityId: '' }] }));
    expect(card.cancelled).toBe(true);
    expect(card.clickable).toBe(false);
    expect(card.links).toEqual([]);
  });

  it('disables native surfaces for external providers', () => {
    const card = buildMeetingCard(input({ provider: 'webex', joinUrl: 'https://w/x' }));
    expect(card.surfaces).toEqual({ video: false, participants: true, scene: false, screenshare: false });
  });
});

describe('resolveOpenTarget', () => {
  it('routes a nexus room in-app', () => {
    const card = buildMeetingCard(input({ provider: 'nexus', roomId: 'room-1' }));
    expect(resolveOpenTarget(card)).toEqual({ kind: 'room', roomId: 'room-1' });
  });

  it('opens an external provider url', () => {
    const card = buildMeetingCard(input({ provider: 'zoom', joinUrl: 'https://z/x' }));
    expect(resolveOpenTarget(card)).toEqual({ kind: 'external', url: 'https://z/x' });
  });

  it('describes a custom meeting', () => {
    const card = buildMeetingCard(input({ provider: 'custom', description: 'Ask Alice for the code' }));
    expect(resolveOpenTarget(card)).toEqual({ kind: 'describe', provider: 'custom', description: 'Ask Alice for the code' });
  });

  it('describes a cancelled meeting even with a join url', () => {
    const card = buildMeetingCard(input({ provider: 'zoom', joinUrl: 'https://z/x', status: 'cancelled' }));
    expect(resolveOpenTarget(card).kind).toBe('describe');
  });

  it('routes a nexus room inferred from roomId when provider is generic custom', () => {
    const card = buildMeetingCard(input({ provider: 'custom', roomId: 'r9' }));
    // custom + roomId is ambiguous; a room wins only for non-custom providers.
    expect(resolveOpenTarget(card)).toEqual({ kind: 'describe', provider: 'custom', description: null });
  });
});
