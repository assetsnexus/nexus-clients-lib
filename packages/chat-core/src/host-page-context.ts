/**
 * Structured context the host app sets on a chat turn.
 *
 * Optional. `projectId` is one field an app may set; it is not required.
 * A later context brain can write these same fields. An empty project id
 * is treated as no page context.
 */
export type HostPageContext = {
  projectId?: string;
  projectName?: string;
};

export function normalizeHostPageContext(
  value: HostPageContext | null | undefined,
): HostPageContext | undefined {
  if (!value) return undefined;
  const projectId = typeof value.projectId === 'string' ? value.projectId.trim() : '';
  const projectName = typeof value.projectName === 'string' ? value.projectName.trim() : '';
  if (!projectId) return undefined;
  return projectName ? { projectId, projectName } : { projectId };
}

/**
 * Plan Part C11 — native app route / screen context.
 *
 * Mirrors the portal `browserContext` (`anx.portal.browser.*`) pattern for the
 * app: privacy-safe, opt-in, and structure-only. It is injected as a system
 * prompt block by inference (see `injectedSystemPrompts` / `browserContext`).
 *
 * NEVER include: field values, credentials, message bodies, tokens, or file
 * contents. Only the route, screen name, and coarse entity identity.
 */
export type AppRouteContext = {
  /** Navigation route, e.g. `/wallet/123`. */
  route: string;
  /** Human screen name, e.g. `Wallet`. */
  screen?: string;
  /** Route params reduced to safe, structure-only identity. */
  params?: Record<string, string | number | boolean | null>;
  /** Coarse entity identity for the focused record (id + type + name). */
  entityRef?: {
    type: string;
    id?: string | null;
    name?: string | null;
  } | null;
  /** Platform, for wording only. */
  platform?: 'ios' | 'android' | 'web';
  /** ISO timestamp the context was captured. */
  capturedAt?: string;
};

const MAX_PARAM_KEYS = 12;

function safeParamValue(value: unknown): string | number | boolean | null | undefined {
  if (value == null) return null;
  if (typeof value === 'string') {
    // Cap length; never carry long free text (could be a body).
    return value.length > 120 ? `${value.slice(0, 117)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return undefined;
}

/**
 * Normalize an opted-in app route context. Returns undefined when there is no
 * usable route, so callers never send an empty block.
 */
export function normalizeAppRouteContext(
  value: AppRouteContext | null | undefined,
): AppRouteContext | undefined {
  if (!value) return undefined;
  const route = typeof value.route === 'string' ? value.route.trim() : '';
  if (!route) return undefined;

  const out: AppRouteContext = { route };
  if (typeof value.screen === 'string' && value.screen.trim()) out.screen = value.screen.trim();
  if (value.platform === 'ios' || value.platform === 'android' || value.platform === 'web') {
    out.platform = value.platform;
  }
  if (typeof value.capturedAt === 'string' && value.capturedAt) out.capturedAt = value.capturedAt;

  if (value.params && typeof value.params === 'object') {
    const params: Record<string, string | number | boolean | null> = {};
    for (const key of Object.keys(value.params).slice(0, MAX_PARAM_KEYS)) {
      // Drop obviously sensitive keys outright.
      if (/token|secret|password|otp|pin|auth|key|body|content|text/i.test(key)) continue;
      const safe = safeParamValue((value.params as Record<string, unknown>)[key]);
      if (safe !== undefined) params[key] = safe;
    }
    if (Object.keys(params).length) out.params = params;
  }

  if (value.entityRef && typeof value.entityRef === 'object') {
    const type = typeof value.entityRef.type === 'string' ? value.entityRef.type.trim() : '';
    if (type) {
      out.entityRef = {
        type,
        id: value.entityRef.id ? String(value.entityRef.id) : null,
        name: value.entityRef.name ? String(value.entityRef.name) : null,
      };
    }
  }

  return out;
}

/**
 * Wrap a normalized route context as the `browserContext` payload the region /
 * inference already understands, tagged so the two surfaces are distinguishable.
 */
export function appRouteToBrowserContext(
  value: AppRouteContext | null | undefined,
): Record<string, unknown> | undefined {
  const ctx = normalizeAppRouteContext(value);
  if (!ctx) return undefined;
  return {
    source: 'app_route',
    route: ctx.route,
    screen: ctx.screen ?? null,
    params: ctx.params ?? {},
    entityRef: ctx.entityRef ?? null,
    platform: ctx.platform ?? null,
    capturedAt: ctx.capturedAt ?? null,
    /** Mirrors the portal card: form values are never included. */
    valuesIncluded: false,
  };
}

