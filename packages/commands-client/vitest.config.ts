import { createRequire } from 'node:module';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);
const { version } = require('./package.json') as { version: string };

export default defineConfig({
  define: {
    __NEXUS_SDK_VERSION__: JSON.stringify(version),
  },
  test: {
    include: ['src/**/*.spec.ts'],
  },
});
