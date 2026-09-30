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

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'dev'),
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
  server: {
    port: 5179,
    host: true,
    open: '/webview.html',
  },
  build: {
    target: 'esnext',
    outDir: resolve(__dirname, 'dist-webview'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'dev/index.html'),
        webview: resolve(__dirname, 'dev/webview.html'),
      },
    },
  },
});
