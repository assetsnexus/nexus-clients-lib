/**
 * Local / custom voice engine descriptor (@nexus/meetings-core).
 *
 * Phase 11e: STT/TTS engines may be region cloud models, self-hosted servers on
 * the LAN, or models installed on this machine. All three are described by one
 * shape so the settings UI, the desktop local-model manager, and the meeting
 * voice resolver speak the same language.
 *
 * Nothing here does IO: it validates + normalizes an untrusted descriptor (a
 * URL typed by a user, a catalog row from the region) so a malformed entry can
 * never crash the UI or start a session against the wrong endpoint.
 */

import type { VoiceEngine, VoiceEngineKind, VoiceEngineProtocol } from './voice.js';

export const VOICE_ENGINE_PROTOCOLS: VoiceEngineProtocol[] = [
  'nexus',
  'openai_audio',
  'whisper_rest',
  'ollama',
  'custom',
];

/** Human labels for the protocol picker. */
export const VOICE_ENGINE_PROTOCOL_LABELS: Record<VoiceEngineProtocol, string> = {
  nexus: 'Nexus inference (region)',
  openai_audio: 'OpenAI-compatible audio',
  whisper_rest: 'Whisper REST',
  ollama: 'Ollama',
  custom: 'Custom',
};

/**
 * Default ports/paths per protocol, so a user only has to type a host. These
 * are the *suggested* base URLs — the user may always override.
 */
export const VOICE_ENGINE_PROTOCOL_DEFAULTS: Record<
  VoiceEngineProtocol,
  { sttPath: string; ttsPath: string; baseUrl: string }
> = {
  nexus: { sttPath: '/anx.inference.stt.create', ttsPath: '/anx.inference.tts.create', baseUrl: '' },
  openai_audio: { sttPath: '/v1/audio/transcriptions', ttsPath: '/v1/audio/speech', baseUrl: 'http://127.0.0.1:8000' },
  whisper_rest: { sttPath: '/inference', ttsPath: '', baseUrl: 'http://127.0.0.1:9000' },
  ollama: { sttPath: '/api/transcribe', ttsPath: '', baseUrl: 'http://127.0.0.1:11434' },
  custom: { sttPath: '', ttsPath: '', baseUrl: '' },
};

export type VoiceEngineEndpointInput = {
  kind: VoiceEngineKind;
  protocol: VoiceEngineProtocol;
  /** Base URL for a self-hosted/custom engine (ignored for `nexus`). */
  baseUrl?: string | null;
  /**
   * When true the engine may use a self-signed / untrusted TLS certificate.
   * The host must then relax certificate validation *only* for this endpoint.
   */
  ignoreTls?: boolean;
  /** Optional explicit path override (else {@link VOICE_ENGINE_PROTOCOL_DEFAULTS}). */
  path?: string | null;
  /** Optional bearer/API key for the self-hosted engine. */
  apiKey?: string | null;
};

export type VoiceEngineEndpoint = {
  kind: VoiceEngineKind;
  protocol: VoiceEngineProtocol;
  baseUrl: string | null;
  /** Fully-resolved request URL (`""` when the protocol has no native path). */
  url: string;
  ignoreTls: boolean;
  apiKey: string | null;
};

function isHttps(url: string): boolean {
  return /^https:\/\//i.test(url);
}

/** Normalize a base URL: trim, drop trailing slashes, keep scheme + host[:port]. */
export function normalizeBaseUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, '');
}

/**
 * Validate a base URL. Returns an error string (for inline UI copy) or null.
 * Only `http`/`https` are accepted — never a bare host, so `fetch` cannot guess.
 */
export function validateBaseUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return 'Enter a base URL.';
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return 'Not a valid URL (include http:// or https://).';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return 'Only http:// or https:// URLs are supported.';
  }
  if (!url.hostname) return 'The URL is missing a host.';
  return null;
}

/**
 * Resolve a concrete endpoint from user input, applying protocol defaults and
 * flagged TLS relaxation. Never throws; a bad URL yields `url: ''` so callers
 * can show {@link validateBaseUrl} and refuse to start.
 */
export function resolveVoiceEngineEndpoint(input: VoiceEngineEndpointInput): VoiceEngineEndpoint {
  const protocol = VOICE_ENGINE_PROTOCOLS.includes(input.protocol) ? input.protocol : 'custom';
  const defaults = VOICE_ENGINE_PROTOCOL_DEFAULTS[protocol];
  const baseUrl = normalizeBaseUrl(input.baseUrl) ?? (protocol === 'nexus' ? null : defaults.baseUrl);
  const path = (input.path ?? '').trim() || (input.kind === 'stt' ? defaults.sttPath : defaults.ttsPath);

  if (!baseUrl) {
    return {
      kind: input.kind,
      protocol,
      baseUrl: null,
      url: '',
      ignoreTls: false,
      apiKey: input.apiKey?.trim() || null,
    };
  }

  const url = `${baseUrl}${path || ''}`;
  // TLS relaxation is only meaningful — and only honored — for https endpoints.
  const ignoreTls = isHttps(url) && input.ignoreTls === true;
  return {
    kind: input.kind,
    protocol,
    baseUrl,
    url,
    ignoreTls,
    apiKey: input.apiKey?.trim() || null,
  };
}

/** Build the meeting-core `VoiceEngine` from an endpoint input. */
export function voiceEngineFromEndpoint(
  input: VoiceEngineEndpointInput,
  label: string,
  id: string,
): VoiceEngine {
  const endpoint = resolveVoiceEngineEndpoint(input);
  return {
    kind: input.kind,
    location: 'local',
    id,
    label,
    protocol: endpoint.protocol,
    baseUrl: endpoint.baseUrl,
  };
}

/**
 * Whether the endpoint needs the "ignore TLS warnings" escape hatch. A user
 * typing a self-signed LAN endpoint must be told before we relax anything.
 */
export function endpointTlsWarning(endpoint: VoiceEngineEndpoint): string | null {
  if (endpoint.ignoreTls) {
    return 'Certificate validation is disabled for this endpoint. Only do this for a server you trust on your own network.';
  }
  if (endpoint.url && isHttps(endpoint.url)) {
    return 'If this server uses a self-signed certificate, enable “Ignore TLS warnings”.';
  }
  return null;
}
