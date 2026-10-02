import type { AnxNodeHealthV1, DeprecationCommandNotice, DeprecationNotice } from './types.js';

const CLIENT_STATUS = new Set(['current', 'outdated', 'unsupported']);

/** Parse a `/health` JSON body. Returns undefined when it is not AnxNodeHealthV1. */
export function parseAnxNodeHealth(body: unknown): AnxNodeHealthV1 | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const raw = body as Record<string, unknown>;
  if (raw.status !== 'ok' && raw.status !== 'degraded') return undefined;
  if (raw.nodeKind !== 'region' && raw.nodeKind !== 'asset' && raw.nodeKind !== 'gateway') {
    return undefined;
  }
  if (typeof raw.serverVersion !== 'string' || raw.serverVersion.length === 0) return undefined;
  if (raw.protocolVersion !== 1) return undefined;
  if (typeof raw.catalogFingerprint !== 'string' || raw.catalogFingerprint.length === 0) {
    return undefined;
  }

  const health: AnxNodeHealthV1 = {
    status: raw.status,
    nodeKind: raw.nodeKind,
    serverVersion: raw.serverVersion,
    protocolVersion: 1,
    catalogFingerprint: raw.catalogFingerprint,
  };

  const client = parseClient(raw.client);
  if (client) health.client = client;
  const deprecations = parseDeprecations(raw.deprecations);
  if (deprecations) health.deprecations = deprecations;
  return health;
}

export function healthDeprecationNotice(health: AnxNodeHealthV1): DeprecationNotice | undefined {
  const block = health.deprecations;
  if (!block?.warning) return undefined;
  return {
    signature: healthWarningSignature(health),
    catalogFingerprint: health.catalogFingerprint,
    warning: true,
    nearestSunsetAt: block.nearestSunsetAt,
    commands: block.commands,
  };
}

export function headerDeprecationNotice(input: {
  command?: string;
  deprecation: string | null;
  sunset: string | null;
  link: string | null;
}): DeprecationNotice | undefined {
  const deprecation = blankToUndefined(input.deprecation);
  const sunset = blankToUndefined(input.sunset);
  const link = blankToUndefined(input.link);
  if (!deprecation && !sunset && !link) return undefined;
  const command = input.command;
  return {
    signature: ['headers', command ?? '', deprecation ?? '', sunset ?? '', link ?? ''].join('|'),
    warning: true,
    command,
    nearestSunsetAt: sunset,
    deprecation,
    sunset,
    link,
  };
}

export function deprecationDedupeKey(notice: DeprecationNotice): string {
  return `${notice.catalogFingerprint ?? ''}|${notice.signature}`;
}

function healthWarningSignature(health: AnxNodeHealthV1): string {
  const block = health.deprecations;
  const commands = [...(block?.commands ?? [])]
    .map(
      (command) =>
        `${command.command}@${command.commandVersion}->${command.latestVersion}|${command.sunsetAt ?? ''}|${command.replacedBy ?? ''}|${command.usedByCaller ? 1 : 0}`,
    )
    .sort()
    .join(',');
  return `health|${block?.warning === true}|${block?.nearestSunsetAt ?? ''}|${commands}`;
}

function parseClient(value: unknown): AnxNodeHealthV1['client'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.name !== 'string' || typeof raw.version !== 'string') return undefined;
  if (typeof raw.status !== 'string' || !CLIENT_STATUS.has(raw.status)) return undefined;
  return {
    name: raw.name,
    version: raw.version,
    status: raw.status as 'current' | 'outdated' | 'unsupported',
    ...(typeof raw.appVersion === 'string' ? { appVersion: raw.appVersion } : {}),
    ...(typeof raw.latest === 'string' ? { latest: raw.latest } : {}),
    ...(typeof raw.minSupported === 'string' ? { minSupported: raw.minSupported } : {}),
  };
}

function parseDeprecations(value: unknown): AnxNodeHealthV1['deprecations'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.warning !== 'boolean') return undefined;
  if (!Array.isArray(raw.commands)) return undefined;
  const commands: DeprecationCommandNotice[] = [];
  for (const item of raw.commands) {
    const parsed = parseCommand(item);
    if (parsed) commands.push(parsed);
  }
  return {
    warning: raw.warning,
    commands,
    ...(typeof raw.nearestSunsetAt === 'string' ? { nearestSunsetAt: raw.nearestSunsetAt } : {}),
  };
}

function parseCommand(value: unknown): DeprecationCommandNotice | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.command !== 'string' || raw.command.length === 0) return undefined;
  if (typeof raw.commandVersion !== 'number' || !Number.isFinite(raw.commandVersion)) return undefined;
  if (typeof raw.latestVersion !== 'number' || !Number.isFinite(raw.latestVersion)) return undefined;
  return {
    command: raw.command,
    commandVersion: raw.commandVersion,
    latestVersion: raw.latestVersion,
    usedByCaller: raw.usedByCaller === true,
    ...(typeof raw.deprecatedSince === 'string' ? { deprecatedSince: raw.deprecatedSince } : {}),
    ...(typeof raw.sunsetAt === 'string' ? { sunsetAt: raw.sunsetAt } : {}),
    ...(typeof raw.replacedBy === 'string' ? { replacedBy: raw.replacedBy } : {}),
    ...(typeof raw.lastUsedAt === 'string' ? { lastUsedAt: raw.lastUsedAt } : {}),
  };
}

function blankToUndefined(value: string | null): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
