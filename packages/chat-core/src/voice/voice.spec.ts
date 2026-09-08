import { describe, expect, it, vi } from 'vitest';
import {
  applyLocalMute,
  computeRuntimeElapsedSec,
  destroyBrowserRealtimeCallRuntime,
  getBrowserRealtimeCallRuntime,
  isBrowserRealtimeCallConnected,
  setBrowserRealtimeCallRuntime,
  waitForIceGatheringComplete,
  extractUserTranscript,
  extractAssistantTranscript,
} from './index.js';
import type { BrowserRealtimeCallRuntime } from './types.js';

function fakeRuntime(overrides: Partial<BrowserRealtimeCallRuntime> = {}): BrowserRealtimeCallRuntime {
  return {
    agentId: 'agent-1',
    callSid: 'call-1',
    conversationId: null,
    status: 'live',
    elapsedSec: 5,
    muted: false,
    paused: false,
    pc: { connectionState: 'connected', close: vi.fn() },
    dc: { readyState: 'open', close: vi.fn() },
    audioEl: null,
    localStream: { getTracks: () => [] },
    localTrack: { enabled: true },
    timerInterval: null,
    connectTimeout: null,
    liveStartedAtMs: Date.now() - 2000,
    ...overrides,
  };
}

describe('voice runtime', () => {
  it('waits for ICE complete or timeout', async () => {
    const pc = {
      iceGatheringState: 'gathering',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    await waitForIceGatheringComplete(pc, 10);
    expect(pc.addEventListener).toHaveBeenCalled();
  });

  it('mutes without stopping the track', () => {
    const rt = fakeRuntime();
    setBrowserRealtimeCallRuntime(rt);
    applyLocalMute(rt, true);
    expect(rt.muted).toBe(true);
    expect(rt.localTrack.enabled).toBe(false);
    expect(isBrowserRealtimeCallConnected('agent-1')).toBe(true);
    destroyBrowserRealtimeCallRuntime();
    expect(getBrowserRealtimeCallRuntime()).toBeNull();
  });

  it('computes elapsed from liveStartedAtMs', () => {
    const rt = fakeRuntime({ elapsedSec: 10, liveStartedAtMs: Date.now() - 1500 });
    expect(computeRuntimeElapsedSec(rt)).toBeGreaterThanOrEqual(11);
  });

  it('extracts transcripts from realtime events', () => {
    expect(
      extractUserTranscript({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'hello',
        item_id: 'u1',
      }),
    ).toEqual({ text: 'hello', dedupeKey: 'u1' });
    expect(
      extractAssistantTranscript({
        type: 'response.output_audio_transcript.done',
        transcript: 'hi',
        response_id: 'a1',
      }),
    ).toEqual({ text: 'hi', dedupeKey: 'a1' });
  });
});
