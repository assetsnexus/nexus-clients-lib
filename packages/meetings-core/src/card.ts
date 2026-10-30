/**
 * Shared meeting card model (@nexus/meetings-core).
 *
 * A calendar entry (region `anx.calendar.event.*`) projects into a
 * `MeetingCardModel` that the portal, mobile, and desktop all render the same
 * way. The card is presentation-only: it never performs IO and never carries a
 * token. `resolveOpenTarget` decides where a click goes.
 */

import {
  detectProviderFromUrl,
  isMeetingProviderId,
  normalizeProviderId,
  providerOpens,
  providerSpec,
  type MeetingProviderId,
} from './providers.js';

export type MeetingCardInput = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  /** Provider token from metadata (may be an alias or absent). */
  provider?: unknown;
  joinUrl?: string | null;
  /** Nexus conversation room id, when the meeting runs in a room. */
  roomId?: string | null;
  location?: string | null;
  description?: string | null;
  allDay?: boolean;
  status?: 'tentative' | 'confirmed' | 'cancelled';
  /** The viewer's own RSVP, when they are an attendee. */
  myStatus?: 'needs_action' | 'accepted' | 'declined' | 'tentative' | null;
  /** Optional link back to a CRM lead / asset / job entity. */
  links?: Array<{ entityType: string; entityId: string; role?: string }>;
};

export type MeetingOpenTarget =
  | { kind: 'room'; roomId: string }
  | { kind: 'external'; url: string }
  | { kind: 'describe'; provider: MeetingProviderId; description: string | null };

export type MeetingCardModel = {
  id: string;
  title: string;
  provider: MeetingProviderId;
  providerLabel: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  cancelled: boolean;
  /** Whether the card exposes a clickable open action. */
  clickable: boolean;
  joinUrl: string | null;
  roomId: string | null;
  location: string | null;
  description: string | null;
  myStatus: MeetingCardInput['myStatus'];
  /** Which tab surfaces are meaningful for this provider. */
  surfaces: {
    video: boolean;
    participants: boolean;
    scene: boolean;
    screenshare: boolean;
  };
  links: Array<{ entityType: string; entityId: string; role?: string }>;
};

function clean(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Pick the provider id from explicit input, then the join URL host. */
export function resolveMeetingProvider(input: Pick<MeetingCardInput, 'provider' | 'joinUrl' | 'roomId'>): MeetingProviderId {
  const explicit = normalizeProviderId(input.provider);
  if (explicit) return explicit;
  if (isMeetingProviderId(input.provider)) return input.provider;
  const fromUrl = detectProviderFromUrl(input.joinUrl);
  if (fromUrl) return fromUrl;
  if (clean(input.roomId)) return 'nexus';
  return 'in_person';
}

export function buildMeetingCard(input: MeetingCardInput): MeetingCardModel {
  const provider = resolveMeetingProvider(input);
  const spec = providerSpec(provider);
  const joinUrl = clean(input.joinUrl);
  const roomId = clean(input.roomId);
  const linkList = Array.isArray(input.links) ? input.links.filter((l) => l?.entityType && l?.entityId) : [];
  return {
    id: input.id,
    title: input.title,
    provider,
    providerLabel: spec.label,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    allDay: Boolean(input.allDay),
    cancelled: input.status === 'cancelled',
    clickable: !input.status || input.status !== 'cancelled' ? providerOpens(provider, joinUrl, roomId) : false,
    joinUrl,
    roomId,
    location: clean(input.location),
    description: clean(input.description),
    myStatus: input.myStatus ?? null,
    surfaces: {
      video: spec.supportsNativeMedia,
      participants: true,
      scene: spec.supportsScene,
      screenshare: spec.supportsScreenshare,
    },
    links: linkList,
  };
}

/**
 * Where a click on the card should go.
 *
 * A nexus room wins (route in-app); otherwise the provider URL opens externally;
 * custom / in-person meetings fall back to showing the description.
 */
export function resolveOpenTarget(card: MeetingCardModel): MeetingOpenTarget {
  if (card.cancelled) return { kind: 'describe', provider: card.provider, description: card.description };
  if (card.provider === 'nexus' && card.roomId) return { kind: 'room', roomId: card.roomId };
  if (card.roomId && card.provider !== 'in_person' && card.provider !== 'custom') {
    return { kind: 'room', roomId: card.roomId };
  }
  if (card.joinUrl && (card.provider === 'custom' || providerSpec(card.provider).openMode === 'external')) {
    return { kind: 'external', url: card.joinUrl };
  }
  return { kind: 'describe', provider: card.provider, description: card.description };
}
