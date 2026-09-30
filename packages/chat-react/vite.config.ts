import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'NexusChatReact',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.mjs' : 'index.js'),
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        '@nexus/chat-core',
        '@nexus/character-react',
        '@nexus/character-kit',
        '@nexus/character-kit/asset-cache',
        'three',
        'marked',
        'dompurify',
      ],
      output: {
        exports: 'named',
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          '@nexus/chat-core': 'NexusChatCore',
          marked: 'marked',
          dompurify: 'DOMPurify',
        },
        assetFileNames: 'style.css',
      },
    },
    sourcemap: true,
    emptyOutDir: true,
    cssCodeSplit: false,
  },
});
