import { SDK_VERSION } from './version.js';

/** `X-Anx-Client` value, e.g. `@nexus/commands-client/0.4.0`. */
export function sdkClientHeaderValue(): string {
  return `@nexus/commands-client/${SDK_VERSION}`;
}

const APP_TOKEN = /^[A-Za-z0-9._-]{1,64}$/;

export type SdkAppInfo = {
  name: string;
  version: string;
};

/**
 * `X-Anx-App` value when name and version match `[A-Za-z0-9._-]{1,64}`.
 * Returns undefined for missing or invalid input — callers skip the header.
 */
export function sdkAppHeaderValue(app?: SdkAppInfo | null): string | undefined {
  if (!app) return undefined;
  if (typeof app.name !== 'string' || typeof app.version !== 'string') return undefined;
  if (!APP_TOKEN.test(app.name) || !APP_TOKEN.test(app.version)) return undefined;
  return `${app.name}/${app.version}`;
}

/** Always sets `X-Anx-Client`. Sets `X-Anx-App` only when {@link sdkAppHeaderValue} accepts it. */
export function applySdkHeaders(headers: Record<string, string>, app?: SdkAppInfo | null): void {
  headers['X-Anx-Client'] = sdkClientHeaderValue();
  const appHeader = sdkAppHeaderValue(app);
  if (appHeader) headers['X-Anx-App'] = appHeader;
}
