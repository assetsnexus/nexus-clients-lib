# Changelog

## 0.3.0

- `client.subject.identities()`, `regulatoryStatus()`, and `fields.get()` / `fields.request()` for the R3–R4 app commands.
- `verifyAttestation()` checks the RS256 regulatory JWS (`aud` = client id, region JWKS). HS256 is rejected.
- `client.permissions.requestBatch()` plus `ElevationRequiredError` (`approvalUrl`, `waitForDecision()`).
- PKCE and attestation verification use global Web Crypto. Node 20+ has it; Node 18 partners assign `node:crypto` `webcrypto` onto `globalThis.crypto` (see README). `engines` stays `>=18`.
- Typed login requirements, data-access modes, and catalog groups.

## 0.2.2

- `CommandConnectivityController`: transport disconnect classifier, 3-attempt/10s retry queue, degraded→down state (20s authenticated / 10s anonymous), health probe, coalesce for identical reads.
- `isTransportDisconnect` — long command timeouts are not "region down"; short health timeouts may be.
- `NexusClient` transport retries now spread over ~10s (same schedule); circuit open shortened to 5s.

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
