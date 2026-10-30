import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [vue()],
  test: {
    // Pure-logic specs run on `node`; component specs opt into jsdom with a
    // `// @vitest-environment jsdom` docblock so the default stays fast.
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
  resolve: {
    alias: {
      '@nexus/chat-core': resolve(__dirname, '../chat-core/src/index.ts'),
    },
  },
});
