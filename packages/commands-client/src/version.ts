/**
 * Package version injected by tsup (`__NEXUS_SDK_VERSION__`).
 * Vitest sets the same define so tests see the package.json version.
 */
/// <reference path="./sdk-version.d.ts" />
export const SDK_VERSION: string =
  typeof __NEXUS_SDK_VERSION__ === 'string' && __NEXUS_SDK_VERSION__.length > 0
    ? __NEXUS_SDK_VERSION__
    : '0.4.1';
