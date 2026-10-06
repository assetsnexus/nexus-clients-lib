/**
 * Serialises `prepare` for packages installed from one git tarball.
 *
 * pnpm builds every `github:...&path:` dependency of that tarball in parallel.
 * `@nexus/privacy` typechecks against `@nexus/webhooks`, whose `tsup --clean`
 * deletes `dist/` while privacy is still reading it. One lock per checkout
 * makes the builds run one at a time, and a finished `dist/index.d.ts` is not
 * rebuilt.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = join(dirname(scriptPath), '..');
const lockPath = join(repoRoot, '.sdk-prepare.lock');
const pkgDir = process.cwd();
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
if (typeof pkg.name !== 'string' || !pkg.name.startsWith('@nexus/')) {
  console.error('git-prepare: run this from an @nexus package directory');
  process.exit(1);
}

if (process.env.SDK_PREPARE_LOCKED !== '1') {
  const locked = spawnSync(
    'flock',
    ['-x', lockPath, '-c', `"${process.execPath}" "${scriptPath}"`],
    {
      cwd: pkgDir,
      stdio: 'inherit',
      env: { ...process.env, SDK_PREPARE_LOCKED: '1' },
    },
  );
  if (locked.error && locked.error.code === 'ENOENT') {
    console.error('git-prepare: flock is required to build these packages from git');
    process.exit(1);
  }
  process.exit(locked.status ?? 1);
}

function declarationsReady(dir) {
  return existsSync(join(dir, 'dist', 'index.d.ts'));
}

function build(dir) {
  const result = spawnSync('npm', ['run', 'build'], { cwd: dir, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
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

for (const dir of siblingPackages()) {
  if (!declarationsReady(dir)) build(dir);
}
if (!declarationsReady(pkgDir)) build(pkgDir);
