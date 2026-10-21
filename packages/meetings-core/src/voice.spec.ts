import { describe, expect, it } from 'vitest';
import {
  EMPTY_VOICE_CAPABILITIES,
  availableVoiceModes,
  preferredVoiceMode,
  resolvePipelineEngines,
  shouldFallbackToPipeline,
  voiceModeUnavailableReason,
  type MeetingVoiceCapabilities,
  type VoiceEngine,
} from './voice.js';

const caps = (over: Partial<MeetingVoiceCapabilities>): MeetingVoiceCapabilities => ({
  ...EMPTY_VOICE_CAPABILITIES,
  ...over,
});

const engine = (kind: VoiceEngine['kind'], location: VoiceEngine['location'], id: string): VoiceEngine => ({
  kind,
  location,
  id,
  label: id,
  protocol: 'nexus',
  baseUrl: null,
});

describe('availableVoiceModes / preferredVoiceMode', () => {
  it('offers realtime only when a realtime model exists', () => {
    expect(availableVoiceModes(caps({ realtimeAvailable: true }))).toEqual(['realtime']);
    expect(preferredVoiceMode(caps({ realtimeAvailable: true }))).toBe('realtime');
  });

  it('offers pipeline only when both STT and TTS exist', () => {
    expect(availableVoiceModes(caps({ cloudSttAvailable: true }))).toEqual([]);
    expect(availableVoiceModes(caps({ cloudSttAvailable: true, cloudTtsAvailable: true }))).toEqual(['pipeline']);
  });

  it('accepts local engines for the pipeline', () => {
    const c = caps({ localSttAvailable: true, localTtsAvailable: true });
    expect(availableVoiceModes(c)).toEqual(['pipeline']);
  });

  it('prefers realtime over pipeline when both exist', () => {
    const c = caps({ realtimeAvailable: true, cloudSttAvailable: true, cloudTtsAvailable: true });
    expect(availableVoiceModes(c)).toEqual(['realtime', 'pipeline']);
    expect(preferredVoiceMode(c)).toBe('realtime');
  });

  it('returns null when nothing is available', () => {
    expect(preferredVoiceMode(EMPTY_VOICE_CAPABILITIES)).toBeNull();
  });
});

describe('voiceModeUnavailableReason', () => {
  it('explains missing engines honestly', () => {
    expect(voiceModeUnavailableReason(caps({}), 'realtime')).toMatch(/realtime/i);
    expect(voiceModeUnavailableReason(caps({ cloudTtsAvailable: true }), 'pipeline')).toMatch(/speech-to-text/i);
    expect(voiceModeUnavailableReason(caps({ cloudSttAvailable: true }), 'pipeline')).toMatch(/text-to-speech/i);
    expect(
      voiceModeUnavailableReason(caps({ cloudSttAvailable: true, cloudTtsAvailable: true }), 'pipeline'),
    ).toBeNull();
  });
});

describe('resolvePipelineEngines', () => {
  const cloudStt = engine('stt', 'cloud', 'qwen-asr');
  const cloudTts = engine('tts', 'cloud', 'chatterbox');
  const localStt = engine('stt', 'local', 'whisper-base');
  const localTts = engine('tts', 'local', 'piper');

  it('prefers cloud by default', () => {
    const out = resolvePipelineEngines({ cloudStt, cloudTts, localStt, localTts });
    expect(out.stt?.id).toBe('qwen-asr');
    expect(out.tts?.id).toBe('chatterbox');
    expect(out.usedLocal).toBe(false);
  });

  it('prefers local when asked and available', () => {
    const out = resolvePipelineEngines({ cloudStt, cloudTts, localStt, localTts }, { preferLocal: true });
    expect(out.stt?.id).toBe('whisper-base');
    expect(out.tts?.id).toBe('piper');
    expect(out.usedLocal).toBe(true);
  });

  it('falls back to whichever side exists', () => {
    const out = resolvePipelineEngines({ cloudStt }, { preferLocal: true });
    expect(out.stt?.id).toBe('qwen-asr');
    expect(out.tts).toBeNull();
    expect(out.usedLocal).toBe(false);
  });
});

describe('shouldFallbackToPipeline', () => {
  it('only falls back on failure and when the pipeline is usable', () => {
    const usable = caps({ cloudSttAvailable: true, cloudTtsAvailable: true });
    expect(shouldFallbackToPipeline(usable, false)).toBe(false);
    expect(shouldFallbackToPipeline(usable, true)).toBe(true);
    expect(shouldFallbackToPipeline(caps({}), true)).toBe(false);
  });
});
