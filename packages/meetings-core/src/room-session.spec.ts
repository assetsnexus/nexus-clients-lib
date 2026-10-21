import { describe, expect, it } from 'vitest';
import {
  agentParticipantCount,
  applyModeration,
  canDisableListening,
  createEmptyRoomSession,
  removeParticipant,
  upsertParticipant,
  type MeetingParticipant,
} from './room-session.js';

const human: MeetingParticipant = {
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

describe('room session', () => {
  it('starts empty with nothing published', () => {
    const s = createEmptyRoomSession('room-1', 'conv-1');
    expect(s.participants).toEqual([]);
    expect(s.local).toEqual({ audio: false, video: false, screensharing: false });
    expect(s.sceneId).toBeNull();
  });

  it('upserts and replaces participants by id', () => {
    let s = createEmptyRoomSession('r');
    s = upsertParticipant(s, human);
    s = upsertParticipant(s, agent);
    s = upsertParticipant(s, { ...agent, muted: true, speaking: true });
    expect(s.participants).toHaveLength(2);
    const a = s.participants.find((p) => p.id === 'a1')!;
    expect(a.muted).toBe(true);
    expect(a.speaking).toBe(true);
  });

  it('removeParticipant drops only the target', () => {
    let s = upsertParticipant(upsertParticipant(createEmptyRoomSession('r'), human), agent);
    s = removeParticipant(s, 'u1');
    expect(s.participants.map((p) => p.id)).toEqual(['a1']);
  });
});

describe('canDisableListening', () => {
  it('is true only for agent kinds', () => {
    expect(canDisableListening(agent)).toBe(true);
    expect(canDisableListening({ ...agent, kind: 'asset_agent' })).toBe(true);
    expect(canDisableListening(human)).toBe(false);
  });
});

describe('applyModeration', () => {
  it('mutes and unmutes', () => {
    let s = upsertParticipant(createEmptyRoomSession('r'), agent);
    s = applyModeration(s, { action: 'mute', participantId: 'a1', muted: true });
    expect(s.participants[0].muted).toBe(true);
    s = applyModeration(s, { action: 'mute', participantId: 'a1', muted: false });
    expect(s.participants[0].muted).toBe(false);
  });

  it('disables listening for agents but not humans', () => {
    let s = upsertParticipant(upsertParticipant(createEmptyRoomSession('r'), agent), human);
    s = applyModeration(s, { action: 'disable-listening', participantId: 'a1', disabled: true });
    expect(s.participants.find((p) => p.id === 'a1')!.listening).toBe(false);
    const before = s;
    s = applyModeration(s, { action: 'disable-listening', participantId: 'u1', disabled: true });
    expect(s).toBe(before);
    expect(s.participants.find((p) => p.id === 'u1')!.listening).toBe(true);
  });

  it('re-enables listening when disabled: false', () => {
    let s = upsertParticipant(createEmptyRoomSession('r'), { ...agent, listening: false });
    s = applyModeration(s, { action: 'disable-listening', participantId: 'a1', disabled: false });
    expect(s.participants[0].listening).toBe(true);
  });

  it('clamps per-participant volume to 0..1', () => {
    let s = upsertParticipant(createEmptyRoomSession('r'), agent);
    s = applyModeration(s, { action: 'set-volume', participantId: 'a1', volume: 2 });
    expect(s.participants[0].volume).toBe(1);
    s = applyModeration(s, { action: 'set-volume', participantId: 'a1', volume: -5 });
    expect(s.participants[0].volume).toBe(0);
    s = applyModeration(s, { action: 'set-volume', participantId: 'a1', volume: 0.4 });
    expect(s.participants[0].volume).toBe(0.4);
  });

  it('removes a participant', () => {
    let s = upsertParticipant(createEmptyRoomSession('r'), agent);
    s = applyModeration(s, { action: 'remove', participantId: 'a1' });
    expect(s.participants).toEqual([]);
  });

  it('is a no-op for an unknown participant', () => {
    const s = upsertParticipant(createEmptyRoomSession('r'), agent);
    expect(applyModeration(s, { action: 'mute', participantId: 'nope', muted: true })).toBe(s);
  });
});

describe('agentParticipantCount', () => {
  it('counts only agent legs', () => {
    const s = upsertParticipant(
      upsertParticipant(upsertParticipant(createEmptyRoomSession('r'), human), agent),
      { ...agent, id: 'a2', kind: 'asset_agent' },
    );
    expect(agentParticipantCount(s)).toBe(2);
  });
});
