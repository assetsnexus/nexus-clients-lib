import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue2';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'NexusChatVue2',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.mjs' : 'index.js'),
    },
    rollupOptions: {
      external: ['vue', '@nexus/chat-core', 'marked', 'dompurify'],
      output: {
        exports: 'named',
        globals: {
          vue: 'Vue',
          '@nexus/chat-core': 'NexusChatCore',
          marked: 'marked',
          dompurify: 'DOMPurify',
        },
      },
    },
    sourcemap: true,
    emptyOutDir: true,
    cssCodeSplit: false,
  },
});
