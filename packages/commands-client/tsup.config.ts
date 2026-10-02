import { createRequire } from 'node:module';
import { defineConfig } from 'tsup';

const require = createRequire(import.meta.url);
const { version } = require('./package.json') as { version: string };

const define = {
  __NEXUS_SDK_VERSION__: JSON.stringify(version),
};

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    define,
  },
  {
    entry: { 'testing/index': 'src/testing/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: false,
    splitting: false,
    treeshake: true,
    define,
  },
]);
