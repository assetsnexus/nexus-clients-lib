# @nexus/media-generation-core

Headless media generation session (image + video). Framework-free store + adapter interface.

## Exports

- Types: `GenerationIo`, `MediaGenerationModel`, `MediaCandidate`, `MediaReference`, `WorkloadSnapshot`
- Filters: `isImageResultModel`, `isVideoResultModel`
- `createMediaGenerationSession(adapter)` — multi-turn prompt/refs/candidates + workload poll/cancel

## Usage

```ts
import {
  createMediaGenerationSession,
  isImageResultModel,
} from '@nexus/media-generation-core';

const session = createMediaGenerationSession({
  listModels: () => adapter.listModels(),
  generate: (body) => adapter.generate(body),
  getWorkload: (id) => adapter.getWorkload?.(id) ?? null,
  cancelWorkload: (id) => adapter.cancelWorkload?.(id),
});

await session.loadModels();
session.setPrompt('A lighthouse keeper…');
await session.generate();
```
