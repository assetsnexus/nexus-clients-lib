/**
 * Serialises `prepare` for packages installed from one git tarball.
 *
 * pnpm builds every `github:...&path:` dependency of that tarball in parallel.
 * `@nexus/privacy` typechecks against `@nexus/webhooks`, whose `tsup --clean`
 * deletes `dist/` while privacy is still reading it. One lock per checkout
 * makes the builds run one at a time, and a finished `dist/index.d.ts` is not
 * rebuilt.
 *
 * The lock is a directory created with `mkdirSync`, which is atomic on Linux,
 * macOS and Windows. No `flock` binary is required, so a plain `pnpm install`
 * works on a developer laptop without extra system packages.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = join(dirname(scriptPath), '..');
const lockDir = join(repoRoot, '.sdk-prepare.lock');
const pkgDir = process.cwd();
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
if (typeof pkg.name !== 'string' || !pkg.name.startsWith('@nexus/')) {
  console.error('git-prepare: run this from an @nexus package directory');
  process.exit(1);
}

const STALE_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 15 * 60 * 1000;

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquireLock() {
  const start = Date.now();
  for (;;) {
    try {
      mkdirSync(lockDir);
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        if (Date.now() - statSync(lockDir).mtimeMs > STALE_MS) {
          rmdirSync(lockDir);
          continue;
        }
      } catch {
        // The holder released it between the mkdir and the stat.
        continue;
      }
      if (Date.now() - start > TIMEOUT_MS) {
        throw new Error(`git-prepare: timed out waiting for ${lockDir}`);
      }
      sleep(200);
    }
  }
}

function releaseLock() {
  try {
    rmdirSync(lockDir);
  } catch {
    // Already released.
  }
}

function declarationsReady(dir) {
  return existsSync(join(dir, 'dist', 'index.d.ts'));
}

function build(dir) {
  const result = spawnSync('npm', ['run', 'build'], { cwd: dir, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`git-prepare: build failed in ${dir}`);
  }
}

function siblingPackages() {
  const specs = Object.values({ ...pkg.dependencies, ...pkg.devDependencies });
  const dirs = [];
  for (const spec of specs) {
    if (typeof spec !== 'string' || !spec.startsWith('file:')) continue;
    const dir = join(pkgDir, spec.slice('file:'.length));
    if (existsSync(join(dir, 'package.json'))) dirs.push(dir);
  }
  return dirs;
}

acquireLock();
try {
  for (const dir of siblingPackages()) {
    if (!declarationsReady(dir)) build(dir);
  }
  if (!declarationsReady(pkgDir)) build(pkgDir);
} finally {
  releaseLock();
}
