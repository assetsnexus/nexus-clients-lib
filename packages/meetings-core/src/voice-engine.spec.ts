import { describe, expect, it } from 'vitest';
import {
  endpointTlsWarning,
  normalizeBaseUrl,
  resolveVoiceEngineEndpoint,
  validateBaseUrl,
  voiceEngineFromEndpoint,
} from './voice-engine.js';

describe('normalizeBaseUrl / validateBaseUrl', () => {
  it('trims and drops trailing slashes', () => {
    expect(normalizeBaseUrl('  http://127.0.0.1:8000/  ')).toBe('http://127.0.0.1:8000');
    expect(normalizeBaseUrl('')).toBeNull();
    expect(normalizeBaseUrl(null)).toBeNull();
  });

  it('rejects bare hosts and non-http schemes', () => {
    expect(validateBaseUrl('127.0.0.1:8000')).toMatch(/valid URL/i);
    expect(validateBaseUrl('ftp://x/y')).toMatch(/http/i);
    expect(validateBaseUrl('')).toMatch(/Enter a base URL/i);
    expect(validateBaseUrl('https://tts.lan:9000')).toBeNull();
  });
});

describe('resolveVoiceEngineEndpoint', () => {
  it('applies protocol default path + base URL', () => {
    const ep = resolveVoiceEngineEndpoint({ kind: 'stt', protocol: 'openai_audio' });
    expect(ep.baseUrl).toBe('http://127.0.0.1:8000');
    expect(ep.url).toBe('http://127.0.0.1:8000/v1/audio/transcriptions');
    expect(ep.ignoreTls).toBe(false);
  });

  it('honours an explicit path and custom URL', () => {
    const ep = resolveVoiceEngineEndpoint({
      kind: 'tts',
      protocol: 'custom',
      baseUrl: 'https://tts.lan:9000',
      path: '/synth',
    });
    expect(ep.url).toBe('https://tts.lan:9000/synth');
  });

  it('only relaxes TLS for https endpoints when asked', () => {
    const https = resolveVoiceEngineEndpoint({
      kind: 'stt',
      protocol: 'openai_audio',
      baseUrl: 'https://asr.lan',
      ignoreTls: true,
    });
    expect(https.ignoreTls).toBe(true);
    const http = resolveVoiceEngineEndpoint({
      kind: 'stt',
      protocol: 'openai_audio',
      baseUrl: 'http://asr.lan',
      ignoreTls: true,
    });
    expect(http.ignoreTls).toBe(false);
  });

  it('never throws on a bad URL: url is empty and caller shows the error', () => {
    const ep = resolveVoiceEngineEndpoint({ kind: 'stt', protocol: 'custom', baseUrl: 'not a url' });
    // normalizeBaseUrl keeps the raw text; validation is the gate.
    expect(validateBaseUrl(ep.baseUrl)).not.toBeNull();
  });

  it('returns an empty url when there is no base at all', () => {
    const ep = resolveVoiceEngineEndpoint({ kind: 'stt', protocol: 'nexus' });
    expect(ep.baseUrl).toBeNull();
    expect(ep.url).toBe('');
    expect(ep.ignoreTls).toBe(false);
  });
});

describe('voiceEngineFromEndpoint', () => {
  it('builds a local VoiceEngine', () => {
    const engine = voiceEngineFromEndpoint(
      { kind: 'stt', protocol: 'whisper_rest', baseUrl: 'http://whisper.lan:9000' },
      'Whisper (LAN)',
      'whisper-lan',
    );
    expect(engine).toMatchObject({ kind: 'stt', location: 'local', id: 'whisper-lan', protocol: 'whisper_rest' });
  });
});

describe('endpointTlsWarning', () => {
  it('warns only when validation is relaxed or the URL is https', () => {
    const relaxed = resolveVoiceEngineEndpoint({
      kind: 'stt',
      protocol: 'custom',
      baseUrl: 'https://x.lan',
      path: '/s',
      ignoreTls: true,
    });
    expect(endpointTlsWarning(relaxed)).toMatch(/disabled/i);
    const https = resolveVoiceEngineEndpoint({ kind: 'stt', protocol: 'custom', baseUrl: 'https://x.lan', path: '/s' });
    expect(endpointTlsWarning(https)).toMatch(/self-signed/i);
    const http = resolveVoiceEngineEndpoint({ kind: 'stt', protocol: 'custom', baseUrl: 'http://x.lan', path: '/s' });
    expect(endpointTlsWarning(http)).toBeNull();
  });
});
