import { NEXUS_ERROR_CATALOG, NexusError, type NexusErrorCode } from '../errors/nexus-error.js';
import type { SendResult } from '../types.js';
import { ElevationRequiredError } from '../permissions/elevation-error.js';

export function requireCommandData<T>(result: SendResult<T>, command: string): T {
  const elevation = ElevationRequiredError.fromSendResult(result);
  if (elevation) throw elevation;
  if (!result.ok || result.kind !== 'ok') {
    const regionCode = !result.ok ? result.error.code : undefined;
    const message = !result.ok ? result.error.message : `${command} did not return a result`;
    const code: NexusErrorCode =
      regionCode && regionCode in NEXUS_ERROR_CATALOG
        ? (regionCode as NexusErrorCode)
        : 'UNKNOWN';
    throw new NexusError(code, message || `${command} failed`, {
      meta: { command, regionCode: regionCode || null },
    });
  }
  return result.data;
}
