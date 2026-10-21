import { describe, expect, it, vi } from 'vitest';
import { EMPTY_VOICE_CAPABILITIES, type MeetingVoiceCapabilities, type VoiceEngine } from './voice.js';
import { createMeetingVoiceSession } from './voice-session.js';

const localStt: VoiceEngine = {
  kind: 'stt',
  location: 'local',
  id: 'whisper.cpp',
  label: 'Whisper (local)',
  protocol: 'whisper_rest',
  baseUrl: 'http://127.0.0.1:8085',
};
const cloudStt: VoiceEngine = {
  kind: 'stt',
  location: 'cloud',
  id: 'stt-1',
  label: 'Cloud STT',
  protocol: 'nexus',
  baseUrl: null,
};
const cloudTts: VoiceEngine = {
  kind: 'tts',
  location: 'cloud',
  id: 'tts-1',
  label: 'Cloud TTS',
  protocol: 'nexus',
  baseUrl: null,
};

const caps = (patch: Partial<MeetingVoiceCapabilities>): MeetingVoiceCapabilities => ({
  ...EMPTY_VOICE_CAPABILITIES,
  ...patch,
});

describe('createMeetingVoiceSession', () => {
  it('starts in realtime mode when a realtime model is available', async () => {
    const startRealtime = vi.fn().mockResolvedValue({ stop: vi.fn() });
    const session = createMeetingVoiceSession({
      capabilities: caps({ realtimeAvailable: true }),
      startRealtime,
      startPipeline: vi.fn(),
    });
    const surface = await session.start({ agentId: 'a1' });
    expect(surface.mode).toBe('realtime');
    expect(surface.status).toBe('live');
    expect(surface.active).toBe(true);
    expect(startRealtime).toHaveBeenCalledOnce();
  });

  it('falls back to the pipeline when realtime fails', async () => {
    const startRealtime = vi.fn().mockRejectedValue(new Error('webrtc blocked'));
    const startPipeline = vi.fn().mockResolvedValue({ stop: vi.fn() });
    const session = createMeetingVoiceSession({
      capabilities: caps({
        realtimeAvailable: true,
        cloudSttAvailable: true,
        cloudTtsAvailable: true,
      }),
      cloudStt,
      cloudTts,
      startRealtime,
      startPipeline,
    });
    const surface = await session.start({ agentId: 'a1' });
    expect(surface.mode).toBe('pipeline');
    expect(surface.status).toBe('live');
    expect(surface.fellBack).toBe(true);
    expect(startPipeline).toHaveBeenCalledOnce();
    expect(startPipeline.mock.calls[0][0].stt).toBe(cloudStt);
  });

  it('prefers the local engine when preferLocal is set', async () => {
    const startPipeline = vi.fn().mockResolvedValue({ stop: vi.fn() });
    const session = createMeetingVoiceSession({
      capabilities: caps({
        cloudSttAvailable: true,
        cloudTtsAvailable: true,
        localSttAvailable: true,
      }),
      cloudStt,
      cloudTts,
      localStt,
      startRealtime: vi.fn(),
      startPipeline,
    });
    const surface = await session.start({ agentId: 'a1', preferLocal: true });
    expect(surface.usedLocal).toBe(true);
    expect(startPipeline.mock.calls[0][0].stt).toBe(localStt);
  });

  it('errors honestly when no mode is available', async () => {
    const session = createMeetingVoiceSession({
      capabilities: caps({}),
      startRealtime: vi.fn(),
      startPipeline: vi.fn(),
    });
    const surface = await session.start({ agentId: 'a1' });
    expect(surface.status).toBe('error');
    expect(surface.active).toBe(false);
    expect(surface.errorMessage).toMatch(/unavailable/i);
  });

  it('tracks mute and pause, and stops handles', async () => {
    const stop = vi.fn();
    const setMuted = vi.fn();
    const setPaused = vi.fn();
    const session = createMeetingVoiceSession({
      capabilities: caps({ realtimeAvailable: true }),
      startRealtime: vi.fn().mockResolvedValue({ stop, setMuted, setPaused }),
      startPipeline: vi.fn(),
    });
    await session.start({ agentId: 'a1' });
    expect(session.toggleMute()).toBe(true);
    expect(setMuted).toHaveBeenCalledWith(true);
    session.pause();
    expect(session.getSurface().paused).toBe(true);
    expect(setPaused).toHaveBeenCalledWith(true);
    session.resume();
    expect(session.getSurface().status).toBe('live');
    await session.stop();
    expect(stop).toHaveBeenCalledOnce();
    expect(session.getSurface().status).toBe('idle');
  });

  it('notifies subscribers on state changes', async () => {
    const seen: string[] = [];
    const session = createMeetingVoiceSession({
      capabilities: caps({ realtimeAvailable: true }),
      startRealtime: vi.fn().mockResolvedValue({ stop: vi.fn() }),
      startPipeline: vi.fn(),
    });
    session.subscribe((s) => seen.push(s.status));
    await session.start({ agentId: 'a1' });
    expect(seen).toContain('connecting');
    expect(seen).toContain('live');
  });

  it('honours an explicit mode override', async () => {
    const startPipeline = vi.fn().mockResolvedValue({ stop: vi.fn() });
    const session = createMeetingVoiceSession({
      capabilities: caps({
        realtimeAvailable: true,
        cloudSttAvailable: true,
        cloudTtsAvailable: true,
      }),
      cloudStt,
      cloudTts,
      startRealtime: vi.fn(),
      startPipeline,
    });
    const surface = await session.start({ agentId: 'a1', mode: 'pipeline' });
    expect(surface.mode).toBe('pipeline');
    expect(startPipeline).toHaveBeenCalledOnce();
  });
});
