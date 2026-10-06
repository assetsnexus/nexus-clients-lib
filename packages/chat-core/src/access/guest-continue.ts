export type GuestContinueSurface = 'browser' | 'kiosk';

export interface GuestContinueInput {
  outcome: 'chat' | 'login_required';
  loginUrl?: string | null;
  surface: GuestContinueSurface;
}

export type GuestContinuePresentation =
  | { kind: 'none' }
  | { kind: 'link'; url: string }
  | { kind: 'qr'; url: string };

/**
 * Shared decision for the end of a free guest chat.
 * A browser shows a link. A kiosk shows a QR code. Both encode the same URL.
 */
export function guestContinuePresentation(input: GuestContinueInput): GuestContinuePresentation {
  if (input.outcome !== 'login_required') return { kind: 'none' };
  const url = typeof input.loginUrl === 'string' ? input.loginUrl.trim() : '';
  if (!url) return { kind: 'none' };
  return input.surface === 'kiosk' ? { kind: 'qr', url } : { kind: 'link', url };
}
