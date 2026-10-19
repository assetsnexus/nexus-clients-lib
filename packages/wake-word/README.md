# @nexus/wake-word

On-device wake-word detection for Nexus chat surfaces (plan **Part W**).

## Trust contract (non-negotiable)

A wake word is **not authentication**. It is **not** speaker verification. It
only opens a voice session.

`WAKE_WORD_TRUST` encodes the guarantees, and `wake-word.spec.ts` asserts them:

- never satisfies 2FA / SCA / biometric approval / device trust
- never triggers, approves, or confirms a command
- audio never leaves the device before a wake fires
- `WAKE_WORD_ALLOWED_ACTIONS === ['open_voice_session']`

`WakeWordController` can only call the `openVoiceSession` callback it is given.
It has no reference to a command dispatcher, and `WakeDictationOpenRequest`
always carries `authenticated: false`.

## Interface

```ts
interface WakeWordEngine {
  readonly kind: WakeWordEngineKind;
  readonly available: boolean;
  getStatus(): WakeWordEngineStatus;
  load(config: WakeWordConfig, fetchArtifact?: WakeArtifactFetcher): Promise<void>;
  start(onWake: WakeWordOnWake): Promise<void>;
  stop(): void;
  dispose(): void;
}
```

`WakeWordController` wraps an engine with the surface gates: explicit opt-in,
surface-open check, and (mobile) `requireUnlocked`. States:
`off | wake_listening | opening | active | unavailable | suspended`.

## Engines

| Engine | Status |
| --- | --- |
| `builtin` | **Stub until the artifact is supplied.** Real path is `createOnnxDetector` (openWakeWord-style single-session ONNX). |
| `custom_sample` | Working. Derives a device-local log-energy fingerprint from a private wav ref via `fetchArtifact`, then sliding-window normalised correlation. |
| `external` | Bring-your-own detector via `deps.external.create`. |

### Missing artifact (action required)

The `builtin` engine needs an openWakeWord-style ONNX model **plus** an ONNX
runtime. Neither is vendored here, so `createWakeWordEngine({}, 'builtin')`
resolves to `createStubDetector()`, which reports:

- `available === false`
- `getStatus().status === 'unavailable'`
- `getStatus().detecting === false`

and `start()` never fires. Surfaces **must** render "wake unavailable" and must
not show a listening affordance in that state. To enable real detection, the
host injects:

```ts
createWakeWordEngine({ builtin: { runtime: ortLike, modelBytes } }, 'builtin');
```

Required model shape: `float32 [1, windowSamples]` log-mel/PCM input
(`windowSamples` default `20480` = 16 kHz × 1.28 s), single `float32` output
where element 0 is the wake confidence. Runtime is injected as
`OnnxRuntimeLike` (`onnxruntime-web` on web, `onnxruntime-react-native` on app).

## Privacy

A private wake sample (`wav`) is fetched by opaque ref through
`WakeArtifactFetcher` and is only ever held in memory long enough to derive a
fingerprint. The sample and its ref are never logged and never sent to any
model or remote service. `onDeviceOnly` is forced `true` and cannot be relaxed
by callers.
