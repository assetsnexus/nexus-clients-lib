import { isActiveSubAgentStripStatus, type MessageDelivery } from '@nexus/chat-core';

/** Library defaults used when a host token is missing or transparent. */
export const SOLID_SURFACE_FALLBACK = '#1a1d27';
export const SOLID_TEXT_FALLBACK = '#e8eaef';
export const SOLID_BORDER_FALLBACK = '#2a2f3d';

const STEER_TEXT_MAX = 2000;

export const SUB_AGENT_DELIVERIES: Array<{ value: MessageDelivery; label: string; hint: string }> = [
  { value: 'queue', label: 'Queue', hint: 'Deliver after the current step' },
  { value: 'interrupt', label: 'Interrupt', hint: 'Stop current work and inject now' },
  { value: 'steer', label: 'Steer', hint: 'Soft guidance without a hard interrupt' },
];

export type SubAgentControlRun = {
  status?: string | null;
  runId?: string | null;
  linkedConversationId?: string | null;
};

export type SubAgentRunControls = {
  pause: boolean;
  resume: boolean;
  cancel: boolean;
  /** Open the linked child conversation in this chat. */
  openChat: boolean;
  /** Send a short message into the live run. */
  steer: boolean;
};

/**
 * The details popup is shown only after the chip is opened and there is
 * at least one run to show. A closed chip, or a chip with no runs, stays shut.
 */
export function isSubAgentDetailsOpen(open: boolean, runCount: number): boolean {
  return open === true && runCount > 0;
}

export function subAgentRunControls(
  run: SubAgentControlRun,
  opts: { hasClient: boolean },
): SubAgentRunControls {
  const status = String(run.status || '').toLowerCase();
  const active = isActiveSubAgentStripStatus(status);
  const paused = status === 'paused';
  const awaiting = status === 'awaiting_approval';
  const canMutate = opts.hasClient && Boolean(run.runId && String(run.runId).trim());
  const linked = Boolean(run.linkedConversationId && String(run.linkedConversationId).trim());
  return {
    pause: canMutate && active && !paused && !awaiting,
    resume: canMutate && paused,
    cancel: canMutate && active,
    openChat: linked || canMutate,
    steer: canMutate && active,
  };
}

export type SteerTextResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'empty' | 'too_long' };

export function normalizeSteerText(text: string, max = STEER_TEXT_MAX): SteerTextResult {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  if (trimmed.length > max) return { ok: false, reason: 'too_long' };
  return { ok: true, text: trimmed };
}

type Rgba = { r: number; g: number; b: number; a: number };

export type OverlaySurfacePaint = {
  backgroundColor: string;
  color: string;
  borderColor: string;
};

function clampByte(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(255, Math.round(n)));
}

function formatRgb(c: Rgba): string {
  return `rgb(${clampByte(c.r)}, ${clampByte(c.g)}, ${clampByte(c.b)})`;
}

function hexByte(hex: string): number {
  return Number.parseInt(hex, 16);
}

/** Parse a computed CSS color. Unresolved tokens return null. */
export function parseCssColor(input: string | null | undefined): Rgba | null {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const hex = raw.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const h = hex[1]!;
    if (h.length === 3 || h.length === 4) {
      const r = hexByte(h[0]! + h[0]);
      const g = hexByte(h[1]! + h[1]);
      const b = hexByte(h[2]! + h[2]);
      const a = h.length === 4 ? hexByte(h[3]! + h[3]) / 255 : 1;
      return { r, g, b, a };
    }
    if (h.length === 6 || h.length === 8) {
      return {
        r: hexByte(h.slice(0, 2)),
        g: hexByte(h.slice(2, 4)),
        b: hexByte(h.slice(4, 6)),
        a: h.length === 8 ? hexByte(h.slice(6, 8)) / 255 : 1,
      };
    }
    return null;
  }
  const rgb = raw.match(
    /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*(?:,\s*([0-9.]+)\s*)?\)$/,
  );
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: rgb[4] == null ? 1 : Number(rgb[4]),
    };
  }
  return null;
}

function luminance(c: Rgba): number {
  const channel = (v: number) => {
    const s = clampByte(v) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

function composite(src: Rgba, dst: Rgba): Rgba {
  const a = src.a + dst.a * (1 - src.a);
  if (a <= 0) return { r: dst.r, g: dst.g, b: dst.b, a: 1 };
  const ch = (s: number, d: number) => (s * src.a + d * dst.a * (1 - src.a)) / a;
  return { r: ch(src.r, dst.r), g: ch(src.g, dst.g), b: ch(src.b, dst.b), a: 1 };
}

function mix(a: Rgba, b: Rgba, t: number): Rgba {
  return {
    r: a.r * t + b.r * (1 - t),
    g: a.g * t + b.g * (1 - t),
    b: a.b * t + b.b * (1 - t),
    a: 1,
  };
}

/** Light plate for dark text, dark plate for light text. */
function contrastingPlate(text: Rgba): Rgba {
  return luminance(text) < 0.45
    ? { r: 255, g: 255, b: 255, a: 1 }
    : { r: 26, g: 29, b: 39, a: 1 };
}

/**
 * Paint for the details popup.
 * An opaque surface token is kept. A transparent or glassy token is
 * composited onto a solid plate that contrasts with the text token.
 */
export function overlaySurfacePaint(input: {
  surface?: string | null;
  text?: string | null;
  border?: string | null;
}): OverlaySurfacePaint {
  const text = parseCssColor(input.text) ?? parseCssColor(SOLID_TEXT_FALLBACK)!;
  const surface = parseCssColor(input.surface);
  const border = parseCssColor(input.border);
  const plate = surface && surface.a >= 0.92 ? { ...surface, a: 1 } : contrastingPlate(text);
  const background = surface ? composite(surface, plate) : plate;
  const borderColor =
    border && border.a >= 0.2 ? composite(border, background) : mix({ ...text, a: 1 }, background, 0.35);
  return {
    backgroundColor: formatRgb(background),
    color: formatRgb({ ...text, a: 1 }),
    borderColor: formatRgb(borderColor),
  };
}

/** Read resolved chat tokens from a host element. Safe to call in the browser only. */
export function readChatTokenColors(host: HTMLElement): {
  surface: string;
  text: string;
  border: string;
} {
  const doc = host.ownerDocument;
  const probe = doc.createElement('div');
  probe.setAttribute('data-nexus-paint-probe', '');
  probe.style.cssText = [
    'position:absolute',
    'width:0',
    'height:0',
    'overflow:hidden',
    'visibility:hidden',
    'pointer-events:none',
    'background-color:var(--nx-chat-surface, #1a1d27)',
    'color:var(--nx-chat-text, #e8eaef)',
    'border-top:1px solid var(--nx-chat-border, #2a2f3d)',
  ].join(';');
  host.appendChild(probe);
  const view = doc.defaultView;
  const cs = view ? view.getComputedStyle(probe) : null;
  const colors = {
    surface: cs?.backgroundColor || SOLID_SURFACE_FALLBACK,
    text: cs?.color || SOLID_TEXT_FALLBACK,
    border: cs?.borderTopColor || SOLID_BORDER_FALLBACK,
  };
  probe.remove();
  return colors;
}
