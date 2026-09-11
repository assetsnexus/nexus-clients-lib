# Changelog

## 0.2.1

- `403 PERMISSION_ELEVATION_REQUIRED` maps to `kind: 'permission_elevation_required'` with typed `permissionElevation` (elevationId, pack, command / commandNames, onboarding flags).
- New `mapPermissionElevationError` + testing fixture `fixturePermissionElevation`.
- Catalog codes: `PERMISSION_ELEVATION_REQUIRED`, `APPROVER_INSUFFICIENT_PERMISSION`, `ONBOARDING_REQUIRED_FOR_GRANT`.

## 0.2.0

- Envelope `102` maps to `kind: 'accepted'` with `taskId`, `mode`, `statusCommand`, `cancelCommand`, `pollAfterMs`, `expiresAt`, `channels`, `progress`.
- Legacy non-SCA `202` still maps to `kind: 'accepted'` (queued stubs that have not migrated).
- New `client.longRunning` namespace: `list` / `get` / `cancel` / `waitForTask` / `sendAndWait`.
- Testing fixtures: `fixtureLongRunning`, `fixtureAcceptedLegacy202`, `fixtureTaskView`.

## 0.1.0

- Initial release: NexusClient, SCA/2FA, OAuth helpers, region resolvers, grant/subscriptions namespaces, testing export, codegen CLI.
