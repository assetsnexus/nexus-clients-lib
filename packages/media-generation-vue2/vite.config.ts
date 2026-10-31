import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue2';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'NexusMediaGenerationVue2',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.mjs' : 'index.js'),
    },
    rollupOptions: {
      external: ['vue', '@nexus/media-generation-core', '@nexus/chat-core', 'three', '@pixiv/three-vrm'],
      output: {
        exports: 'named',
        globals: {
          vue: 'Vue',
          '@nexus/media-generation-core': 'NexusMediaGenerationCore',
          '@nexus/chat-core': 'NexusChatCore',
          three: 'THREE',
          '@pixiv/three-vrm': 'THREE_VRM',
        },
      },
    },
    sourcemap: true,
    emptyOutDir: true,
    cssCodeSplit: false,
  },
});
