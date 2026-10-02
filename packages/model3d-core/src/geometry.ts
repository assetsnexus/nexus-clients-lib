import { type FaceKey, type ShapeDef, type VisualModel, findShape } from './schema';
import { SNAP_STEPS_MM, type Vec3, nearlyEqualMm, quantizeMm, quantizeVecMm, vec } from './units';

export { SNAP_STEPS_MM };

export function nextSnapStepMm(current: number): number {
  const idx = SNAP_STEPS_MM.findIndex((s) => nearlyEqualMm(s, current, 1e-9));
  if (idx < 0) return 1;
  return SNAP_STEPS_MM[(idx + 1) % SNAP_STEPS_MM.length]!;
}

export function snapScalar(n: number, step: number): number {
  if (!Number.isFinite(n)) return 0;
  if (!Number.isFinite(step) || step <= 0) return n;
  return quantizeMm(Math.round(n / step) * step, Math.min(step, 1e-4));
}

export interface Aabb {
  id: string;
  min: Vec3;
  max: Vec3;
}

export function shapeHalfExtents(shape: ShapeDef): Vec3 {
  const d = shape.dimensionsMm;
  if (shape.type === 'sphere') {
    const r = (d.diameterMm || 100) / 2;
    return vec(r, r, r);
  }
  if (shape.type === 'cylinder' || shape.type === 'disk') {
    const r = d.radiusMm || 50;
    const h = (shape.type === 'disk' ? d.thicknessMm : d.heightMm) || 10;
    return vec(r, r, h / 2);
  }
  if (shape.type === 'tube') {
    const r = d.outerRadiusMm || 45;
    const h = d.heightMm || 100;
    return vec(r, r, h / 2);
  }
  if (shape.type === 'prism' && shape.profile) {
    let minU = Infinity;
    let minV = Infinity;
    let maxU = -Infinity;
    let maxV = -Infinity;
    for (const [u, v] of shape.profile.pointsMm) {
      minU = Math.min(minU, u);
      minV = Math.min(minV, v);
      maxU = Math.max(maxU, u);
      maxV = Math.max(maxV, v);
    }
    if (!Number.isFinite(minU)) return vec(50, 50, 50);
    return vec((maxU - minU) / 2, (maxV - minV) / 2, shape.profile.depthMm / 2);
  }
  if (shape.type === 'cad_ref' && shape.cad) {
    return vec(shape.cad.boundsMm.widthMm / 2, shape.cad.boundsMm.depthMm / 2, shape.cad.boundsMm.heightMm / 2);
  }
  if (shape.type === 'group') return vec(0, 0, 0);
  return vec((d.widthMm || 100) / 2, (d.depthMm || 100) / 2, (d.heightMm || 100) / 2);
}

/** World AABB ignoring rotation (good enough for corner snap of authored parts). */
export function shapeAabb(shape: ShapeDef): Aabb {
  const h = shapeHalfExtents(shape);
  const p = shape.positionMm;
  return {
    id: shape.id,
    min: vec(p.x - h.x, p.y - h.y, p.z - h.z),
    max: vec(p.x + h.x, p.y + h.y, p.z + h.z),
  };
}

export function cornerCandidates(model: VisualModel, ignoreId?: string): Vec3[] {
  const out: Vec3[] = [];
  for (const shape of model.shapes) {
    if (shape.id === ignoreId || shape.type === 'group') continue;
    const box = shapeAabb(shape);
    const xs = [box.min.x, box.max.x];
    const ys = [box.min.y, box.max.y];
    const zs = [box.min.z, box.max.z];
    for (const x of xs) for (const y of ys) for (const z of zs) out.push(vec(x, y, z));
  }
  return out;
}

export interface SnapInput {
  point: Vec3;
  stepMm: number;
  /** Alt held = free move. Snap is the default. */
  altHeld: boolean;
  corners?: Vec3[];
}

export function snapPoint(input: SnapInput): Vec3 {
  if (input.altHeld) return quantizeVecMm(input.point);
  const step = input.stepMm;
  let point = vec(snapScalar(input.point.x, step), snapScalar(input.point.y, step), snapScalar(input.point.z, step));
  let best = step;
  for (const corner of input.corners || []) {
    const dist = Math.hypot(corner.x - input.point.x, corner.y - input.point.y, corner.z - input.point.z);
    if (dist <= best) {
      best = dist;
      point = corner;
    }
  }
  return quantizeVecMm(point);
}

