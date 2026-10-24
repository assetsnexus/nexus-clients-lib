# @nexus/voice-capture

Reusable microphone capture, VAD, dictation and audio-batch primitives for Nexus
voice surfaces. Host-agnostic: microphones, transcription engines and clocks are
injected, so the same pipeline serves the desktop app, the web chat widget and
mobile clients.

## Why

A voice surface needs one microphone stream that several features share (wake
detection, dictation, a level meter), a way to segment speech, a way to end an
utterance on trailing silence, and a way to transcribe on-device *or* in the
cloud. This package provides those primitives once, so clients do not each grow
their own `getUserMedia` + `MediaRecorder` + silence-detection stack.

## Modules

| Entry | What it does |
| --- | --- |
| `@nexus/voice-capture/mic` | `createMicStreamGraph()` — one `getUserMedia`/`AudioContext` per device, ref-counted fan-out of contiguous 16 kHz frames. |
| `@nexus/voice-capture/vad` | `createSegmenter()` (energy VAD → speech segments), `createPreRollBuffer()` (prefix audio before a trigger), `createSileroSegmenter()` (optional trained VAD, host-injected). |
| `@nexus/voice-capture/batch` | `createAudioBatchRecorder()` — concatenate VAD chunks into one audio batch; `encodeWavBlob()`. |
| `@nexus/voice-capture/dictation` | `runDictation()` — one utterance, end-of-speech on trailing silence, live partial preview. |
| `@nexus/voice-capture/capture` | `createPreviewSource()` — dual-mode utterance source (live preview + parallel audio batch); `Transcriber` contract. |

## Dual-mode capture

The desktop wake UX wants both at once:

- **Live preview** — an on-device (local GPU) engine streams a transcript into the
  composer as the user speaks; the user edits and submits it.
- **Audio batch** — the same frames are VAD-segmented and concatenated into one
  recording, so the user can send the audio itself (cloud / custom STT) when the
  local transcript is poor, or when no local engine is installed.

```ts
import { createMicStreamGraph, createPreviewSource, runDictation } from '@nexus/voice-capture';

const graph = createMicStreamGraph();
const source = createPreviewSource({ graph, preRollMs: 800 });

const session = runDictation({
  source,
  transcribe: (blob) => cloudTranscriber.transcribe({ blob }),
  transcribePcm: (pcm, sampleRate) => localGpu.transcribe({ pcm, sampleRate, phrases }),
  onPartial: (text) => setComposer(text),
});
```

## Trust

Nothing here records to disk or sends audio anywhere on its own. Audio only
reaches the microphone subscribers and the injected transcriber. A wake word is
never authentication.
