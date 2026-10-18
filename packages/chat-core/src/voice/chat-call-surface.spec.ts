/**
 * Part D item 29 — the client surface for a call inside a chat.
 *
 * These specs pin the rules a reader can actually see: a partial is replaced in
 * place, a final replaces its partial, dedupe is by `utteranceId`, the banner
 * says the right thing per surface and only offers controls where they work, and
 * a chat-only ("posted from voice") message is marked and never spoken.
 */
import { describe, expect, it } from 'vitest';
import {
  EMPTY_CALL_STATE,
  applyChatVisibility,
  applyTranscriptEvent,
  buildCallBanner,
  canStartCallFromRoom,
  deliveredHint,
  isPostedFromVoice,
  isVoiceBubble,
  mergeStoredWithLive,
  postedFromVoiceMarker,
  voiceSpeakerLabel,
  type TranscriptMessage,
} from './chat-call-surface.js';

describe('call banner (Part D item 29)', () => {
  it('is hidden when there is no call', () => {
    expect(buildCallBanner(null).visible).toBe(false);
    expect(buildCallBanner(EMPTY_CALL_STATE).visible).toBe(false);
  });

  it('names the surface', () => {
    expect(buildCallBanner({ ...EMPTY_CALL_STATE, callSid: 'CA1', surface: 'browser' }).label).toBe(
      'Browser call in progress',
    );
    expect(buildCallBanner({ ...EMPTY_CALL_STATE, callSid: 'CA1', surface: 'pstn' }).label).toBe(
      'Phone call in progress',
    );
  });

  it('computes elapsed seconds from the start', () => {
    const view = buildCallBanner(
      { ...EMPTY_CALL_STATE, callSid: 'CA1', surface: 'browser', startedAtMs: 1_000 },
      { nowMs: 6_000 },
    );
    expect(view.elapsedSec).toBe(5);
  });

  it('hides controls for a passive reader of a PSTN call, shows them to the owner', () => {
    const pstn = { ...EMPTY_CALL_STATE, callSid: 'CA1', surface: 'pstn' as const };
    expect(buildCallBanner(pstn, { viewerIsOwner: false }).controlsVisible).toBe(false);
    expect(buildCallBanner(pstn, { viewerIsOwner: true }).controlsVisible).toBe(true);
    const browser = { ...EMPTY_CALL_STATE, callSid: 'CA2', surface: 'browser' as const };
    expect(buildCallBanner(browser, { viewerIsOwner: false }).controlsVisible).toBe(true);
  });
});

describe('voice bubbles and chat-only messages', () => {
  it('marks only voice messages with the mic', () => {
    expect(isVoiceBubble({ id: 'm1', modality: 'voice' })).toBe(true);
    expect(isVoiceBubble({ id: 'm1', modality: 'chat_only' })).toBe(false);
    expect(isVoiceBubble({ id: 'm1' })).toBe(false);
  });

  it('marks chat-only messages as posted from voice', () => {
    expect(isPostedFromVoice({ id: 'm1', modality: 'chat_only' })).toBe(true);
    expect(postedFromVoiceMarker({ id: 'm1', modality: 'chat_only' })).toBe('posted from voice');
    expect(postedFromVoiceMarker({ id: 'm1', modality: 'voice' })).toBeNull();
  });

  it('falls back to a caller label for an unidentified PSTN caller', () => {
    expect(voiceSpeakerLabel({ id: 'm1', modality: 'voice', role: 'user' })).toBe('Caller (phone)');
    expect(voiceSpeakerLabel({ id: 'm1', modality: 'voice', speakerLabel: 'Ada' })).toBe('Ada');
    expect(voiceSpeakerLabel({ id: 'm1', modality: 'chat_only', role: 'assistant' })).toBeNull();
  });

  it('explains where a chat-only post went', () => {
    expect(deliveredHint('stored')).toContain('Saved in this conversation');
    expect(deliveredHint('live')).toContain('Posted to the chat');
  });
});

