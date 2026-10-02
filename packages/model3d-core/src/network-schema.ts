/**
 * Composition networks use the same two topologies as blueprint buses
 * (`point_to_point` | `shared_multidrop`) and the same media families as
 * cluster cables (electric, ethernet, water, wifi).
 * Endpoints are interface ids. They are not shape ids and not script-chunk ids.
 */

export const NETWORK_KINDS = ['point_to_point', 'shared_multidrop'] as const;
export type NetworkKind = (typeof NETWORK_KINDS)[number];

export const INTERFACE_SIDES = ['male', 'female', 'terminal'] as const;
export type InterfaceSide = (typeof INTERFACE_SIDES)[number];

export type NetworkMedium = 'electric' | 'ethernet' | 'water' | 'wifi';

export const NETWORK_COLORS: Record<NetworkMedium, string> = {
  water: '#1D7A9C',
  ethernet: '#7C3AED',
  wifi: '#0EA5E9',
  electric: '#F59E0B',
};

export interface CompositionEdge {
  id: string;
  fromInterfaceId: string;
  toInterfaceId: string;
}

export interface CompositionNetwork {
  id: string;
  name: string;
  /** Medium family. Radio aliases collapse to `wifi`. */
  type: NetworkMedium;
  kind: NetworkKind;
  edges: CompositionEdge[];
}

export function interfaceSide(raw: unknown): InterfaceSide | null {
  const side = String(raw || '');
  return (INTERFACE_SIDES as readonly string[]).includes(side) ? (side as InterfaceSide) : null;
}

/** `bus` is the script alias of blueprint `shared_multidrop`. */
export function networkKind(raw: unknown): NetworkKind | null {
  const kind = String(raw || '');
  if (kind === 'bus' || kind === 'shared_multidrop') return 'shared_multidrop';
  if (kind === 'point_to_point' || kind === 'point-to-point') return 'point_to_point';
  return null;
}

/**
 * Same families as cluster `networkTypeFromInterface`:
 * water, ethernet (fiber / serial / RS485 / data-bus), wifi (radio), else electric.
 */
export function networkMedium(raw: unknown): NetworkMedium {
  const type = String(raw || '').toLowerCase();
  if (type.includes('water')) return 'water';
  if (
    type.includes('ethernet')
    || type.includes('fiber')
    || type.includes('serial')
    || type.includes('rs485')
    || type.includes('data-bus')
    || type.includes('modbus')
  ) return 'ethernet';
  if (
    type.includes('wifi')
    || type.includes('ble')
    || type.includes('bluetooth')
    || type.includes('lora')
    || type.includes('nfc')
    || type.includes('radio')
    || type.includes('wireless')
  ) return 'wifi';
  return 'electric';
}

export function isRadioMedium(medium: NetworkMedium): boolean {
  return medium === 'wifi';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readEdge(raw: unknown, index: number): CompositionEdge | null {
  const row = asRecord(raw);
  if (!row) return null;
  const fromInterfaceId = typeof row.fromInterfaceId === 'string' ? row.fromInterfaceId.trim() : '';
  const toInterfaceId = typeof row.toInterfaceId === 'string' ? row.toInterfaceId.trim() : '';
  if (!fromInterfaceId || !toInterfaceId) return null;
  const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : `edge_${index}`;
  return { id, fromInterfaceId, toInterfaceId };
}

/** Keep stored networks. Does not invent edges or repair an illegal graph. */
export function normalizeNetworks(raw: unknown): CompositionNetwork[] {
  if (!Array.isArray(raw)) return [];
  const out: CompositionNetwork[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const row = asRecord(item);
    if (!row) continue;
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const kind = networkKind(row.kind);
    if (!id || !kind || seen.has(id)) continue;
    seen.add(id);
    const edges: CompositionEdge[] = [];
    const edgeIds = new Set<string>();
    const list = Array.isArray(row.edges) ? row.edges : [];
    for (let i = 0; i < list.length; i += 1) {
      const edge = readEdge(list[i], i);
      if (!edge || edgeIds.has(edge.id)) continue;
      edgeIds.add(edge.id);
      edges.push(edge);
    }
    out.push({
      id,
      name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : id,
      type: networkMedium(row.type),
      kind,
      edges,
    });
  }
  return out;
}
