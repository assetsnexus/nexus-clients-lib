/**
 * `@nexus/voice-capture` — reusable microphone capture, VAD, dictation and
 * audio-batch primitives for Nexus voice surfaces.
 *
 * The package is deliberately host-agnostic: microphones, transcription engines
 * and clocks are injected, so the same capture pipeline serves the desktop app,
 * the web chat widget and mobile clients. The host keeps only its own concerns
 * (Electron window management, a local GPU runner, region transport).
 */

export * from './shared/phrase.js';
export * from './shared/rms.js';
export * from './mic/stream-graph.js';
export * from './vad/segmenter.js';
export * from './vad/pre-roll.js';
export * from './vad/silero.js';
export * from './batch/recorder.js';
export * from './dictation/session.js';
export * from './transcribe/types.js';
export * from './capture/preview-source.js';