const FACE_AXIS: Record<FaceKey, { axis: 'x' | 'y' | 'z'; sign: 1 | -1; dim: string }> = {
  px: { axis: 'x', sign: 1, dim: 'widthMm' },
  nx: { axis: 'x', sign: -1, dim: 'widthMm' },
  py: { axis: 'y', sign: 1, dim: 'depthMm' },
  ny: { axis: 'y', sign: -1, dim: 'depthMm' },
  pz: { axis: 'z', sign: 1, dim: 'heightMm' },
  nz: { axis: 'z', sign: -1, dim: 'heightMm' },
};

export interface StretchResult {
  positionMm: Vec3;
  dimensionsMm: Record<string, number>;
  profile: ShapeDef['profile'];
}

/**
 * Pull a face along its outward normal. The opposite face stays put.
 * `pullMm` > 0 grows the solid.
 */
export function stretchShape(shape: ShapeDef, face: FaceKey, pullMm: number): StretchResult | null {
  const pull = quantizeMm(pullMm);
  if (shape.type === 'prism' && shape.profile && (face === 'pz' || face === 'nz')) {
    const nextDepth = quantizeMm(shape.profile.depthMm + pull);
    if (nextDepth <= 0) return null;
    const positionMm = { ...shape.positionMm };
    positionMm.z = quantizeMm(shape.positionMm.z + (face === 'pz' ? pull / 2 : -pull / 2));
    return {
      positionMm,
      dimensionsMm: { ...shape.dimensionsMm },
      profile: { ...shape.profile, depthMm: nextDepth },
    };
  }
  if (shape.type === 'cylinder' || shape.type === 'disk' || shape.type === 'tube') {
    const positionMm = { ...shape.positionMm };
    const dimensionsMm = { ...shape.dimensionsMm };
    if (face === 'pz' || face === 'nz') {
      const key = shape.type === 'disk' ? 'thicknessMm' : 'heightMm';
      const next = quantizeMm((dimensionsMm[key] || 0) + pull);
      if (next <= 0) return null;
      dimensionsMm[key] = next;
      positionMm.z = quantizeMm(shape.positionMm.z + (face === 'pz' ? pull / 2 : -pull / 2));
      return { positionMm, dimensionsMm, profile: shape.profile };
    }
    const radial = shape.type === 'tube' ? 'outerRadiusMm' : 'radiusMm';
    const next = quantizeMm((dimensionsMm[radial] || 0) + pull);
    if (next <= 0) return null;
    dimensionsMm[radial] = next;
    return { positionMm, dimensionsMm, profile: shape.profile };
  }
  if (shape.type !== 'box' && shape.type !== 'cad_ref' && shape.type !== 'model' && shape.type !== 'component_ref') {
    return null;
  }
  const map = FACE_AXIS[face];
  const dimensionsMm = { ...shape.dimensionsMm };
  const current = dimensionsMm[map.dim] || 0;
  const next = quantizeMm(current + pull);
  if (next <= 0) return null;
  dimensionsMm[map.dim] = next;
  const positionMm = { ...shape.positionMm };
  positionMm[map.axis] = quantizeMm(shape.positionMm[map.axis] + (map.sign * pull) / 2);
  return { positionMm, dimensionsMm, profile: shape.profile };
}

export function modelBoundsMm(model: VisualModel): { min: Vec3; max: Vec3 } | null {
  let min = vec(Infinity, Infinity, Infinity);
  let max = vec(-Infinity, -Infinity, -Infinity);
  let any = false;
  for (const shape of model.shapes) {
    if (shape.type === 'group') continue;
    const box = shapeAabb(shape);
    any = true;
    min = vec(Math.min(min.x, box.min.x), Math.min(min.y, box.min.y), Math.min(min.z, box.min.z));
    max = vec(Math.max(max.x, box.max.x), Math.max(max.y, box.max.y), Math.max(max.z, box.max.z));
  }
  return any ? { min, max } : null;
}

export function pointInPolygon(x: number, y: number, points: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const pi = points[i]!;
    const pj = points[j]!;
    const intersect = pi.y > y !== pj.y > y && x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y || 1e-12) + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Cluster pose is metres, Z up in the map (elevation). Zone points are map X/Y metres. */
export function elevationForFootprint(
  zones: Array<{ points?: Array<{ x: number; y: number }>; elevationM?: number }>,
  xM: number,
  yM: number,
): number {
  let best = 0;
  for (const zone of zones) {
    const pts = zone.points || [];
    if (pts.length < 3) continue;
    if (!pointInPolygon(xM, yM, pts)) continue;
    const z = Number(zone.elevationM);
    if (Number.isFinite(z) && z >= best) best = z;
  }
  return best;
}

export function shapeById(model: VisualModel, id: string): ShapeDef | undefined {
  return findShape(model, id);
}
