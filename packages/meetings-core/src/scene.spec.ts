import { describe, expect, it } from 'vitest';
import {
  meetingSceneOccupants,
  meetingSceneOccupantsFromSession,
  occupantAvatarPresent,
  primaryMeetingAgent,
  hasSceneAgents,
  type MeetingSceneOccupant,
} from './scene.js';
import { createEmptyRoomSession, upsertParticipant, type MeetingParticipant } from './room-session.js';

const user: MeetingParticipant = {
  id: 'u1',
  kind: 'user',
  displayName: 'Ada',
  transport: 'video',
  muted: false,
  listening: true,
  volume: 1,
};

const agent: MeetingParticipant = {
  id: 'a1',
  kind: 'agent',
  displayName: 'Aria',
  transport: 'audio',
  muted: false,
  listening: true,
  volume: 1,
};

describe('meetingSceneOccupants', () => {
  it('maps each participant to a slot with agent annotations', () => {
    const occ = meetingSceneOccupants([user, agent]);
    expect(occ).toHaveLength(2);
    expect(occ[0]).toMatchObject({ id: 'u1', slotIndex: 0, label: 'Ada', agent: false, mood: 'neutral' });
    expect(occ[1]).toMatchObject({ id: 'a1', slotIndex: 1, agent: true });
  });

  it('keeps a present:false slot when no VRM is verified', () => {
    const occ = meetingSceneOccupants([agent], {
      a1: { vrmUrl: 'https://cdn/x.vrm', vrmValidationStatus: 'pending_admin' },
    });
    expect(occ[0].present).toBe(false);
    expect(occ[0].vrmUrl).toBe('https://cdn/x.vrm');
  });

  it('loads a verified VRM and honours the owner preview opt-in', () => {
    const presence = { a1: { vrmUrl: 'https://cdn/x.vrm', vrmValidationStatus: 'verified' as const } };
    expect(meetingSceneOccupants([agent], presence)[0].present).toBe(true);
    const pending = { a1: { vrmUrl: 'https://cdn/x.vrm', vrmValidationStatus: 'pending_admin' as const } };
    expect(meetingSceneOccupants([agent], pending, { previewUnverified: true })[0].present).toBe(true);
  });

  it('uses the presence default mood over neutral', () => {
    const occ = meetingSceneOccupants([agent], { a1: { defaultMood: 'calm' } });
    expect(occ[0].mood).toBe('calm');
  });

  it('marks the speaking participant', () => {
    const occ = meetingSceneOccupants([{ ...agent, speaking: true }]);
    expect(occ[0].speaking).toBe(true);
  });
});

describe('occupantAvatarPresent', () => {
  it('is false without a url', () => {
    expect(occupantAvatarPresent({ vrmUrl: null })).toBe(false);
    expect(occupantAvatarPresent(null)).toBe(false);
  });
  it('is false for a rejected avatar even with a url', () => {
    expect(occupantAvatarPresent({ vrmUrl: 'u', vrmValidationStatus: 'rejected' })).toBe(false);
  });
});

describe('session helpers', () => {
  it('projects from a session and finds the primary agent', () => {
    let s = createEmptyRoomSession('r');
    s = upsertParticipant(s, user);
    s = upsertParticipant(s, agent);
    const occ: MeetingSceneOccupant[] = meetingSceneOccupantsFromSession(s);
    expect(occ).toHaveLength(2);
    expect(primaryMeetingAgent(s)?.id).toBe('a1');
    expect(hasSceneAgents(s)).toBe(true);
  });

  it('returns null for an agent-less room', () => {
    const s = upsertParticipant(createEmptyRoomSession('r'), user);
    expect(primaryMeetingAgent(s)).toBeNull();
    expect(hasSceneAgents(s)).toBe(false);
  });
});
