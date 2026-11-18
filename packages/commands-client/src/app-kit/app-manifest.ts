/**
 * Cross-app manifest helpers.
 *
 * An app that declares what it exposes to other apps (and what it needs from
 * them) needs the same three things every seeding app needs:
 *
 * - a canonical serialization + hash, so a boot re-seed whose config did not
 *   change is a no-op;
 * - a diff against the previous seed, so the app knows whether to push;
 * - a small reader for the consent dependency payload, so the app can show the
 *   exact next step (install / choose / skip) without re-deriving it.
 *
 * The region is the authority for validation; these helpers mirror the wire
 * shape and the pure exposure rule so an app can predict the outcome.
 */
import { canonicalJson, catalogHash } from './seed-catalog.js';

export type AppRequirementTarget =
  | { kind: 'app'; clientId: string }
  | { kind: 'objectType' | 'capability' | 'signal'; slug: string };

export interface AppRequirement {
  target: AppRequirementTarget;
  /** Semver floor for a specific app. */
  minVersion?: string;
  /** Required stops install/consent; optional only warns. */
  required: boolean;
  /** One line shown to the user (max 280). */
  purpose: string;
  /** Minimum tier the subject must hold on the producer. */
  minTierId?: string;
}

export interface AppRequirements {
  requires: AppRequirement[];
}

export interface AppObjectType {
  slug: string;
  label: string;
  description?: string;
  operations?: { list?: string; get?: string; create?: string; update?: string; delete?: string };
}

export interface AppSignal {
  slug: string;
  title: string;
  description?: string;
  channels?: Array<'notification' | 'toolset'>;
}

export interface AppCapability {
  slug: string;
  title: string;
  description?: string;
  exclusive?: boolean;
}

export interface AppToolExposure {
  mode: 'none' | 'all' | 'allowlist' | 'blocklist';
  patterns?: string[];
  partnerClientIds?: string[];
}

export interface AppNativeToolPolicy {
  disable?: Array<{ pattern: string; reason: string }>;
  customize?: Array<{ pattern: string; reason: string }>;
}

export interface AppManifest {
  version: string;
  objectTypes?: AppObjectType[];
  signals?: AppSignal[];
  capabilities?: AppCapability[];
  toolExposure?: AppToolExposure;
  nativeToolPolicy?: AppNativeToolPolicy;
  agentDm?: { enabled: boolean };
}

export type AppRequirementState =
  | 'satisfied'
  | 'missing'
  | 'version_mismatch'
  | 'ambiguous'
  | 'tier_required'
  | 'conflict';

export interface AppRequirementResolution {
  target: AppRequirementTarget;
  required: boolean;
  purpose: string;
  status: AppRequirementState;
  resolved?: { clientId: string; name: string; version?: string };
  candidates?: Array<{ clientId: string; name: string; version?: string }>;
  action?: {
    kind: 'install_app' | 'choose_app' | 'choose_tier' | 'choose_primary';
    clientId?: string;
    appstorePath?: string;
  };
}

export interface AppRequirementsPayload {
  requirements: AppRequirementResolution[];
  warnings: string[];
}

export interface AppManifestSeed {
  manifest: AppManifest;
  requirements?: AppRequirements;
}

export interface AppManifestSeedResult {
  /** `sha256:<hex>` over the canonical seed. */
  hash: string;
  /** The canonical JSON the hash was taken over. */
  canonical: string;
}

/**
 * Hash a manifest + requirements seed. A re-seed whose hash is unchanged is a
 * no-op; a changed hash re-applies.
 */
export async function createAppManifest(seed: AppManifestSeed): Promise<AppManifestSeedResult> {
  const canonical = canonicalJson({
    manifest: seed.manifest,
    ...(seed.requirements ? { requirements: seed.requirements } : {}),
  });
  return { canonical, hash: await catalogHash(seed) };
}

export interface AppManifestDiff {
  changed: boolean;
  hash: string;
  /** Top-level keys that differ (`manifest`, `requirements`). */
  changedKeys: string[];
}

/**
 * Diff a previous seed against the next one. `previousHash` is what the app
 * stored last time it pushed; when it is absent the seed is treated as changed.
 */
export async function diffAppManifest(
  previous: AppManifestSeed | null | undefined,
  next: AppManifestSeed,
  previousHash?: string | null,
): Promise<AppManifestDiff> {
  const { hash } = await createAppManifest(next);
  if (!previous) return { changed: true, hash, changedKeys: ['manifest', 'requirements'] };
  const changedKeys: string[] = [];
  if (canonicalJson(previous.manifest) !== canonicalJson(next.manifest)) changedKeys.push('manifest');
  if (canonicalJson(previous.requirements ?? null) !== canonicalJson(next.requirements ?? null)) {
    changedKeys.push('requirements');
  }
  const changed = previousHash ? previousHash !== hash : changedKeys.length > 0;
  return { changed, hash, changedKeys };
}

/** The exact next step for one resolved requirement, or null when satisfied. */
export function requirementAction(
  resolution: AppRequirementResolution,
): AppRequirementResolution['action'] | null {
  if (resolution.status === 'satisfied') return null;
  return resolution.action ?? null;
}

/** True when a required dependency still blocks approval. */
export function blocksApproval(payload: AppRequirementsPayload | null | undefined): boolean {
  if (!payload) return false;
  return payload.requirements.some((r) => r.required && r.status !== 'satisfied');
}

/** The requirements that still need the user's attention (non-satisfied). */
export function pendingRequirements(
  payload: AppRequirementsPayload | null | undefined,
): AppRequirementResolution[] {
  if (!payload) return [];
  return payload.requirements.filter((r) => r.status !== 'satisfied');
}

function matchesToolPattern(pattern: string, toolName: string): boolean {
  const raw = String(pattern || '').trim();
  if (!raw) return false;
  if (raw.endsWith('*')) return toolName.startsWith(raw.slice(0, -1));
  if (raw.endsWith('.')) return toolName.startsWith(raw);
  return toolName === raw;
}

/**
 * True when `consumerClientId` may call `toolName` on a producer that declares
 * `exposure`. Mirrors the region's pure rule so an app can predict the outcome.
 */
export function isToolExposed(input: {
  exposure?: AppToolExposure;
  consumerClientId?: string;
  toolName: string;
}): boolean {
  const exposure = input.exposure;
  if (!exposure) return false;
  if (input.consumerClientId && (exposure.partnerClientIds || []).includes(input.consumerClientId)) {
    return true;
  }
  switch (exposure.mode) {
    case 'all':
      return true;
    case 'allowlist':
      return (exposure.patterns || []).some((p) => matchesToolPattern(p, input.toolName));
    case 'blocklist':
      return !(exposure.patterns || []).some((p) => matchesToolPattern(p, input.toolName));
    case 'none':
    default:
      return false;
  }
}

/** Filter a producer's tool names down to what a consumer may call. */
export function exposedTools(input: {
  exposure?: AppToolExposure;
  consumerClientId?: string;
  toolNames: string[];
}): string[] {
  return input.toolNames.filter((toolName) =>
    isToolExposed({ exposure: input.exposure, consumerClientId: input.consumerClientId, toolName }),
  );
}

/**
 * Nexus commands a producer's `nativeToolPolicy` removes from an agent's belt.
 * `customize` patterns are kept (the app's rules are injected instead).
 */
export function disabledNativeCommands(policy: AppNativeToolPolicy | undefined): string[] {
  return (policy?.disable || []).map((entry) => entry.pattern);
}
