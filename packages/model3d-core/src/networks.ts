/**
 * Interface marks and network edges for a composition.
 * A mesh is an interface only after `markInterface`.
 * A bus (`shared_multidrop`) is a tree grown one edge at a time.
 * A point-to-point network is a single edge. Lines run between those interfaces.
 */

import { worldTranslationMm } from './building';
import {
  type CompositionEdge,
  type CompositionNetwork,
  type InterfaceSide,
  type NetworkKind,
  type NetworkMedium,
  NETWORK_COLORS,
  interfaceSide,
  isRadioMedium,
  networkKind,
  networkMedium,
} from './network-schema';
import {
  type InterfaceMarker,
  type VisualModel,
  findShape,
  normalizeModel,
} from './schema';
import { type Vec3 } from './units';

export interface MarkInterfaceOp {
  shapeId?: string;
  interfaceId?: string;
  side?: unknown;
  medium?: unknown;
  type?: unknown;
  label?: string;
}

export interface AddNetworkOp {
  id?: string;
  networkId?: string;
  name?: string;
  type?: unknown;
  medium?: unknown;
  kind?: unknown;
}

export interface AddEdgeOp {
  id?: string;
  networkId?: string;
  fromInterfaceId?: string;
  toInterfaceId?: string;
}

export interface RouteSegment {
  networkId: string;
  edgeId: string;
  kind: NetworkKind;
  medium: NetworkMedium;
  color: string;
  fromInterfaceId: string;
  toInterfaceId: string;
  fromShapeId: string;
  toShapeId: string;
  fromMm: Vec3;
  toMm: Vec3;
}

interface BoundInterface {
  interfaceId: string;
  shapeId: string;
  side: InterfaceSide;
  medium: NetworkMedium;
}

