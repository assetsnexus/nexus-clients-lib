import { chatModelPriceLevel, modelPriceSymbols } from '@nexus/chat-core';
import { HOSTING_BADGE_LABELS } from '@nexus/chat-core';
import { formatCreditsPerM, formatIntelScore, formatUsdPerM } from './intel.js';
import type { PickerModel } from './picker-types.js';
import { modelDisplayName, resolveModelProvider } from './providerMark.js';

/** Billing gateways are not the model author. Author comes from the catalog model id. */
const GATEWAY_PROVIDER_IDS = new Set(['openrouter', 'nexus', 'assetsnexus', 'comfy']);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Region entity ids (`1792314373467-jt6sx0c8z`) are ids, never display copy. */
const ENTITY_ID_RE = /^\d{10,}-[a-z0-9]+$/i;

/** True for an opaque row id the picker must never surface as a label. */
export function isOpaqueModelId(value: unknown): boolean {
  const s = String(value ?? '').trim();
  return Boolean(s) && (UUID_RE.test(s) || ENTITY_ID_RE.test(s));
}

export function authorMarkInput(
  model: Pick<PickerModel, 'id' | 'label' | 'externalModelId' | 'providerId' | 'iconUrl'>,
): { modelId: string; providerId: string | null; iconUrl: string | null } {
  const raw = String(model.providerId || '').trim().toLowerCase();
  const providerId = raw && !GATEWAY_PROVIDER_IDS.has(raw) ? raw : null;
  return {
    modelId: model.externalModelId || model.id,
    providerId,
    iconUrl: model.iconUrl || null,
  };
}

// ---------------------------------------------------------------------------
// Name column
// ---------------------------------------------------------------------------

/** `<Provider>: <model>` — the region's synthesized catalog label separator. */
const SYNTHESIZED_PROVIDER_PREFIX = /^(.{1,32}?)\s*:\s*(\S.*)$/;

function normalizeProviderToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Drop a *synthesized* `<Provider>: ` prefix from a display label.
 *
 * The region composes catalog labels as `<vendor org>: <model>` (e.g.
 * `Anthropic: Claude Fable 5.1`), which wastes the name column because the
 * provider is already carried by the provider icon. Only a prefix that
 * resolves to this row's own provider is dropped, so a colon that belongs to
 * the model's own name (`Gemma 4 26b :free`) or a mismatched vendor token is
 * left untouched. The remaining model name is returned byte-for-byte.
 */
export function stripSynthesizedProviderPrefix(
  name: string | null | undefined,
  provider: { prefix?: string | null; label?: string | null } | null | undefined,
): string {
  const raw = String(name ?? '').trim();
  if (!raw) return raw;
  const match = SYNTHESIZED_PROVIDER_PREFIX.exec(raw);
  if (!match) return raw;
  const rest = match[2].trim();
  if (!rest) return raw;
  const head = normalizeProviderToken(match[1]);
  if (!head) return raw;
  const tokens = [provider?.label, provider?.prefix]
    .map(normalizeProviderToken)
    .filter(Boolean);
  if (!tokens.includes(head)) return raw;
  return rest;
}

/**
 * Human name the name column shows: the catalog display name with the
 * synthesized provider prefix removed, falling back to the model id part of the
 * identifier (never a raw UUID / entity id).
 */
export function displayModelName(
  model: Pick<PickerModel, 'id' | 'label' | 'externalModelId' | 'providerId' | 'iconUrl'>,
): string {
  const label = String(model.label ?? '').trim();
  const base = label && !isOpaqueModelId(label) ? label : '';
  const fallback = modelDisplayName(model.externalModelId || model.id, null);
  const name = base || (isOpaqueModelId(fallback) ? '' : fallback);
  const provider = resolveModelProvider(authorMarkInput(model));
  return stripSynthesizedProviderPrefix(name, provider) || name;
}

// ---------------------------------------------------------------------------
// Row tooltip
// ---------------------------------------------------------------------------

