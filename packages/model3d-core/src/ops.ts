import { stretchShape } from './geometry';
import {
  type FaceKey,
  type JointDef,
  type MaterialDef,
  type RepresentsDef,
  type ShapeDef,
  type ShapeType,
  type Surface,
  type VisualModel,
  cloneModel,
  defaultDimensions,
  defaultMaterial,
  findShape,
  nextShapeId,
  normalizeModel,
  serializeWithMirrors,
} from './schema';
import { isUnitAxis, prismProfileError, rejectOp } from './validate';
import { type Vec3, quantizeMm, quantizeVecMm, vec } from './units';

export type HistorySource = 'user' | 'agent' | 'script';

export interface ModelOp {
  op: string;
  id?: string;
  shapeId?: string;
  type?: ShapeType;
  name?: string;
  parentId?: string | null;
  positionMm?: Partial<Vec3>;
  rotationDeg?: Partial<Vec3>;
  deltaMm?: Partial<Vec3>;
  deltaDeg?: Partial<Vec3>;
  dimensionsMm?: Record<string, number>;
  face?: FaceKey;
  pullMm?: number;
  color?: string;
  opacity?: number;
  material?: Partial<MaterialDef>;
  visible?: boolean;
  surface?: Surface | null;
  joint?: Partial<JointDef> | null;
  represents?: Partial<RepresentsDef> | null;
  profile?: { pointsMm: Array<[number, number]>; depthMm: number };
  productId?: string;
  slotId?: string | null;
  slotInstanceId?: string | null;
  source?: HistorySource;
  count?: number;
  stepMm?: Partial<Vec3>;
  mode?: 'linear' | 'grid' | 'radial';
  grid?: { along: Partial<Vec3>; count: number };
}

export interface HistoryEntry {
  id: string;
  source: HistorySource;
  kind: string;
  shapeIds: string[];
  before: VisualModel;
  after: VisualModel;
  params: Record<string, unknown>;
  op: ModelOp;
}

export interface ApplyResult {
  model: VisualModel;
  entry: HistoryEntry | null;
  entries: HistoryEntry[];
  warnings: string[];
}

function mergeVec(base: Vec3, patch?: Partial<Vec3>): Vec3 {
  if (!patch) return base;
  return quantizeVecMm({
    x: Number.isFinite(Number(patch.x)) ? Number(patch.x) : base.x,
    y: Number.isFinite(Number(patch.y)) ? Number(patch.y) : base.y,
    z: Number.isFinite(Number(patch.z)) ? Number(patch.z) : base.z,
  });
}

function makeShape(op: ModelOp, index: number): ShapeDef {
  const type: ShapeType = op.op === 'addGroup' ? 'group' : op.op === 'addPrism' ? 'prism' : op.op === 'instance' ? 'component_ref' : (op.type || 'box');
  const id = op.id || nextShapeId(type === 'group' ? 'group' : 'shape');
  const draft = normalizeModel({
    schemaVersion: 3,
    shapes: [
      {
        id,
        type,
        name: op.name || `${type}_${index + 1}`,
        parentId: op.parentId || null,
        positionMm: mergeVec(vec(), op.positionMm),
        rotationDeg: mergeVec(vec(), op.rotationDeg),
        dimensionsMm: { ...defaultDimensions(type), ...(op.dimensionsMm || {}) },
        profile: type === 'prism' ? op.profile : null,
        color: op.color,
        opacity: op.opacity,
        material: op.material,
        visible: op.visible !== false,
        surface: op.surface || null,
        joint: op.joint || null,
        represents: op.represents || (op.productId ? { productId: op.productId, slotId: op.slotId || null, slotInstanceId: op.slotInstanceId || null, interfaceIds: [] } : null),
        componentProductId: op.productId,
        componentSlotId: op.slotId,
        slotInstanceId: op.slotInstanceId,
      },
    ],
  }).shapes[0]!;
  return draft;
}

