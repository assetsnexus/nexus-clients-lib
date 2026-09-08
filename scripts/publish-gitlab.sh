#!/usr/bin/env bash
# Publish each workspace package to this GitLab project's npm registry.
# Skips a package when that exact name@version already exists.
# Dependency order: commands-client, webhooks, chat-core, chat-vue2, chat-vue3.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "${ROOT}/scripts/gitlab-npmrc.sh"

PACKAGES=(
  packages/commands-client
  packages/webhooks
  packages/chat-core
  packages/chat-vue2
  packages/chat-vue3
)

published=0
skipped=0

for dir in "${PACKAGES[@]}"; do
  pkg_json="${dir}/package.json"
  if [[ ! -f "$pkg_json" ]]; then
    echo "publish: missing ${pkg_json}" >&2
    exit 1
  fi
  if node -e "process.exit(require('./${pkg_json}').private === true ? 0 : 1)"; then
    echo "publish: skip ${dir} (private)"
    continue
  fi
  if [[ ! -d "${dir}/dist" ]]; then
    echo "publish: ${dir}/dist missing — run npm run build first" >&2
    exit 1
  fi

  name="$(node -p "require('./${pkg_json}').name")"
  version="$(node -p "require('./${pkg_json}').version")"
  echo "publish: ${name}@${version}"

  if npm view "${name}@${version}" version >/dev/null 2>&1; then
    echo "publish: already in registry, skip ${name}@${version}"
    skipped=$((skipped + 1))
    continue
  fi

  (
    cd "$dir"
    npm publish
  )
  published=$((published + 1))
done

echo "publish: done (published=${published} skipped=${skipped})"
