import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const characterReact = resolve(
  __dirname,
  '../../../anx-libs/nexus-collaboration-vr/packages/character-react/src/index.ts',
);
const characterKit = resolve(
  __dirname,
  '../../../anx-libs/nexus-collaboration-vr/packages/character-kit/src/index.ts',
);
const characterKitAssetCache = resolve(
  __dirname,
  '../../../anx-libs/nexus-collaboration-vr/packages/character-kit/src/asset-cache.ts',
);
const clusterSceneReact = resolve(
  __dirname,
  '../../../anx-libs/nexus-collaboration-vr/packages/cluster-scene-react/src/index.ts',
);
const sceneClient = resolve(__dirname, '../scene-client/src/index.ts');

/**
 * App WebView SPA build → `dist-webview/`.
 * Voice + cluster VR dynamically import character/cluster packages into separate chunks.
 */
export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'dev'),
  base: './',
  resolve: {
    alias: {
      '@nexus/chat-react': resolve(__dirname, 'src/index.ts'),
      '@nexus/chat-core': resolve(__dirname, '../chat-core/src/index.ts'),
      '@nexus/character-react': characterReact,
      '@nexus/character-kit/asset-cache': characterKitAssetCache,
      '@nexus/character-kit': characterKit,
      '@nexus/cluster-scene-react': clusterSceneReact,
      '@nexus/scene-client': sceneClient,
    },
    dedupe: ['three', 'react', 'react-dom'],
  },
  optimizeDeps: {
    esbuildOptions: { target: 'esnext' },
  },
  build: {
    target: 'esnext',
    outDir: resolve(__dirname, 'dist-webview'),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        webview: resolve(__dirname, 'dev/webview.html'),
        main: resolve(__dirname, 'dev/index.html'),
      },
      output: {
        manualChunks(id) {
          // Shared picture/arraybuffer cache — keep out of the Three/VRM chunk.
          if (id.includes('character-kit') && id.includes('asset-cache')) {
            return 'avatar-asset-cache';
          }
          if (
            id.includes('character-react') ||
            id.includes('character-kit') ||
            id.includes('node_modules/three') ||
            id.includes('@pixiv/three-vrm') ||
            id.includes('three-vrm-lip-sync')
          ) {
            return 'character-voice';
          }
          if (id.includes('cluster-scene-react') || id.includes('scene-client')) {
            return 'cluster-scene';
          }
        },
      },
    },
  },
  server: {
    port: 5179,
    host: true,
  },
});