/**
 * `provider/model:tag` identifier the desktop sends to the region. Prefers the
 * catalog `externalModelId`; a bare slug gets its author provider prefix when
 * one is known (`gpt-realtime` + `openai`). Never returns a raw UUID / row id.
 */
export function modelIdentifier(
  model: Pick<PickerModel, 'id' | 'externalModelId' | 'providerId'>,
): string | null {
  const ext = String(model.externalModelId ?? '').trim();
  if (ext) {
    if (ext.includes('/')) return ext;
    const provider = String(model.providerId ?? '').trim().toLowerCase();
    if (provider && !GATEWAY_PROVIDER_IDS.has(provider)) return `${provider}/${ext}`;
    return ext;
  }
  const id = String(model.id ?? '').trim().replace(/^static:/i, '').trim();
  if (!id || id.includes('::') || isOpaqueModelId(id)) return null;
  return id;
}

/**
 * Plain-text row tooltip: the full human model name, then the identifier the
 * region receives (`provider/model:tag`). Newline separated so it stays
 * testable. Never a UUID; `null` when nothing honest can be shown.
 */
export function modelTooltipText(
  model: Pick<PickerModel, 'id' | 'label' | 'externalModelId' | 'providerId' | 'iconUrl'>,
): string | null {
  const label = String(model.label ?? '').trim();
  const name = label && !isOpaqueModelId(label) ? label : displayModelName(model);
  const identifier = modelIdentifier(model);
  const lines: string[] = [];
  if (name) lines.push(name);
  if (identifier && identifier !== name) lines.push(identifier);
  return lines.length ? lines.join('\n') : null;
}

/**
 * Fields the price badge reads. `outputPerM` is optional so a caller with only
 * the input side still typechecks and gets the documented fallback.
 */
export type PriceBadgeModel = {
  inputPerM: number | null;
  outputPerM?: number | null;
  chatPriceCreditsPerMillion?: number | null;
};

/**
 * USD-per-1M value the price badge shows: the **output** (token_out) rate, the
 * side that dominates a chat turn's cost. Falls back to the input rate when the
 * catalog priced no output row. Not an estimate — either a quoted row or null.
 */
export function badgeUsdPerM(model: PriceBadgeModel): number | null {
  if (typeof model.outputPerM === 'number' && Number.isFinite(model.outputPerM)) {
    return model.outputPerM;
  }
  if (typeof model.inputPerM === 'number' && Number.isFinite(model.inputPerM)) {
    return model.inputPerM;
  }
  return null;
}

/**
 * Compact chips for one catalog row.
 * A missing price or intelligence index is omitted. Never substitute a placeholder number.
 */
export function compactPriceLabel(model: PriceBadgeModel): string | null {
  const usdValue = badgeUsdPerM(model);
  if (usdValue != null) {
    const usd = formatUsdPerM(usdValue);
    if (usd === '—') return null;
    return usd === 'free' ? 'free' : `${usd}/M`;
  }
  const credits = model.chatPriceCreditsPerMillion;
  if (typeof credits !== 'number' || !Number.isFinite(credits) || credits <= 0) return null;
  const symbols = modelPriceSymbols(chatModelPriceLevel(credits));
  if (symbols && symbols !== '–') return symbols;
  return formatCreditsPerM(credits) || null;
}

export function compactIntelLabel(intelligenceIndex: number | null | undefined): string | null {
  if (typeof intelligenceIndex !== 'number' || !Number.isFinite(intelligenceIndex)) return null;
  const label = formatIntelScore(intelligenceIndex);
  return label === '—' ? null : label;
}

// ---------------------------------------------------------------------------
// Hosting badges
// ---------------------------------------------------------------------------

export type HostingBadge = {
  /** Canonical key, e.g. `public_cloud`. */
  key: string;
  /** Compact pill text the portal shows (portal `hostingShort`), e.g. `public`. */
  short: string;
  /** Full, human label for the `title` / `aria-label`. */
  label: string;
  /** True for the row's `preferredHostingType` (portal `is-active` pill). */
  preferred: boolean;
};

