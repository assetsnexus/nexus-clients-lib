import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
  resolve: {
    alias: {
      '@nexus/chat-core': resolve(__dirname, '../chat-core/src/index.ts'),
    },
  },
});
