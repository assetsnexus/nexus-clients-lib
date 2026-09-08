/**
 * WP9 — Chat chrome helpers ported from inference chat chrome patterns.
 * Pure logic utilities for tier icons, hosting failover, @mentions,
 * activity bar state, FAB badge, and draft persistence.
 */

// ---------------------------------------------------------------------------
// Tier icons
// ---------------------------------------------------------------------------

export type ModelTier = 'free' | 'basic' | 'pro' | 'enterprise' | 'custom';

const TIER_ICONS: Record<ModelTier, string> = {
  free: '⚡',
  basic: '🟢',
  pro: '🔵',
  enterprise: '🟣',
  custom: '⚙️',
};

const TIER_ORDER: Record<ModelTier, number> = {
  free: 0,
  basic: 1,
  pro: 2,
  enterprise: 3,
  custom: 4,
};

export function tierIcon(tier: ModelTier | string | undefined): string {
  return TIER_ICONS[(tier || 'free') as ModelTier] || TIER_ICONS.free;
}

export function tierSortKey(tier: ModelTier | string | undefined): number {
  return TIER_ORDER[(tier || 'free') as ModelTier] ?? 99;
}

// ---------------------------------------------------------------------------
// Compute tiers (inference ChatModelSelector parity)
// ---------------------------------------------------------------------------

export type ComputeTier = 'very_fast' | 'fast' | 'balanced' | 'heavy' | 'very_heavy';

export const COMPUTE_TIER_META: Record<
  ComputeTier,
  { label: string; icon: string; sortKey: number }
> = {
  very_fast: { label: 'VERY FAST', icon: '⚡', sortKey: 0 },
  fast: { label: 'FAST', icon: '🚀', sortKey: 1 },
  balanced: { label: 'BALANCED', icon: '⚖️', sortKey: 2 },
  heavy: { label: 'HEAVY', icon: '🧠', sortKey: 3 },
  very_heavy: { label: 'VERY HEAVY', icon: '🏔️', sortKey: 4 },
};

export function normalizeComputeTier(raw: unknown): ComputeTier {
  const v = String(raw || 'balanced').toLowerCase();
  if (v === 'very_fast' || v === 'fast' || v === 'balanced' || v === 'heavy' || v === 'very_heavy') {
    return v;
  }
  if (v === 'free' || v === 'basic') return 'fast';
  if (v === 'pro') return 'balanced';
  if (v === 'enterprise') return 'heavy';
  return 'balanced';
}

export function computeTierIcon(tier: ComputeTier | string | undefined): string {
  return COMPUTE_TIER_META[normalizeComputeTier(tier)].icon;
}

export function computeTierSortKey(tier: ComputeTier | string | undefined): number {
  return COMPUTE_TIER_META[normalizeComputeTier(tier)].sortKey;
}

/** Relative $–$$$$$ price level (0 = free/unknown dash, 1–5 = $–$$$$$). */
export function chatModelPriceLevel(
  creditsPerMillion: number | null | undefined,
  scale: { platformCreditsPerMillionInput?: number; floorCreditsPerMillionInput?: number } = {},
): number {
  if (creditsPerMillion == null || !Number.isFinite(creditsPerMillion)) return 0;
  if (creditsPerMillion <= 0) return 0;
  const platform = scale.platformCreditsPerMillionInput ?? 100;
  const floor = scale.floorCreditsPerMillionInput ?? 10;
  if (creditsPerMillion <= floor) return 1;
  if (creditsPerMillion >= platform * 4) return 5;
  if (creditsPerMillion >= platform * 2) return 4;
  if (creditsPerMillion >= platform) return 3;
  return 2;
}

export function modelPriceSymbols(level: number): string {
  const n = Math.max(0, Math.min(5, Math.round(Number(level) || 0)));
  if (n <= 0) return '–';
  return '$'.repeat(n);
}