/** Full labels for the hosting classes (portal `HOSTING_TYPE_LABELS`). */
const HOSTING_FULL_LABELS: Record<string, string> = {
  public_cloud: 'Public cloud',
  managed_cloud: 'Managed cloud',
  private_cloud: 'Private cloud',
  edge_processing: 'Edge',
};

/**
 * One badge per hosting class a model advertises, in the order the region
 * returned them (the portal renders the same array order). Unknown keys are
 * dropped; a row with no hosting metadata renders no badges rather than
 * inventing one.
 *
 * The pill text is the portal's `hostingShort` (full word, not an initial):
 * `public` and `private` share the letter `P`, so initials would be ambiguous.
 */
export function hostingBadges(
  types: readonly string[] | null | undefined,
  opts?: { preferred?: string | null },
): HostingBadge[] {
  const list = Array.isArray(types) ? types.map((t) => String(t)) : [];
  const unique = [...new Set(list)].filter((key) => key in HOSTING_FULL_LABELS);
  return unique.map((key) => {
    const short = HOSTING_BADGE_LABELS[key as keyof typeof HOSTING_BADGE_LABELS] || key;
    const label = HOSTING_FULL_LABELS[key];
    const preferred = Boolean(opts?.preferred && opts.preferred === key);
    return {
      key,
      short,
      label: preferred ? `${label} (preferred)` : label,
      preferred,
    };
  });
}

// ---------------------------------------------------------------------------
// Pricing tooltip
// ---------------------------------------------------------------------------

export type PricingTooltip = {
  /** One line per price kind, in In → Out → Cached order. */
  lines: string[];
  /** Compact chips the tooltip is attached to; empty when nothing is priced. */
  hasUsd: boolean;
  hasCredits: boolean;
};

function usdPerMText(value: number | null | undefined, currency: string | null): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value === 0) return 'free';
  // Portal `formatUsd`: 2 decimals at/above $1, more precision below, so a
  // $15/M output rate reads `$15.00/M` (not the compact chip's `$15.0/M`).
  const body =
    value >= 1 ? `$${value.toFixed(2)}` : value >= 0.01 ? `$${value.toFixed(3)}` : `$${value.toFixed(4)}`;
  const unit = currency && currency !== 'USD' ? `${currency} ` : '';
  return `${unit}${body}/M tokens`;
}

/**
 * Tooltip lines for the pricing badge: input, output and cached token prices.
 *
 * Cached-price provenance is stated, because the region exposes no cached-token
 * catalog row: a value derived from the input rate is labelled as an estimate
 * (cache reads bill at 10% of the input rate) instead of being presented as a
 * quoted price. When no USD price is known the platform credit rate is shown
 * instead, and when neither exists the caller renders no tooltip.
 */
export function pricingTooltip(
  model: Pick<
    PickerModel,
    | 'inputPerM'
    | 'outputPerM'
    | 'cachedPerM'
    | 'cachedPerMSource'
    | 'costCurrency'
    | 'chatPriceCreditsPerMillion'
  >,
): PricingTooltip {
  const currency = model.costCurrency || 'USD';
  const lines: string[] = [];
  const inText = usdPerMText(model.inputPerM, currency);
  const outText = usdPerMText(model.outputPerM, currency);
  const cachedText = usdPerMText(model.cachedPerM, currency);
  if (inText) lines.push(`In: ${inText}`);
  if (outText) lines.push(`Out: ${outText}`);
  if (cachedText) {
    const derived = model.cachedPerMSource === 'derived';
    lines.push(`Cached: ${cachedText}${derived ? ' (est. 10% of input)' : ''}`);
  }
  const credits = model.chatPriceCreditsPerMillion;
  const creditsText = formatCreditsPerM(credits);
  if (creditsText) lines.push(`Billing: ${creditsText}`);
  return {
    lines,
    hasUsd: Boolean(inText || outText || cachedText),
    hasCredits: Boolean(creditsText),
  };
}

/** Newline-joined tooltip body, or null when nothing is priced. */
export function pricingTooltipText(
  model: Parameters<typeof pricingTooltip>[0],
): string | null {
  const { lines } = pricingTooltip(model);
  return lines.length ? lines.join('\n') : null;
}
