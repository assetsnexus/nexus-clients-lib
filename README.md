# Nexus partner SDK (`@nexus/*`)

Publishable TypeScript packages for integrating with Nexus (Login with Nexus, commands API, chat, webhooks).

## Packages

| Package | Purpose |
|---|---|
| [`@nexus/commands-client`](packages/commands-client) | Command envelope, SCA/2FA, OAuth helpers, region discovery |
| [`@nexus/webhooks`](packages/webhooks) | HMAC verification + typed privacy/subscription event handlers |
| [`@nexus/chat-core`](packages/chat-core) | Headless chat (framework-free) |
| [`@nexus/chat-vue2`](packages/chat-vue2) | Vue 2.7 UI adapter (portal) |
| [`@nexus/chat-vue3`](packages/chat-vue3) | Vue 3 reference UI (docs / partners) |

## Hard rules

- No imports from `anx-portal-management_2` or `anx-region-node_2` source trees.
- Dual ESM + CJS via `exports` maps; `sideEffects: false`.
- Semver starts at `0.1.0`.

## Develop

```bash
npm install
npm run build
npm test
```

See `examples/` for runnable minimal integrations.

## GitLab: one repo, not one repo per package

Keep this **npm workspaces monorepo**. Each `packages/*` directory is an npm package (`@nexus/...`), not a git repository.

Push this tree to a **single** GitLab project (recommended path: `nexus/anx-npm-modules` so the `@nexus` scope matches the GitLab group). CI publishes tarballs to that project's **Package Registry**.

| Package | npm name |
|---|---|
| `packages/commands-client` | `@nexus/commands-client` |
| `packages/webhooks` | `@nexus/webhooks` |
| `packages/chat-core` | `@nexus/chat-core` |
| `packages/chat-vue2` | `@nexus/chat-vue2` |
| `packages/chat-vue3` | `@nexus/chat-vue3` |

Do not rename to `@anx/*` — portal, peers, and examples already import `@nexus/*`.

### Publish

On the default branch and on tags, `.gitlab-ci.yml` runs `npm run build` then `scripts/publish-gitlab.sh`. A version that already exists in the registry is skipped; bump `version` in the package's `package.json` to release.

`publishConfig.access` is `public` because npm 7+ requires that for scoped packages. GitLab still treats the tarball as project-private (enable **Settings → General → Visibility → Package registry**).

### Consume from another GitLab project (portal, app, …)

CI/CD variables on the **consumer**:

- `NEXUS_NPM_PROJECT_ID` — numeric project id of this repo (Package Registry), **or**
- `NEXUS_NPM_MODULES_PROJECT` — git path (`nexus/anx-npm-modules`) if you want a clone fallback before the first publish

Allow the consumer's job token to read this project: **Settings → CI/CD → Job token permissions** (inbound from portal).

`.npmrc` used in CI (do not commit tokens):

```
@nexus:registry=${CI_API_V4_URL}/projects/<NEXUS_NPM_PROJECT_ID>/packages/npm/
//<gitlab-host>/api/v4/projects/<id>/packages/npm/:_authToken=${CI_JOB_TOKEN}
always-auth=true
```

If this project lives under group `nexus`, the instance endpoint also works: `${CI_API_V4_URL}/packages/npm/`.

Local portal development keeps `file:../anx-npm-modules/packages/...` — no GitLab token required.

