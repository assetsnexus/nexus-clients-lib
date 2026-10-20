import { describe, expect, it } from 'vitest';
import {
  isDataAccessAppForbidden,
  planDataAccessResponse,
} from './GrantCards.js';

describe('data-access decision routing', () => {
  it('routes over anx.security.data-access.respond by default', () => {
    const planned = planDataAccessResponse({
      grantId: 'g1',
      decision: 'allow_once',
    });
    expect(planned.command).toBe('anx.security.data-access.respond');
    expect(planned.payload).toEqual({ grantId: 'g1', decision: 'allow_once' });
  });

  it('routes over the client-tool-result rail when asked', () => {
    const planned = planDataAccessResponse({
      grantId: 'g1',
      decision: 'allow_always',
      transport: 'client-tool-result',
    });
    expect(planned.command).toBe('anx.communicate.client-tool.result');
    expect(planned.payload).toEqual({
      result: { approved: true, decision: 'allow_always', grantId: 'g1' },
    });
  });

  it('marks a deny decision as not approved on the fallback rail', () => {
    const planned = planDataAccessResponse({
      grantId: 'g1',
      decision: 'deny_always',
      transport: 'client-tool-result',
    });
    expect(planned.payload.result).toMatchObject({ approved: false, decision: 'deny_always' });
  });

  it('carries a container scope on both rails, except deny_once', () => {
    const scoped = { kind: 'crm_project', id: 'p1' };
    expect(
      planDataAccessResponse({ grantId: 'g1', decision: 'allow_once', selectedScope: scoped })
        .payload,
    ).toEqual({ grantId: 'g1', decision: 'allow_once', scope: scoped });
    expect(
      planDataAccessResponse({
        grantId: 'g1',
        decision: 'allow_once',
        selectedScope: scoped,
        transport: 'client-tool-result',
      }).payload,
    ).toEqual({
      result: { approved: true, decision: 'allow_once', grantId: 'g1', scope: scoped },
    });
    // deny_once never persists a scope.
    expect(
      planDataAccessResponse({
        grantId: 'g1',
        decision: 'deny_once',
        selectedScope: scoped,
        transport: 'client-tool-result',
      }).payload,
    ).toEqual({ result: { approved: false, decision: 'deny_once', grantId: 'g1' } });
  });
});

describe('isDataAccessAppForbidden', () => {
  it('detects the region APP_ACCESS_FORBIDDEN refusal', () => {
    expect(isDataAccessAppForbidden({ ok: false, code: 'APP_ACCESS_FORBIDDEN' })).toBe(true);
    expect(
      isDataAccessAppForbidden({ ok: false, error: { code: 'APP_ACCESS_FORBIDDEN' } }),
    ).toBe(true);
    expect(
      isDataAccessAppForbidden({ ok: false, message: 'This command is not available to app identities' }),
    ).toBe(true);
  });

  it('detects a thrown Error carrying the code', () => {
    const err = Object.assign(new Error('nope'), { code: 'APP_ACCESS_FORBIDDEN' });
    expect(isDataAccessAppForbidden(err)).toBe(true);
    expect(isDataAccessAppForbidden(new Error('network'))).toBe(false);
  });

  it('does not treat an ordinary failure as app-forbidden', () => {
    expect(isDataAccessAppForbidden({ ok: false, message: 'Grant is no longer pending' })).toBe(
      false,
    );
    expect(isDataAccessAppForbidden(null)).toBe(false);
  });
});