describe('live transcript merge', () => {
  it('replaces a partial in place, never appending a second bubble', () => {
    let messages: TranscriptMessage[] = [];
    messages = applyTranscriptEvent(messages, {
      utteranceId: 'u1',
      role: 'user',
      text: 'I need',
      kind: 'partial',
    });
    expect(messages).toHaveLength(1);
    expect(messages[0].pending).toBe(true);

    messages = applyTranscriptEvent(messages, {
      utteranceId: 'u1',
      role: 'user',
      text: 'I need a refund',
      kind: 'partial',
    });
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe('I need a refund');

    messages = applyTranscriptEvent(messages, {
      utteranceId: 'u1',
      role: 'user',
      text: 'I need a refund for order 123.',
      kind: 'final',
    });
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe('I need a refund for order 123.');
    expect(messages[0].pending).toBeUndefined();
    expect(messages[0].modality).toBe('voice');
  });

  it('dedupes by utteranceId across both relay and sink events', () => {
    const messages: TranscriptMessage[] = [];
    const event = {
      utteranceId: 'u-dup',
      role: 'assistant' as const,
      text: 'Sure thing.',
      kind: 'final' as const,
    };
    const once = applyTranscriptEvent(messages, event);
    const twice = applyTranscriptEvent(once, event);
    expect(twice).toHaveLength(1);
    expect(twice[0].text).toBe('Sure thing.');
  });

  it('keeps a final with no matching partial', () => {
    const messages = applyTranscriptEvent([], {
      utteranceId: 'u-only-final',
      role: 'assistant',
      text: 'Hello.',
      kind: 'final',
    });
    expect(messages).toHaveLength(1);
  });

  it('never merges two different utterances', () => {
    let messages: TranscriptMessage[] = [];
    messages = applyTranscriptEvent(messages, { utteranceId: 'a', role: 'user', text: 'One', kind: 'final' });
    messages = applyTranscriptEvent(messages, { utteranceId: 'b', role: 'user', text: 'Two', kind: 'final' });
    expect(messages.map((m) => m.text)).toEqual(['One', 'Two']);
  });

  it('drops a live bubble once the stored message for that utterance arrives', () => {
    const live: TranscriptMessage[] = [{ id: 'voice:u1', utteranceId: 'u1', text: 'hi', modality: 'voice' }];
    const stored: TranscriptMessage[] = [{ id: 'm-1', utteranceId: 'u1', text: 'hi', modality: 'voice' }];
    const merged = mergeStoredWithLive(stored, live);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('m-1');
  });

  it('keeps a live bubble the store has not written yet', () => {
    const live: TranscriptMessage[] = [{ id: 'voice:u1', utteranceId: 'u1', text: 'hi', modality: 'voice' }];
    const merged = mergeStoredWithLive([], live);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('voice:u1');
  });
});

describe('start a call from a room, and chat visibility', () => {
  it('requires a room, membership, agent participation and contact policy', () => {
    expect(canStartCallFromRoom({})).toEqual({ ok: false, reason: 'no_room' });
    expect(canStartCallFromRoom({ roomId: 'r1' })).toEqual({ ok: false, reason: 'not_a_member' });
    expect(canStartCallFromRoom({ roomId: 'r1', viewerIsMember: true })).toEqual({
      ok: false,
      reason: 'agent_not_participant',
    });
    expect(
      canStartCallFromRoom({
        roomId: 'r1',
        viewerIsMember: true,
        agentIsParticipant: true,
        viewerMayTalkToAgent: false,
      }),
    ).toEqual({ ok: false, reason: 'contact_policy' });
    expect(
      canStartCallFromRoom({
        roomId: 'r1',
        viewerIsMember: true,
        agentIsParticipant: true,
        viewerMayTalkToAgent: true,
      }),
    ).toEqual({ ok: true });
  });

  it('reports a chatVisible change only when it actually changed', () => {
    const state = { ...EMPTY_CALL_STATE, callSid: 'CA1', chatVisible: false };
    expect(applyChatVisibility(state, false)).toBe(state);
    const next = applyChatVisibility(state, true);
    expect(next).not.toBe(state);
    expect(next.chatVisible).toBe(true);
  });
});
