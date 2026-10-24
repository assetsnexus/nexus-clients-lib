import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
    // Component tests need a DOM; keep the pure-logic specs on `node`.
    environmentMatchGlobs: [['src/**/*.spec.tsx', 'jsdom']],
  },
  resolve: {
    alias: {
      '@nexus/chat-core': resolve(__dirname, '../chat-core/src/index.ts'),
    },
  },
});