function applyOne(model: VisualModel, op: ModelOp): { warning?: string; shapeIds: string[] } {
  const reason = rejectOp(model, op);
  if (reason) return { warning: reason, shapeIds: [] };
  const id = op.id || op.shapeId;

  if (op.op === 'add' || op.op === 'addGroup' || op.op === 'addPrism' || op.op === 'instance') {
    const shape = makeShape(op, model.shapes.length);
    if (shape.type === 'prism' && shape.profile) {
      const err = prismProfileError(shape.profile.pointsMm);
      if (err || !(shape.profile.depthMm > 0)) return { warning: err || 'prism depth must be positive', shapeIds: [] };
    }
    if (op.parentId && !findShape(model, op.parentId)) return { warning: `unknown parent ${op.parentId}`, shapeIds: [] };
    model.shapes.push(shape);
    return { shapeIds: [shape.id] };
  }

  const shape = id ? findShape(model, id) : undefined;
  if (!shape) return { warning: `unknown shape ${id || ''}`, shapeIds: [] };

  if (op.op === 'delete') {
    const drop = new Set<string>();
    const walk = (sid: string) => {
      drop.add(sid);
      for (const child of model.shapes) if (child.parentId === sid) walk(child.id);
    };
    walk(shape.id);
    model.shapes = model.shapes.filter((s) => !drop.has(s.id));
    return { shapeIds: [...drop] };
  }
  if (op.op === 'duplicate') {
    const copy = cloneModel({ ...model, shapes: [shape] }).shapes[0]!;
    copy.id = nextShapeId('shape');
    copy.name = `${shape.name} copy`;
    copy.positionMm = quantizeVecMm({ ...copy.positionMm, x: copy.positionMm.x + 20 });
    model.shapes.push(normalizeModel({ schemaVersion: 3, shapes: [copy] }).shapes[0]!);
    return { shapeIds: [copy.id] };
  }
  if (op.op === 'move') {
    if (op.positionMm) shape.positionMm = mergeVec(shape.positionMm, op.positionMm);
    if (op.deltaMm) {
      shape.positionMm = quantizeVecMm({
        x: shape.positionMm.x + (Number(op.deltaMm.x) || 0),
        y: shape.positionMm.y + (Number(op.deltaMm.y) || 0),
        z: shape.positionMm.z + (Number(op.deltaMm.z) || 0),
      });
    }
    return { shapeIds: [shape.id] };
  }
  if (op.op === 'rotate') {
    if (op.rotationDeg) shape.rotationDeg = mergeVec(shape.rotationDeg, op.rotationDeg);
    if (op.deltaDeg) {
      shape.rotationDeg = quantizeVecMm({
        x: shape.rotationDeg.x + (Number(op.deltaDeg.x) || 0),
        y: shape.rotationDeg.y + (Number(op.deltaDeg.y) || 0),
        z: shape.rotationDeg.z + (Number(op.deltaDeg.z) || 0),
      }, 1e-6);
    }
    return { shapeIds: [shape.id] };
  }
  if (op.op === 'stretch') {
    const face = op.face;
    if (!face) return { warning: 'stretch requires a face', shapeIds: [] };
    const next = stretchShape(shape, face, Number(op.pullMm) || 0);
    if (!next) return { warning: 'stretch rejected', shapeIds: [] };
    shape.positionMm = next.positionMm;
    shape.dimensionsMm = next.dimensionsMm;
    shape.profile = next.profile;
    return { shapeIds: [shape.id] };
  }
  if (op.op === 'setParent') {
    shape.parentId = op.parentId || null;
    return { shapeIds: [shape.id] };
  }
  if (op.op === 'setVisible') {
    shape.visible = op.visible !== false;
    return { shapeIds: [shape.id] };
  }
  if (op.op === 'setSurface') {
    shape.surface = op.surface || null;
    return { shapeIds: [shape.id] };
  }
  if (op.op === 'setName') {
    if (op.name) shape.name = op.name;
    return { shapeIds: [shape.id] };
  }
  if (op.op === 'setMaterial' || op.op === 'setFaceMaterial') {
    const patch = op.material || {};
    if (op.color) patch.color = op.color;
    if (op.opacity != null) patch.opacity = op.opacity;
    if (op.op === 'setFaceMaterial' && op.face) {
      shape.faces = { ...shape.faces, [op.face]: { ...shape.material, ...shape.faces[op.face], ...patch } };
    } else {
      shape.material = { ...shape.material, ...patch, textureRepeat: patch.textureRepeat || shape.material.textureRepeat };
      if (patch.color) shape.color = patch.color;
      if (patch.opacity != null) shape.opacity = patch.opacity;
    }
    return { shapeIds: [shape.id] };
  }
  if (op.op === 'setJoint') {
    if (op.joint === null) {
      shape.joint = null;
      return { shapeIds: [shape.id] };
    }
    const axis = op.joint?.axis || shape.joint?.axis || vec(0, 0, 1);
    if (!isUnitAxis(axis)) return { warning: 'joint axis must be a unit vector', shapeIds: [] };
    shape.joint = {
      type: op.joint?.type || shape.joint?.type || 'revolute',
      axis: { ...axis },
      minDeg: op.joint?.minDeg ?? shape.joint?.minDeg ?? null,
      maxDeg: op.joint?.maxDeg ?? shape.joint?.maxDeg ?? null,
      restDeg: op.joint?.restDeg ?? shape.joint?.restDeg ?? 0,
      metricId: op.joint?.metricId ?? shape.joint?.metricId ?? null,
      servoChannel: op.joint?.servoChannel ?? shape.joint?.servoChannel ?? null,
      invert: op.joint?.invert ?? shape.joint?.invert ?? false,
    };
    return { shapeIds: [shape.id] };
  }
  if (op.op === 'setRepresents') {
    shape.represents = op.represents
      ? {
          productId: op.represents.productId ?? null,
          slotId: op.represents.slotId ?? null,
          slotInstanceId: op.represents.slotInstanceId ?? null,
          interfaceIds: op.represents.interfaceIds || [],
        }
      : null;
    if (shape.type === 'component_ref' && shape.represents) {
      shape.componentProductId = shape.represents.productId || '';
      shape.componentSlotId = shape.represents.slotId;
      shape.slotInstanceId = shape.represents.slotInstanceId;
    }
    return { shapeIds: [shape.id] };
  }
  if (op.op === 'pattern') return applyPattern(model, shape, op);
  return { warning: `unknown op ${op.op}`, shapeIds: [] };
}

