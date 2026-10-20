/**
 * One registry for every client-executed tool a host offers, pinned or
 * discoverable.
 *
 * Two rails share this registry so a host registers a tool once:
 *
 * - **pinned** (default): the full schema joins `browserFunctionCalls` on every
 *   send, so the model always sees it. This is what `registerTool` always did.
 * - **discoverable**: only a compact `clientToolIndex` entry (name + one line +
 *   access) rides along; the model finds it through `search_anx_commands` and the
 *   SDK answers `bind_client_tool` with the full schema for that assemble loop
 *   only. Nothing about a discoverable tool is persisted server-side.
 *
 * The registry is additive: a host that only calls the legacy `registerTool` /
 * `tools` keeps exactly the old behaviour (its tools are `pinned`).
 *
 * @module tools/client-tool-registry
 */

import type { ChatClientToolAccess, ChatToolDescriptor } from '../types.js';

/** Compact index entry sent with a message so the model can discover a tool. */
export type ClientToolIndexEntry = {
  name: string;
  description: string;
  /** Defaults to `write`. */
  access: ChatClientToolAccess;
  /** Optional pack hint (portal page, storage, …) so discovery can group rows. */
  pack?: string;
  /**
   * Concept slugs the host linked to this tool (optional). Matched against the
   * conversation's pinned concepts during discovery; normalised + de-duped
   * server-side. Discoverable-only.
   */
  conceptSlugs?: string[];
};

/** A tool the host can execute when the model calls it. */
export type ClientToolRegistration = {
  descriptor: ChatToolDescriptor;
  handler: (args: unknown) => Promise<unknown> | unknown;
};

/** Schema shape `browserFunctionCalls` expects (pinned rail). */
export type ClientToolFunctionSchema = {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
};

/** The `anx.*`-free default name guard: a blank name is never registered. */
function normalizeName(name: unknown): string {
  return typeof name === 'string' ? name.trim() : '';
}

/** Default access for a tool that does not declare one: `write`. */
export function clientToolAccessOf(descriptor: {
  access?: ChatClientToolAccess;
} | null | undefined): ChatClientToolAccess {
  return descriptor?.access === 'read' ? 'read' : 'write';
}

/** Default availability: `pinned` (the legacy rail). */
export function clientToolAvailabilityOf(descriptor: {
  availability?: 'pinned' | 'discoverable';
} | null | undefined): 'pinned' | 'discoverable' {
  return descriptor?.availability === 'discoverable' ? 'discoverable' : 'pinned';
}

/**
 * Trim + de-dupe concept slugs, dropping anything that is not a non-empty
 * string. Returns undefined when nothing valid remains, so an empty list never
 * rides the index payload (mirrors the server-side normalisation).
 */
export function normalizeConceptSlugs(
  raw: unknown,
): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== 'string') continue;
    const slug = value.trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out.length ? out : undefined;
}

export class ClientToolRegistry {
  private readonly tools = new Map<string, ClientToolRegistration>();

  /** Register (or replace) a tool by name. A blank name is ignored. */
  register(input: {
    name?: string;
    description?: string;
    parameters?: Record<string, unknown>;
    access?: ChatClientToolAccess;
    availability?: 'pinned' | 'discoverable';
    conceptSlugs?: string[];
    handler: (args: unknown) => Promise<unknown> | unknown;
  }): void {
    const name = normalizeName(input?.name);
    if (!name || typeof input.handler !== 'function') return;
    const conceptSlugs = normalizeConceptSlugs(input.conceptSlugs);
    const descriptor: ChatToolDescriptor = {
      name,
      ...(input.description ? { description: input.description } : {}),
      ...(input.parameters ? { parameters: input.parameters } : {}),
      ...(input.access ? { access: input.access } : {}),
      ...(input.availability ? { availability: input.availability } : {}),
      ...(conceptSlugs ? { conceptSlugs } : {}),
    };
    this.tools.set(name, { descriptor, handler: input.handler });
  }

  /** Register from an existing `ChatToolDescriptor` + handler (legacy shape). */
  registerDescriptor(
    descriptor: ChatToolDescriptor,
    handler: (args: unknown) => Promise<unknown> | unknown,
  ): void {
    const name = normalizeName(descriptor?.name);
    if (!name || typeof handler !== 'function') return;
    const conceptSlugs = normalizeConceptSlugs(descriptor?.conceptSlugs);
    this.tools.set(name, {
      descriptor: {
        ...descriptor,
        name,
        ...(conceptSlugs ? { conceptSlugs } : { conceptSlugs: undefined }),
      },
      handler,
    });
  }

