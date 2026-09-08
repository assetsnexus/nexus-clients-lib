#!/usr/bin/env bash
# Write a CI-only .npmrc for GitLab Package Registry (@nexus scope).
# Usage: source scripts/gitlab-npmrc.sh
# Env:
#   CI_API_V4_URL, CI_PROJECT_ID, CI_JOB_TOKEN (GitLab predefined)
#   NEXUS_NPM_TOKEN optional override (Deploy / Project Access Token)
set -euo pipefail

if [[ -z "${CI_API_V4_URL:-}" ]]; then
  echo "gitlab-npmrc: CI_API_V4_URL is not set (run inside GitLab CI)" >&2
  return 1 2>/dev/null || exit 1
fi

if [[ -z "${CI_PROJECT_ID:-}" ]]; then
  echo "gitlab-npmrc: CI_PROJECT_ID is not set" >&2
  return 1 2>/dev/null || exit 1
fi

TOKEN="${NEXUS_NPM_TOKEN:-${CI_JOB_TOKEN:-}}"
if [[ -z "$TOKEN" ]]; then
  echo "gitlab-npmrc: set CI_JOB_TOKEN or NEXUS_NPM_TOKEN" >&2
  return 1 2>/dev/null || exit 1
fi

REGISTRY="${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/packages/npm/"
HOSTPATH="${REGISTRY#*://}"
HOSTPATH="${HOSTPATH%/}"

cat > .ci-npmrc <<EOF
@nexus:registry=${REGISTRY}
//${HOSTPATH}/:_authToken=${TOKEN}
always-auth=true
EOF

export NPM_CONFIG_USERCONFIG="${PWD}/.ci-npmrc"
echo "gitlab-npmrc: @nexus → ${REGISTRY}"