function applyPattern(model: VisualModel, shape: ShapeDef, op: ModelOp): { warning?: string; shapeIds: string[] } {
  const mode = op.mode || 'linear';
  const count = Math.max(0, Math.min(64, Math.floor(Number(op.count) || 0)));
  if (!count) return { warning: 'pattern count required', shapeIds: [] };
  const ids: string[] = [];
  if (mode === 'radial') {
    const step = 360 / count;
    for (let i = 1; i < count; i++) {
      const copy = cloneShape(shape, quantizeMm(i * step));
      model.shapes.push(copy);
      ids.push(copy.id);
    }
    return { shapeIds: ids };
  }
  const step = op.stepMm || { x: 100, y: 0, z: 0 };
  const cols = mode === 'grid' ? Math.max(1, Math.floor(Number(op.grid?.count) || 1)) : 1;
  const along = op.grid?.along || { x: 0, y: 100, z: 0 };
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < (mode === 'grid' ? cols : 1); j++) {
      if (i === 0 && j === 0) continue;
      const copy = cloneShape(shape, 0);
      copy.positionMm = quantizeVecMm({
        x: shape.positionMm.x + (Number(step.x) || 0) * i + (Number(along.x) || 0) * j,
        y: shape.positionMm.y + (Number(step.y) || 0) * i + (Number(along.y) || 0) * j,
        z: shape.positionMm.z + (Number(step.z) || 0) * i + (Number(along.z) || 0) * j,
      });
      model.shapes.push(normalizeModel({ schemaVersion: 3, shapes: [copy] }).shapes[0]!);
      ids.push(copy.id);
    }
  }
  return { shapeIds: ids };
}

function cloneShape(shape: ShapeDef, yaw: number): ShapeDef {
  const copy = normalizeModel({ schemaVersion: 3, shapes: [JSON.parse(JSON.stringify(shape))] }).shapes[0]!;
  copy.id = nextShapeId('shape');
  copy.rotationDeg = quantizeVecMm({ ...copy.rotationDeg, z: copy.rotationDeg.z + yaw }, 1e-6);
  return copy;
}

let entrySeq = 0;

export function applyOps(model: VisualModel, ops: ModelOp[], source: HistorySource = 'user'): ApplyResult {
  const warnings: string[] = [];
  const entries: HistoryEntry[] = [];
  let current = serializeWithMirrors(cloneModel(model));
  for (const op of ops) {
    const before = cloneModel(current);
    const working = cloneModel(current);
    const result = applyOne(working, op);
    if (result.warning) {
      warnings.push(result.warning);
      continue;
    }
    current = serializeWithMirrors(working);
    entrySeq += 1;
    entries.push({
      id: `hist_${entrySeq}`,
      source: op.source || source,
      kind: op.op,
      shapeIds: result.shapeIds,
      before,
      after: cloneModel(current),
      params: paramsOf(op),
      op,
    });
  }
  return { model: current, entry: entries[entries.length - 1] || null, entries, warnings };
}

function paramsOf(op: ModelOp): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (op.deltaMm) params.deltaMm = op.deltaMm;
  if (op.positionMm) params.positionMm = op.positionMm;
  if (op.deltaDeg) params.deltaDeg = op.deltaDeg;
  if (op.rotationDeg) params.rotationDeg = op.rotationDeg;
  if (op.face) params.face = op.face;
  if (op.pullMm != null) params.pullMm = op.pullMm;
  return params;
}

export function describeOp(entry: HistoryEntry, decimals = 2): string {
  const op = entry.op;
  const name = entry.shapeIds[0] || 'shape';
  const fmt = (n: number) => quantizeMm(n).toFixed(decimals);
  if (op.op === 'move' && op.deltaMm) {
    const d = op.deltaMm;
    return `move "${name}" by ${fmt(Number(d.x) || 0)}, ${fmt(Number(d.y) || 0)}, ${fmt(Number(d.z) || 0)} mm`;
  }
  if (op.op === 'stretch') return `stretch "${name}" ${op.face || ''} ${fmt(Number(op.pullMm) || 0)} mm`;
  if (op.op === 'rotate' && op.deltaDeg) {
    const d = op.deltaDeg;
    return `rotate "${name}" by ${fmt(Number(d.x) || 0)}, ${fmt(Number(d.y) || 0)}, ${fmt(Number(d.z) || 0)} deg`;
  }
  return `${op.op} "${name}"`;
}

export function defaultBoxMaterial(): MaterialDef {
  return defaultMaterial();
}
