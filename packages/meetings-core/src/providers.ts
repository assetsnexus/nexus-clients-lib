/**
 * Meeting provider catalog (@nexus/meetings-core).
 *
 * Nexus meetings are not nexus-only: an entry may be a Zoom / Teams / Google
 * Meet / Webex call or a fully custom description. This module is the single
 * source of truth for provider identity — the label, how to open the meeting,
 * and which in-app surfaces (video, participants, screenshare, 3D scene) a
 * provider supports.
 *
 * The same catalog is consumed by the portal, mobile, desktop, and external
 * nexus apps, so meeting cards render and route identically.
 */

export type MeetingProviderId =
  | 'nexus'
  | 'zoom'
  | 'teams'
  | 'google_meet'
  | 'webex'
  | 'custom'
  | 'in_person';

/** How clicking a meeting card opens the meeting. */
export type MeetingOpenMode =
  /** Route inside the host app (nexus room). */
  | 'in_app'
  /** Open a provider URL in the system browser / new tab. */
  | 'external'
  /** No remote target — show the description (custom / in person). */
  | 'describe';

export type MeetingProviderSpec = {
  id: MeetingProviderId;
  label: string;
  /** Provider URL host fragments used to detect the provider from a join URL. */
  hosts: string[];
  openMode: MeetingOpenMode;
  /** Whether the native nexus media surface (video/participants) applies. */
  supportsNativeMedia: boolean;
  /** Whether a 3D scene tab can be shown for this meeting (cluster editor). */
  supportsScene: boolean;
  /** Whether a screenshare tab is meaningful. */
  supportsScreenshare: boolean;
};

export const MEETING_PROVIDERS: Record<MeetingProviderId, MeetingProviderSpec> = {
  nexus: {
    id: 'nexus',
    label: 'Nexus meeting',
    hosts: [],
    openMode: 'in_app',
    supportsNativeMedia: true,
    supportsScene: true,
    supportsScreenshare: true,
  },
  zoom: {
    id: 'zoom',
    label: 'Zoom',
    hosts: ['zoom.us', 'zoom.com'],
    openMode: 'external',
    supportsNativeMedia: false,
    supportsScene: false,
    supportsScreenshare: false,
  },
  teams: {
    id: 'teams',
    label: 'Microsoft Teams',
    hosts: ['teams.microsoft.com', 'teams.live.com'],
    openMode: 'external',
    supportsNativeMedia: false,
    supportsScene: false,
    supportsScreenshare: false,
  },
  google_meet: {
    id: 'google_meet',
    label: 'Google Meet',
    hosts: ['meet.google.com'],
    openMode: 'external',
    supportsNativeMedia: false,
    supportsScene: false,
    supportsScreenshare: false,
  },
  webex: {
    id: 'webex',
    label: 'Webex',
    hosts: ['webex.com', 'meetings.webex.com'],
    openMode: 'external',
    supportsNativeMedia: false,
    supportsScene: false,
    supportsScreenshare: false,
  },
  custom: {
    id: 'custom',
    label: 'Other',
    hosts: [],
    openMode: 'describe',
    supportsNativeMedia: false,
    supportsScene: false,
    supportsScreenshare: false,
  },
  in_person: {
    id: 'in_person',
    label: 'In person',
    hosts: [],
    openMode: 'describe',
    supportsNativeMedia: false,
    supportsScene: false,
    supportsScreenshare: false,
  },
};

/** Alias tokens clients may send, mapped onto the canonical provider id. */
const PROVIDER_ALIASES: Record<string, MeetingProviderId> = {
  nexus: 'nexus',
  anx: 'nexus',
  room: 'nexus',
  nexus_meeting: 'nexus',
  nexus_room: 'nexus',
  zoom: 'zoom',
  teams: 'teams',
  msteams: 'teams',
  ms_teams: 'teams',
  microsoft_teams: 'teams',
  microsoftteams: 'teams',
  google: 'google_meet',
  google_meet: 'google_meet',
  meet: 'google_meet',
  webex: 'webex',
  cisco: 'webex',
  cisco_webex: 'webex',
  custom: 'custom',
  other: 'custom',
  in_person: 'in_person',
  onsite: 'in_person',
  on_site: 'in_person',
  physical: 'in_person',
};

export function isMeetingProviderId(value: unknown): value is MeetingProviderId {
  return typeof value === 'string' && value in MEETING_PROVIDERS;
}

/**
 * Normalize a raw token (client input or metadata) to a canonical provider id.
 *
 * Separators (`-`/whitespace) are folded to `_` before the alias lookup, so the
 * loose spellings the region accepts in `normalizeMeetingProvider` (and the
 * portal-era slugs legacy events stored: `nexus_meeting`, `ms_teams`,
 * `cisco_webex`, `on_site`) resolve identically in every host.
 */
export function normalizeProviderId(raw: unknown): MeetingProviderId | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!key) return null;
  return PROVIDER_ALIASES[key] ?? (isMeetingProviderId(key) ? key : null);
}

/**
 * Detect the provider from a join URL host.
 *
 * Returns `nexus` only when the caller says so; an unknown external URL is
 * `custom` (the user picks / it is described), never silently in-person.
 */
export function detectProviderFromUrl(url: string | null | undefined): MeetingProviderId | null {
  if (typeof url !== 'string' || !url.trim()) return null;
  let host: string;
  try {
    host = new URL(url.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const spec of Object.values(MEETING_PROVIDERS)) {
    if (spec.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return spec.id;
  }
  return 'custom';
}

export function providerSpec(id: MeetingProviderId): MeetingProviderSpec {
  return MEETING_PROVIDERS[id];
}

/**
 * Should the card render a clickable join action?
 *
 * Must agree with `resolveOpenTarget` — a card that is `clickable` but resolves
 * to `describe` is a dead click in every host (portal, app, desktop). An
 * `in_app` provider therefore needs a room id: a `nexus` meeting whose room
 * never got provisioned (region is fail-soft here) has nowhere to go and must
 * render as a non-clickable description instead.
 */
export function providerOpens(
  id: MeetingProviderId,
  joinUrl: string | null,
  roomId?: string | null,
): boolean {
  const spec = providerSpec(id);
  if (spec.openMode === 'in_app') return Boolean(typeof roomId === 'string' && roomId.trim());
  if (spec.openMode === 'external') return Boolean(joinUrl);
  return false;
}
