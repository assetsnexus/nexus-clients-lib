# @nexus/media-generation-vue2

Vue 2.7 adapter over `@nexus/media-generation-core` for the portal.

## Exports

- `MediaGenerationDialog` — modal for image/video generation (PortraitGeneratePopup feature set)
- `VrmPreview` — orbit preview for a VRM URL (peerDeps `three` + `@pixiv/three-vrm`)
- Re-exports session helpers from `@nexus/media-generation-core`

## Styles

```js
import '@nexus/media-generation-vue2/style.css'
```

## Usage

```vue
<MediaGenerationDialog
  v-model="open"
  :adapter="adapter"
  output-type="image"
  :allow-upload="false"
  title="Generate avatar"
  @apply="onApply"
  @close="open = false"
/>
```

```vue
<VrmPreview :src="avatar3dUrl" :height="280" />
```

## Build

`npm run build` — Vite + `@vitejs/plugin-vue2`.