// ---------------------------------------------------------------------------
// Hosting failover
// ---------------------------------------------------------------------------

export type HostingType =
  | 'public_cloud'
  | 'managed_cloud'
  | 'private_cloud'
  | 'edge_processing';

export const HOSTING_BADGE_LABELS: Record<HostingType, string> = {
  public_cloud: 'public',
  managed_cloud: 'managed',
  private_cloud: 'private',
  edge_processing: 'edge',
};

const HOSTING_PREFERENCE: HostingType[] = [
  'private_cloud',
  'managed_cloud',
  'public_cloud',
  'edge_processing',
];

/**
 * Given a set of available hosting types, return the best fallback
 * when the preferred type is unavailable.
 */
export function resolveHostingFallback(
  preferred: HostingType | undefined,
  available: HostingType[],
): HostingType | null {
  if (preferred && available.includes(preferred)) return preferred;
  for (const h of HOSTING_PREFERENCE) {
    if (available.includes(h)) return h;
  }
  return available[0] || null;
}

// ---------------------------------------------------------------------------
// @mentions parser
// ---------------------------------------------------------------------------

export type MentionToken = {
  id: string;
  label: string;
  start: number;
  end: number;
};

const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Parse `@[Display Name](id)` tokens from a draft string.
 * Returns ordered mentions and the cleaned text (mentions replaced by `@Display Name`).
 */
export function parseMentions(text: string): {
  mentions: MentionToken[];
  cleanText: string;
} {
  const mentions: MentionToken[] = [];
  let cleaned = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(MENTION_RE.source, 'g');

  while ((match = re.exec(text)) !== null) {
    cleaned += text.slice(lastIndex, match.index);
    const start = cleaned.length;
    const label = match[1];
    cleaned += `@${label}`;
    mentions.push({
      id: match[2],
      label,
      start,
      end: cleaned.length,
    });
    lastIndex = match.index + match[0].length;
  }
  cleaned += text.slice(lastIndex);
  return { mentions, cleanText: cleaned };
}

// ---------------------------------------------------------------------------
// Activity bar state
// ---------------------------------------------------------------------------

export type ActivityBarState = {
  unreadTotal: number;
  activeStreams: number;
  pendingApprovals: number;
  hasVoiceCall: boolean;
};

export function computeActivityBar(panels: Array<{
  unreadCount?: number;
  streaming?: boolean;
}>): ActivityBarState {
  let unreadTotal = 0;
  let activeStreams = 0;
  for (const p of panels) {
    unreadTotal += p.unreadCount || 0;
    if (p.streaming) activeStreams += 1;
  }
  return {
    unreadTotal,
    activeStreams,
    pendingApprovals: 0,
    hasVoiceCall: false,
  };
}

// ---------------------------------------------------------------------------
// FAB (Floating Action Button) badge
// ---------------------------------------------------------------------------

export function fabBadgeCount(activity: ActivityBarState): number {
  return activity.unreadTotal + activity.pendingApprovals;
}

export function fabBadgeLabel(count: number): string {
  if (count <= 0) return '';
  if (count > 99) return '99+';
  return String(count);
}

// ---------------------------------------------------------------------------
// Draft persistence
// ---------------------------------------------------------------------------

const DRAFT_STORAGE_KEY = 'anx_chat_drafts';

export function saveDraft(panelId: string, text: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    const drafts: Record<string, string> = raw ? JSON.parse(raw) : {};
    if (text.trim()) {
      drafts[panelId] = text;
    } else {
      delete drafts[panelId];
    }
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    /* storage quota or private mode — ignore */
  }
}

export function loadDraft(panelId: string): string {
  if (typeof localStorage === 'undefined') return '';
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return '';
    const drafts: Record<string, string> = JSON.parse(raw);
    return drafts[panelId] || '';
  } catch {
    return '';
  }
}

export function clearDraft(panelId: string): void {
  saveDraft(panelId, '');
}

export function clearAllDrafts(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
