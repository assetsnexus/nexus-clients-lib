export type DeprecationCommandNotice = {
  command: string;
  commandVersion: number;
  latestVersion: number;
  deprecatedSince?: string;
  sunsetAt?: string;
  replacedBy?: string;
  usedByCaller: boolean;
  lastUsedAt?: string;
};

export type AnxNodeHealthV1 = {
  status: 'ok' | 'degraded';
  nodeKind: 'region' | 'asset' | 'gateway';
  serverVersion: string;
  protocolVersion: 1;
  catalogFingerprint: string;
  client?: {
    name: string;
    version: string;
    appVersion?: string;
    status: 'current' | 'outdated' | 'unsupported';
    latest?: string;
    minSupported?: string;
  };
  deprecations?: {
    warning: boolean;
    nearestSunsetAt?: string;
    commands: DeprecationCommandNotice[];
  };
};

/**
 * Fired from a health report (`deprecations.warning`) or from
 * `Deprecation` / `Sunset` / `Link` headers on a command response.
 * Delivered once per `catalogFingerprint` + `signature`.
 */
export type DeprecationNotice = {
  signature: string;
  catalogFingerprint?: string;
  warning: boolean;
  command?: string;
  nearestSunsetAt?: string;
  deprecation?: string;
  sunset?: string;
  link?: string;
  commands?: DeprecationCommandNotice[];
};
