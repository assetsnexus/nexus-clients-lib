import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue2';

export default defineConfig({
  plugins: [vue()],
  test: {
    // Pure-logic specs run on `node`; component specs opt into jsdom with a
    // `// @vitest-environment jsdom` docblock so the default stays fast.
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
