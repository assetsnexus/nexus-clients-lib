import { mapHttpStatusToCode, NexusError } from '../errors/nexus-error.js';

/**
 * Turn a non-2xx OAuth REST response into a NexusError.
 * The message is `${operation}: ${status}` and never includes the body,
 * because token and secret errors can echo credentials.
 */
export async function throwOAuthHttpFailure(operation: string, res: Response): Promise<never> {
  const text = await res.text();
  let oauthError: string | undefined;
  let missing: unknown;
  let actions: unknown;
  if (text) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.error === 'string') oauthError = parsed.error;
        missing = parsed.missing;
        actions = parsed.actions;
      }
    } catch {
      oauthError = undefined;
    }
  }
  if (oauthError === 'REQUIREMENTS_NOT_MET') {
    throw new NexusError('REQUIREMENTS_NOT_MET', 'Login requirements are not met', {
      meta: {
        status: res.status,
        missing: Array.isArray(missing) ? missing : [],
        actions: Array.isArray(actions) ? actions : [],
      },
    });
  }
  throw new NexusError(mapHttpStatusToCode(res.status), `${operation}: ${res.status}`, {
    meta: {
      status: res.status,
      ...(oauthError ? { oauthError } : {}),
    },
  });
}