  has(name: string): boolean {
    return this.tools.has(normalizeName(name));
  }

  get(name: string): ClientToolRegistration | undefined {
    return this.tools.get(normalizeName(name));
  }

  get size(): number {
    return this.tools.size;
  }

  /** The underlying map, so the existing resolution helper keeps working. */
  map(): Map<string, ClientToolRegistration> {
    return this.tools;
  }

  entries(): Array<[string, ClientToolRegistration]> {
    return [...this.tools.entries()];
  }

  /** Pinned tools (and pinned only), in the `browserFunctionCalls` shape. */
  pinnedSchemas(): ClientToolFunctionSchema[] {
    const out: ClientToolFunctionSchema[] = [];
    for (const { descriptor } of this.tools.values()) {
      if (clientToolAvailabilityOf(descriptor) !== 'pinned') continue;
      out.push({
        name: descriptor.name,
        description: descriptor.description || `Client tool ${descriptor.name}`,
        parameters: {
          type: 'object',
          properties: {},
          ...(descriptor.parameters || {}),
        } as ClientToolFunctionSchema['parameters'],
      });
    }
    return out;
  }

  /** Discoverable tools as the compact index sent with a message. */
  indexEntries(): ClientToolIndexEntry[] {
    const out: ClientToolIndexEntry[] = [];
    for (const { descriptor } of this.tools.values()) {
      if (clientToolAvailabilityOf(descriptor) !== 'discoverable') continue;
      const conceptSlugs = normalizeConceptSlugs(descriptor.conceptSlugs);
      out.push({
        name: descriptor.name,
        description: descriptor.description || `Client tool ${descriptor.name}`,
        access: clientToolAccessOf(descriptor),
        ...(conceptSlugs ? { conceptSlugs } : {}),
      });
    }
    return out;
  }

  /**
   * Full schema for one tool (used to answer a `bind_client_tool` pause), or
   * null when the name is unknown / not registered.
   */
  schemaFor(name: string): ClientToolFunctionSchema | null {
    const entry = this.tools.get(normalizeName(name));
    if (!entry) return null;
    return {
      name: entry.descriptor.name,
      description: entry.descriptor.description || `Client tool ${entry.descriptor.name}`,
      parameters: {
        type: 'object',
        properties: {},
        ...(entry.descriptor.parameters || {}),
      } as ClientToolFunctionSchema['parameters'],
    };
  }

  /** `bind_client_tool` result the server expects: `{ extraFunctionSchemas: [...] }`. */
  bindResult(name: string): { extraFunctionSchemas: ClientToolFunctionSchema[] } | null {
    const schema = this.schemaFor(name);
    return schema ? { extraFunctionSchemas: [schema] } : null;
  }
}

/**
 * Does this client-tool-request name match the index (dotted or wire form)?
 * Mirrors the server `isIndexedClientTool` so a bind resolves the same name.
 */
export function isIndexedClientTool(
  name: string,
  index: readonly ClientToolIndexEntry[] | undefined | null,
): boolean {
  const n = normalizeName(name);
  if (!n || !index?.length) return false;
  const wire = n.replace(/\./g, '_');
  return index.some(
    (e) => e?.name === n || e?.name === wire || e?.name?.replace(/\./g, '_') === wire,
  );
}

/**
 * Stable-ish content hash of an index, used purely as a client-side cache key in
 * the same conversation. It must NOT be sent as the server's `clientToolIndexHash`
 * — the server computes and returns its own hash from the index it stored, so the
 * two sides can never disagree. This one only lets the SDK recognise "the host
 * did not change the registry" and remember whether it already sent the index
 * this conversation.
 */
export function localClientToolIndexFingerprint(
  index: readonly ClientToolIndexEntry[] | undefined | null,
): string | null {
  if (!index?.length) return null;
  const canonical = [...index]
    .filter((e) => e?.name)
    .map((e) => {
      const slugs = normalizeConceptSlugs(e.conceptSlugs);
      return `${e.name}\u0001${e.description ?? ''}\u0001${e.access ?? 'write'}\u0001${e.pack ?? ''}\u0001${
        slugs ? [...slugs].sort().join(',') : ''
      }`;
    })
    .sort();
  if (!canonical.length) return null;
  // djb2 — cheap, deterministic, and only needs to be collision-free enough to
  // detect an unchanged registry within one conversation.
  let h = 5381;
  const joined = canonical.join('\u0002');
  for (let i = 0; i < joined.length; i += 1) {
    h = ((h << 5) + h + joined.charCodeAt(i)) | 0;
  }
  return `f${(h >>> 0).toString(16)}`;
}