function bounds(model: VisualModel): Map<string, BoundInterface> {
  const out = new Map<string, BoundInterface>();
  for (const marker of model.interfaceMarkers || []) {
    if (!marker?.interfaceId || !marker.shapeId) continue;
    if (!findShape(model, marker.shapeId)) continue;
    out.set(marker.interfaceId, {
      interfaceId: marker.interfaceId,
      shapeId: marker.shapeId,
      side: marker.side || 'terminal',
      medium: networkMedium(marker.medium || 'electric'),
    });
  }
  return out;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function findRoot(parent: Map<string, string>, id: string): string {
  let cursor = id;
  while (parent.get(cursor) !== cursor) {
    const next = parent.get(cursor);
    if (!next) break;
    cursor = next;
  }
  let walk = id;
  while (walk !== cursor) {
    const next = parent.get(walk);
    parent.set(walk, cursor);
    if (!next || next === walk) break;
    walk = next;
  }
  return cursor;
}

/** Interface ids already joined by edges, and whether A and B share a component. */
function treeState(edges: CompositionEdge[], a: string, b: string): { occupied: boolean; same: boolean; aIn: boolean; bIn: boolean } {
  const parent = new Map<string, string>();
  const touch = (id: string) => {
    if (!parent.has(id)) parent.set(id, id);
  };
  for (const edge of edges) {
    touch(edge.fromInterfaceId);
    touch(edge.toInterfaceId);
    const ra = findRoot(parent, edge.fromInterfaceId);
    const rb = findRoot(parent, edge.toInterfaceId);
    if (ra !== rb) parent.set(ra, rb);
  }
  return {
    occupied: parent.size > 0,
    aIn: parent.has(a),
    bIn: parent.has(b),
    same: parent.has(a) && parent.has(b) && findRoot(parent, a) === findRoot(parent, b),
  };
}

function sidesCompatible(a: InterfaceSide, b: InterfaceSide): boolean {
  if (a === 'terminal' || b === 'terminal') return true;
  return a !== b;
}

/**
 * Why this edge cannot be added. Null means the existing rules allow it.
 * Checked against interfaces already marked on shapes, not against chunk ids.
 */
export function rejectEdge(model: VisualModel, network: CompositionNetwork, fromInterfaceId: string, toInterfaceId: string): string | null {
  const fromId = fromInterfaceId.trim();
  const toId = toInterfaceId.trim();
  if (!fromId || !toId) return 'edge is missing an interface endpoint';
  if (fromId === toId) return `edge joins interface "${fromId}" to itself`;
  const known = bounds(model);
  const from = known.get(fromId);
  const to = known.get(toId);
  if (!from) return `missing interface "${fromId}"`;
  if (!to) return `missing interface "${toId}"`;
  if (from.medium !== to.medium) return `illegal pair: "${fromId}" is ${from.medium} and "${toId}" is ${to.medium}`;
  if (from.medium !== network.type) {
    return `illegal pair: "${fromId}" is ${from.medium} and network "${network.id}" is ${network.type}`;
  }
  if (!sidesCompatible(from.side, to.side)) {
    return `wrong side: "${fromId}" is ${from.side} and "${toId}" is ${to.side}`;
  }
  if (network.edges.some((edge) => pairKey(edge.fromInterfaceId, edge.toInterfaceId) === pairKey(fromId, toId))) {
    return `duplicate edge between "${fromId}" and "${toId}"`;
  }
  if (network.kind === 'point_to_point') {
    if (network.edges.length) return `point-to-point network "${network.id}" already has an edge`;
    return null;
  }
  if (isRadioMedium(network.type)) {
    return `bus "${network.id}" is a radio network and has no cable tree`;
  }
  const state = treeState(network.edges, fromId, toId);
  if (!state.occupied) return null;
  if (state.same) return `edge cycles bus "${network.id}"`;
  if (!state.aIn || !state.bIn) {
    if (state.aIn !== state.bIn) return null;
    const loose = !state.aIn ? fromId : toId;
    return `disconnected endpoint "${loose}" is not on bus "${network.id}"`;
  }
  return `disconnected endpoint on bus "${network.id}"`;
}

export function applyMarkInterface(model: VisualModel, op: MarkInterfaceOp): string | null {
  const shapeId = String(op.shapeId || '').trim();
  const interfaceId = String(op.interfaceId || '').trim();
  if (!interfaceId) return 'interface id is required';
  if (!shapeId) return `interface "${interfaceId}" requires a shape id`;
  const shape = findShape(model, shapeId);
  if (!shape) return `interface "${interfaceId}" requires shape "${shapeId}"`;
  const side = interfaceSide(op.side == null || op.side === '' ? 'terminal' : op.side);
  if (!side) return `interface "${interfaceId}" side must be male, female, or terminal`;
  const medium = networkMedium(op.medium ?? op.type ?? 'electric');
  const taken = (model.interfaceMarkers || []).find((marker) => marker.interfaceId === interfaceId && marker.shapeId !== shapeId);
  if (taken) return `interface "${interfaceId}" is already on shape "${taken.shapeId}"`;
  if (!shape.linkedInterfaceIds.includes(interfaceId)) shape.linkedInterfaceIds.push(interfaceId);
  const label = typeof op.label === 'string' ? op.label : interfaceId;
  const next: InterfaceMarker = {
    interfaceId,
    shapeId,
    partId: null,
    position: { x: 0, y: 0.5, z: 0.5 },
    label,
    side,
    medium,
  };
  const index = model.interfaceMarkers.findIndex((marker) => marker.interfaceId === interfaceId);
  if (index >= 0) model.interfaceMarkers.splice(index, 1, next);
  else model.interfaceMarkers.push(next);
  return null;
}

export function applyAddNetwork(model: VisualModel, op: AddNetworkOp): string | null {
  const id = String(op.id || op.networkId || '').trim();
  if (!id) return 'network id is required';
  const kind = networkKind(op.kind);
  if (!kind) return `network "${id}" kind must be point_to_point or bus`;
  if (model.networks.some((network) => network.id === id)) return `duplicate network "${id}"`;
  const type = networkMedium(op.medium ?? op.type ?? 'electric');
  if (kind === 'shared_multidrop' && isRadioMedium(type)) {
    return `bus "${id}" is a radio network and has no cable tree`;
  }
  model.networks.push({
    id,
    name: typeof op.name === 'string' && op.name.trim() ? op.name.trim() : id,
    type,
    kind,
    edges: [],
  });
  return null;
}

export function applyAddEdge(model: VisualModel, op: AddEdgeOp): string | null {
  const networkId = String(op.networkId || '').trim();
  const network = model.networks.find((row) => row.id === networkId);
  if (!network) return `unknown network "${networkId || ''}"`;
  const fromInterfaceId = String(op.fromInterfaceId || '').trim();
  const toInterfaceId = String(op.toInterfaceId || '').trim();
  const reason = rejectEdge(model, network, fromInterfaceId, toInterfaceId);
  if (reason) return reason;
  const id = String(op.id || '').trim() || `edge_${network.edges.length}`;
  if (network.edges.some((edge) => edge.id === id)) return `duplicate edge "${id}"`;
  network.edges.push({ id, fromInterfaceId, toInterfaceId });
  return null;
}

function markerFor(model: VisualModel, interfaceId: string): InterfaceMarker | undefined {
  return model.interfaceMarkers.find((marker) => marker.interfaceId === interfaceId && marker.shapeId);
}

/**
 * One segment per accepted edge. Both ends are the interface shapes.
 * A bus contributes its tree edges, not a free polyline and not chunk order.
 */
export function networkRouteSegments(raw: VisualModel): RouteSegment[] {
  const model = normalizeModel(raw);
  const out: RouteSegment[] = [];
  for (const network of model.networks || []) {
    for (const edge of network.edges || []) {
      const from = markerFor(model, edge.fromInterfaceId);
      const to = markerFor(model, edge.toInterfaceId);
      if (!from?.shapeId || !to?.shapeId) continue;
      const fromShape = findShape(model, from.shapeId);
      const toShape = findShape(model, to.shapeId);
      if (!fromShape || !toShape) continue;
      out.push({
        networkId: network.id,
        edgeId: edge.id,
        kind: network.kind,
        medium: network.type,
        color: NETWORK_COLORS[network.type] || NETWORK_COLORS.electric,
        fromInterfaceId: edge.fromInterfaceId,
        toInterfaceId: edge.toInterfaceId,
        fromShapeId: from.shapeId,
        toShapeId: to.shapeId,
        fromMm: worldTranslationMm(model, fromShape),
        toMm: worldTranslationMm(model, toShape),
      });
    }
  }
  return out;
}

/** Interface ids along the unique tree path, including both ends. */
export function routeBetween(model: VisualModel, networkId: string, fromInterfaceId: string, toInterfaceId: string): string[] | null {
  const network = (model.networks || []).find((row) => row.id === networkId);
  if (!network) return null;
  if (fromInterfaceId === toInterfaceId) return [fromInterfaceId];
  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    const list = adj.get(a) || [];
    list.push(b);
    adj.set(a, list);
  };
  for (const edge of network.edges) {
    link(edge.fromInterfaceId, edge.toInterfaceId);
    link(edge.toInterfaceId, edge.fromInterfaceId);
  }
  const prev = new Map<string, string | null>([[fromInterfaceId, null]]);
  const queue = [fromInterfaceId];
  while (queue.length) {
    const current = queue.shift()!;
    if (current === toInterfaceId) break;
    for (const next of adj.get(current) || []) {
      if (prev.has(next)) continue;
      prev.set(next, current);
      queue.push(next);
    }
  }
  if (!prev.has(toInterfaceId)) return null;
  const path: string[] = [];
  let cursor: string | null = toInterfaceId;
  while (cursor) {
    path.push(cursor);
    cursor = prev.get(cursor) ?? null;
  }
  path.reverse();
  return path;
}
