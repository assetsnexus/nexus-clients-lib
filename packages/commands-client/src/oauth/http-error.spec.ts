import { describe, expect, it } from 'vitest';
import { NexusError } from '../errors/nexus-error.js';
import { throwOAuthHttpFailure } from './http-error.js';

describe('throwOAuthHttpFailure', () => {
  it('maps REQUIREMENTS_NOT_MET without copying the raw body into the message', async () => {
    const res = new Response(JSON.stringify({
      error: 'REQUIREMENTS_NOT_MET',
      error_description: 'Login requirements are not met',
      missing: [{ code: 'bundle', slug: 'identification-l1', target: 'user' }],
      actions: [{ type: 'open_regulatory_bundle', portalPath: '/user/compliance/bundles/wizard/identification-l1' }],
      client_secret: 'must-not-leak',
    }), { status: 403 });
    await expect(throwOAuthHttpFailure('token exchange failed', res)).rejects.toBeInstanceOf(NexusError);
    try {
      await throwOAuthHttpFailure('token exchange failed', new Response(JSON.stringify({
        error: 'REQUIREMENTS_NOT_MET',
        missing: [{ code: 'verification_level' }],
        actions: [],
        client_secret: 'must-not-leak',
      }), { status: 403 }));
    } catch (err) {
      expect(err).toBeInstanceOf(NexusError);
      const nexus = err as NexusError;
      expect(nexus.code).toBe('REQUIREMENTS_NOT_MET');
      expect(nexus.httpStatus).toBe(403);
      expect(nexus.message).toBe('Login requirements are not met');
      expect(nexus.message).not.toContain('must-not-leak');
      expect(nexus.meta?.missing).toEqual([{ code: 'verification_level' }]);
    }
  });

  it('keeps the status prefix and omits the body for other failures', async () => {
    const res = new Response('invalid_grant secret=abc', { status: 400 });
    try {
      await throwOAuthHttpFailure('token exchange failed', res);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(NexusError);
      const nexus = err as NexusError;
      expect(nexus.message).toBe('token exchange failed: 400');
      expect(nexus.message).not.toContain('secret');
      expect(nexus.meta?.status).toBe(400);
    }
  });
});
