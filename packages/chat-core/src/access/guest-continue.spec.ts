import { describe, expect, it } from 'vitest';
import { applyTurnFailure, initialFundingGate } from './gate.js';
import { guestContinuePresentation } from './guest-continue.js';
import { fundingQuickSelectModel } from './present.js';

const loginUrl = 'https://portal.example/login?returnTo=%2Fasset%2Fa%2Fchat%3Fagent%3Dsystem-public';

describe('guest continue', () => {
  it('shows a link in the browser and a QR on a kiosk for the same url', () => {
    const state = applyTurnFailure(initialFundingGate(), {
      code: 'GUEST_ALLOWANCE_EXHAUSTED',
      loginUrl,
    });
    expect(state.phase).toBe('login_required');
    expect(state.loginUrl).toBe(loginUrl);
    const model = fundingQuickSelectModel(state);
    expect(model.visible).toBe(true);
    expect(model.showByo).toBe(false);
    expect(model.showResale).toBe(false);
    expect(guestContinuePresentation({ outcome: 'login_required', loginUrl, surface: 'browser' })).toEqual({
      kind: 'link',
      url: loginUrl,
    });
    expect(guestContinuePresentation({ outcome: 'login_required', loginUrl, surface: 'kiosk' })).toEqual({
      kind: 'qr',
      url: loginUrl,
    });
    expect(guestContinuePresentation({ outcome: 'chat', loginUrl, surface: 'kiosk' })).toEqual({ kind: 'none' });
  });

  it('requires login immediately when no free contingent applies', () => {
    const state = applyTurnFailure(initialFundingGate(), { code: 'GUEST_LOGIN_REQUIRED', loginUrl });
    expect(state.phase).toBe('login_required');
    expect(state.reason).toBe('GUEST_LOGIN_REQUIRED');
  });
});
