import { OPAQUE_TYPES, type ShapeDef, type VisualModel, findShape } from './schema';
import { type Vec3 } from './units';

export const MAX_SHAPES = 2000;
export const MAX_PROFILE_POINTS = 256;
export const MAX_MODEL_JSON_BYTES = 2_000_000;
export const MAX_GENERATOR_SOURCE = 100_000;

const INTERNAL_OPS = new Set([
  'stretch',
  'setMaterial',
  'setFaceMaterial',
  'addPrism',
]);

export function axisLength(axis: Vec3): number {
  return Math.hypot(axis.x, axis.y, axis.z);
}

export function isUnitAxis(axis: Vec3, tol = 1e-3): boolean {
  return Math.abs(axisLength(axis) - 1) <= tol;
}

function segmentsIntersect(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number],
): boolean {
  const cross = (p: [number, number], q: [number, number], r: [number, number]) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Closed ring, at least 3 unique corners, no self-intersection. */
export function prismProfileError(points: Array<[number, number]>): string | null {
  if (points.length > MAX_PROFILE_POINTS) return `profile has more than ${MAX_PROFILE_POINTS} points`;
  const ring = points.slice();
  if (ring.length >= 2) {
    const a = ring[0];
    const b = ring[ring.length - 1];
    if (a && b && a[0] === b[0] && a[1] === b[1]) ring.pop();
  }
  if (ring.length < 3) return 'profile needs at least 3 points';
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      const c = ring[j]!;
      const d = ring[(j + 1) % n]!;
      if (segmentsIntersect(a, b, c, d)) return 'profile is self-intersecting';
    }
  }
  return null;
}

export function parentCycle(model: VisualModel, id: string, parentId: string | null): boolean {
  const seen = new Set<string>([id]);
  let cursor = parentId;
  while (cursor) {
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    const parent = findShape(model, cursor);
    if (!parent) return false;
    cursor = parent.parentId;
  }
  return false;
}

export function positiveDimensions(shape: ShapeDef): string | null {
  if (shape.type === 'group') return null;
  if (shape.type === 'prism') {
    if (!shape.profile) return 'prism requires a profile';
    const err = prismProfileError(shape.profile.pointsMm);
    if (err) return err;
    if (!(shape.profile.depthMm > 0)) return 'prism depth must be positive';
    return null;
  }
  for (const [key, value] of Object.entries(shape.dimensionsMm)) {
    if (!Number.isFinite(value)) return `${key} is not a number`;
    if (value <= 0 && key.endsWith('Mm')) return `${key} must be positive`;
  }
  return null;
}

export interface OpLike {
  op: string;
  id?: string;
  shapeId?: string;
  parentId?: string | null;
}

/** Returns a warning string when the op must be skipped. */
export function rejectOp(model: VisualModel, op: OpLike): string | null {
  if (op.op === 'markInterface' || op.op === 'addNetwork' || op.op === 'addEdge') return null;
  const id = op.id || op.shapeId;
  const shape = id ? findShape(model, id) : undefined;
  if (op.op !== 'add' && op.op !== 'addGroup' && op.op !== 'addPrism' && op.op !== 'instance' && op.op !== 'delete' && !shape && op.op !== 'pattern') {
    if (id && !shape) return `unknown shape ${id}`;
  }
  if (shape && OPAQUE_TYPES.has(shape.type) && INTERNAL_OPS.has(op.op)) {
    const where = shape.cad?.fileId || shape.componentProductId || shape.type;
    return `${shape.type} "${shape.name}" is not editable (${where}). Open the source.`;
  }
  if ((op.op === 'setParent' || op.op === 'add' || op.op === 'addGroup' || op.op === 'addPrism') && id && op.parentId) {
    if (parentCycle(model, id, op.parentId)) return `parent cycle at ${id}`;
    if (!findShape(model, op.parentId) && op.op === 'setParent') return `unknown parent ${op.parentId}`;
  }
  if (shape?.joint && op.op === 'setJoint') {
    /* checked in apply with the new axis */
  }
  if (model.shapes.length >= MAX_SHAPES && (op.op === 'add' || op.op === 'addGroup' || op.op === 'addPrism' || op.op === 'instance' || op.op === 'duplicate' || op.op === 'pattern')) {
    return `shape cap ${MAX_SHAPES} reached`;
  }
  const bytes = JSON.stringify(model).length;
  if (bytes > MAX_MODEL_JSON_BYTES) return `model exceeds ${MAX_MODEL_JSON_BYTES} bytes`;
  return null;
}
