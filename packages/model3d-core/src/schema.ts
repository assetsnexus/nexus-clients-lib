import {
  PRECISION_MM,
  type Vec3,
  quantizeMm,
  quantizeVecMm,
  readVec,
  vec,
  yUpEulerToZUpEuler,
  yUpSceneToZUpMm,
  zUpEulerToYUpEuler,
  zUpMmToYUpScene,
} from './units';

export const SCHEMA_VERSION = 3;

export const SHAPE_TYPES = [
  'group',
  'box',
  'sphere',
  'cylinder',
  'disk',
  'tube',
  'prism',
  'model',
  'cad_ref',
  'component_ref',
] as const;

export type ShapeType = (typeof SHAPE_TYPES)[number];

export const OPAQUE_TYPES = new Set<ShapeType>(['model', 'cad_ref', 'component_ref']);

export const SURFACES = ['floor', 'wall', 'roof'] as const;
export type Surface = (typeof SURFACES)[number];

export const JOINT_TYPES = ['fixed', 'revolute', 'continuous', 'prismatic'] as const;
export type JointType = (typeof JOINT_TYPES)[number];

export const FACE_KEYS = ['px', 'nx', 'py', 'ny', 'pz', 'nz'] as const;
export type FaceKey = (typeof FACE_KEYS)[number];

export const CAD_FORMATS = ['ifc', 'step', 'iges', 'dxf', 'dwg'] as const;
export type CadFormat = (typeof CAD_FORMATS)[number];

export interface SpatialContext {
  upAxis: 'Z';
  handedness: 'right';
  lengthUnit: 'MILLIMETRE';
  precisionMm: number;
  displayDecimals: number;
  origin: 'footprint-center-ground';
}

export interface MaterialDef {
  color: string;
  opacity: number;
  metalness: number;
  roughness: number;
  textureFileId: string | null;
  textureRepeat: { u: number; v: number };
  textureRotationDeg: number;
}

export interface JointDef {
  type: JointType;
  axis: Vec3;
  minDeg: number | null;
  maxDeg: number | null;
  restDeg: number;
  metricId: string | null;
  servoChannel: number | null;
  invert: boolean;
}

export interface RepresentsDef {
  productId: string | null;
  slotId: string | null;
  slotInstanceId: string | null;
  interfaceIds: string[];
}

export interface CadElement {
  ref: string;
  name: string;
  ifcType: string | null;
  boundsMm: { widthMm: number; heightMm: number; depthMm: number } | null;
}

export interface CadDef {
  fileId: string | null;
  format: CadFormat;
  lengthUnit: string;
  upAxis: string;
  boundsMm: { widthMm: number; heightMm: number; depthMm: number };
  elements: CadElement[];
  editable: false;
}

export interface PrismProfile {
  pointsMm: Array<[number, number]>;
  depthMm: number;
}

export interface ShapeDef {
  id: string;
  type: ShapeType;
  name: string;
  parentId: string | null;
  visible: boolean;
  surface: Surface | null;
  positionMm: Vec3;
  rotationDeg: Vec3;
  /** Legacy Y-up scene units. Always written. */
  position: Vec3;
  /** Legacy Y-up euler degrees. Always written. */
  rotation: Vec3;
  scale: Vec3;
  dimensionsMm: Record<string, number>;
  profile: PrismProfile | null;
  material: MaterialDef;
  faces: Partial<Record<FaceKey, Partial<MaterialDef>>>;
  joint: JointDef | null;
  represents: RepresentsDef | null;
  cad: CadDef | null;
  sourceModelId: string | null;
  /** Cluster map layer this shape belongs to. Floors use it for the layers filter. */
  layerId: string | null;
  linkedInterfaceIds: string[];
  modelParts: unknown[];
  modelAsset: { base64?: string | null; fileId?: string | null; fileName?: string } | null;
  modelNativeSize: Vec3 | null;
  componentProductId?: string;
  componentSlotId?: string | null;
  slotInstanceId?: string | null;
  color: string;
  opacity: number;
  colorMetricKey: string | null;
  colorMetricConfig: unknown;
}

/**
 * One piece of an agent-written generator script.
 * `order` is source-file order only. It is not a parent/child link in the model.
 * `title` and `description` are notes the agent writes for a later agent. Execution ignores them.
 */
export interface GeneratorChunk {
  id: string;
  order: number;
  title: string;
  description: string;
  source: string;
}

export interface GeneratorDef {
  language: 'js';
  apiVersion: 1;
  /** Whole script used only when `chunks` is empty. Not a mirror of the chunk bodies. */
  source: string;
  /** Authoring records. Empty means the legacy single `source` string. */
  chunks: GeneratorChunk[];
  updatedAt: string | null;
  updatedBy: string | null;
  lastRunAt: string | null;
  lastRunHash: string | null;
  dirty: boolean;
  manualEdits: string[];
}

export interface InterfaceMarker {
  interfaceId: string;
  shapeId: string | null;
  partId: string | null;
  position: Vec3;
  label: string;
}

export interface VisualModel {
  schemaVersion: number;
  spatialContext: SpatialContext;
  viewMode: '2d' | '3d';
  view2dSide: string;
  opacity: number;
  shapes: ShapeDef[];
  interfaceMarkers: InterfaceMarker[];
  generator: GeneratorDef | null;
  globalColorMetricKey: string | null;
  globalColorMetricConfig: unknown;
  colorTestValue: number;
  interfaceHighlightPreview: number;
}

export function defaultSpatialContext(): SpatialContext {
  return {
    upAxis: 'Z',
    handedness: 'right',
    lengthUnit: 'MILLIMETRE',
    precisionMm: PRECISION_MM,
    displayDecimals: 2,
    origin: 'footprint-center-ground',
  };
}

export function defaultMaterial(color = '#51cbce', opacity = 0.92): MaterialDef {
  return {
    color,
    opacity,
    metalness: 0.1,
    roughness: 0.7,
    textureFileId: null,
    textureRepeat: { u: 1, v: 1 },
    textureRotationDeg: 0,
  };
}

export function defaultDimensions(type: ShapeType): Record<string, number> {
  switch (type) {
    case 'sphere':
      return { diameterMm: 100 };
    case 'cylinder':
      return { radiusMm: 50, heightMm: 100 };
    case 'disk':
      return { radiusMm: 80, thicknessMm: 15 };
    case 'tube':
      return { outerRadiusMm: 45, wallThicknessMm: 8, heightMm: 100 };
    case 'group':
      return {};
    default:
      return { widthMm: 100, heightMm: 100, depthMm: 100 };
  }
}

export function defaultModel(): VisualModel {
  return {
    schemaVersion: SCHEMA_VERSION,
    spatialContext: defaultSpatialContext(),
    viewMode: '3d',
    view2dSide: 'front',
    opacity: 0.92,
    shapes: [],
    interfaceMarkers: [],
    generator: null,
    globalColorMetricKey: null,
    globalColorMetricConfig: null,
    colorTestValue: 50,
    interfaceHighlightPreview: 0,
  };
}

export function emptyGenerator(source = ''): GeneratorDef {
  return {
    language: 'js',
    apiVersion: 1,
    source,
    chunks: [],
    updatedAt: null,
    updatedBy: null,
    lastRunAt: null,
    lastRunHash: null,
    dirty: false,
    manualEdits: [],
  };
}

/** Keep stored chunk records. Does not invent titles or split `source`. */
function normalizeChunks(raw: unknown): GeneratorChunk[] {
  if (!Array.isArray(raw)) return [];
  const out: GeneratorChunk[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i += 1) {
    const row = asRecord(raw[i]);
    if (!row) continue;
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const order = Number(row.order);
    out.push({
      id,
      order: Number.isFinite(order) ? order : i,
      title: typeof row.title === 'string' ? row.title : '',
      description: typeof row.description === 'string' ? row.description : '',
      source: typeof row.source === 'string' ? row.source : '',
    });
  }
  return out;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function shapeType(raw: unknown): ShapeType {
  const t = String(raw || 'box').toLowerCase();
  return (SHAPE_TYPES as readonly string[]).includes(t) ? (t as ShapeType) : 'box';
}

function surfaceOf(raw: unknown): Surface | null {
  const s = String(raw || '');
  return (SURFACES as readonly string[]).includes(s) ? (s as Surface) : null;
}

function clamp01(n: unknown, fallback: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(0, Math.min(1, x));
}

function materialOf(raw: unknown, color: string, opacity: number): MaterialDef {
  const m = asRecord(raw);
  const base = defaultMaterial(color, opacity);
  if (!m) return base;
  const repeat = asRecord(m.textureRepeat);
  return {
    color: typeof m.color === 'string' ? m.color : color,
    opacity: clamp01(m.opacity, opacity),
    metalness: clamp01(m.metalness, 0.1),
    roughness: clamp01(m.roughness, 0.7),
    textureFileId: typeof m.textureFileId === 'string' ? m.textureFileId : null,
    textureRepeat: {
      u: Number(repeat?.u) || 1,
      v: Number(repeat?.v) || 1,
    },
    textureRotationDeg: Number(m.textureRotationDeg) || 0,
  };
}

function jointOf(raw: unknown): JointDef | null {
  const j = asRecord(raw);
  if (!j) return null;
  const type = String(j.type || 'fixed');
  const jt = (JOINT_TYPES as readonly string[]).includes(type) ? (type as JointType) : 'fixed';
  const axis = readVec(j.axis, vec(0, 0, 1));
  return {
    type: jt,
    axis,
    minDeg: Number.isFinite(Number(j.minDeg)) ? Number(j.minDeg) : null,
    maxDeg: Number.isFinite(Number(j.maxDeg)) ? Number(j.maxDeg) : null,
    restDeg: Number(j.restDeg) || 0,
    metricId: typeof j.metricId === 'string' ? j.metricId : null,
    servoChannel: Number.isFinite(Number(j.servoChannel)) ? Number(j.servoChannel) : null,
    invert: j.invert === true,
  };
}

function representsOf(raw: unknown, shape: Record<string, unknown>): RepresentsDef | null {
  const r = asRecord(raw);
  const productId = (r && typeof r.productId === 'string' && r.productId) || (typeof shape.componentProductId === 'string' ? shape.componentProductId : '') || null;
  const slotId = (r && (typeof r.slotId === 'string' ? r.slotId : null)) || (typeof shape.componentSlotId === 'string' ? shape.componentSlotId : null);
  const slotInstanceId = (r && (typeof r.slotInstanceId === 'string' ? r.slotInstanceId : null)) || (typeof shape.slotInstanceId === 'string' ? shape.slotInstanceId : null);
  const interfaceIds = Array.isArray(r?.interfaceIds) ? r!.interfaceIds.filter((id) => typeof id === 'string') as string[] : [];
  if (!productId && !slotId && !slotInstanceId && !interfaceIds.length && !r) return null;
  return { productId: productId || null, slotId, slotInstanceId, interfaceIds };
}

function cadOf(raw: unknown): CadDef | null {
  const c = asRecord(raw);
  if (!c) return null;
  const format = String(c.format || 'dxf');
  const fmt = (CAD_FORMATS as readonly string[]).includes(format) ? (format as CadFormat) : 'dxf';
  const b = asRecord(c.boundsMm);
  const elements = Array.isArray(c.elements)
    ? c.elements.map((row) => {
        const e = asRecord(row) || {};
        const eb = asRecord(e.boundsMm);
        return {
          ref: String(e.ref || ''),
          name: String(e.name || ''),
          ifcType: typeof e.ifcType === 'string' ? e.ifcType : null,
          boundsMm: eb
            ? { widthMm: Number(eb.widthMm) || 0, heightMm: Number(eb.heightMm) || 0, depthMm: Number(eb.depthMm) || 0 }
            : null,
        };
      })
    : [];
  return {
    fileId: typeof c.fileId === 'string' ? c.fileId : null,
    format: fmt,
    lengthUnit: typeof c.lengthUnit === 'string' ? c.lengthUnit : 'MILLIMETRE',
    upAxis: typeof c.upAxis === 'string' ? c.upAxis : 'Z',
    boundsMm: {
      widthMm: Number(b?.widthMm) || 100,
      heightMm: Number(b?.heightMm) || 100,
      depthMm: Number(b?.depthMm) || 100,
    },
    elements,
    editable: false,
  };
}

function profileOf(raw: unknown): PrismProfile | null {
  const p = asRecord(raw);
  if (!p || !Array.isArray(p.pointsMm)) return null;
  const pointsMm = p.pointsMm
    .map((pt) => {
      if (!Array.isArray(pt) || pt.length < 2) return null;
      const u = Number(pt[0]);
      const v = Number(pt[1]);
      if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
      return [quantizeMm(u), quantizeMm(v)] as [number, number];
    })
    .filter((pt): pt is [number, number] => !!pt);
  return { pointsMm, depthMm: quantizeMm(Number(p.depthMm) || 0) };
}

function dimensionsOf(type: ShapeType, raw: unknown): Record<string, number> {
  const base = defaultDimensions(type);
  const d = asRecord(raw);
  if (!d) return base;
  const out: Record<string, number> = { ...base };
  for (const [k, v] of Object.entries(d)) {
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = quantizeMm(n);
  }
  return out;
}

function applyMirrors(shape: ShapeDef): void {
  const scene = zUpMmToYUpScene(shape.positionMm);
  shape.position = { x: quantizeMm(scene.x, 1e-6), y: quantizeMm(scene.y, 1e-6), z: quantizeMm(scene.z, 1e-6) };
  shape.rotation = zUpEulerToYUpEuler(shape.rotationDeg);
}

function canonicalFromLegacy(raw: Record<string, unknown>, version: number): { positionMm: Vec3; rotationDeg: Vec3 } {
  if (version >= 3 && raw.positionMm) {
    return {
      positionMm: quantizeVecMm(readVec(raw.positionMm)),
      rotationDeg: quantizeVecMm(readVec(raw.rotationDeg), 1e-6),
    };
  }
  const position = readVec(raw.position);
  const rotation = readVec(raw.rotation);
  return {
    positionMm: yUpSceneToZUpMm(position),
    rotationDeg: yUpEulerToZUpEuler(rotation),
  };
}

let idSeq = 0;
export function nextShapeId(prefix = 'shape'): string {
  idSeq += 1;
  return `${prefix}_${idSeq.toString(36)}`;
}

export function normalizeShape(raw: unknown, version: number): ShapeDef {
  const s = asRecord(raw) || {};
  const type = shapeType(s.type);
  const color = typeof s.color === 'string' ? s.color : '#51cbce';
  const opacity = clamp01(s.opacity, 0.92);
  const pose = canonicalFromLegacy(s, version);
  const facesRaw = asRecord(s.faces) || {};
  const faces: ShapeDef['faces'] = {};
  for (const key of FACE_KEYS) {
    if (facesRaw[key]) faces[key] = materialOf(facesRaw[key], color, opacity);
  }
  const shape: ShapeDef = {
    id: typeof s.id === 'string' && s.id ? s.id : nextShapeId(),
    type,
    name: typeof s.name === 'string' && s.name ? s.name : type,
    parentId: typeof s.parentId === 'string' ? s.parentId : null,
    visible: s.visible !== false,
    surface: surfaceOf(s.surface),
    positionMm: pose.positionMm,
    rotationDeg: pose.rotationDeg,
    position: vec(),
    rotation: vec(),
    scale: readVec(s.scale, vec(1, 1, 1)),
    dimensionsMm: dimensionsOf(type, s.dimensionsMm),
    profile: type === 'prism' ? profileOf(s.profile) : null,
    material: materialOf(s.material, color, opacity),
    faces,
    joint: jointOf(s.joint),
    represents: representsOf(s.represents, s),
    cad: type === 'cad_ref' ? cadOf(s.cad) : null,
    sourceModelId: typeof s.sourceModelId === 'string' ? s.sourceModelId : null,
    layerId: typeof s.layerId === 'string' && s.layerId ? s.layerId : null,
    linkedInterfaceIds: Array.isArray(s.linkedInterfaceIds) ? s.linkedInterfaceIds.filter((id) => typeof id === 'string') as string[] : [],
    modelParts: Array.isArray(s.modelParts) ? s.modelParts : [],
    modelAsset: asRecord(s.modelAsset) as ShapeDef['modelAsset'],
    modelNativeSize: s.modelNativeSize ? readVec(s.modelNativeSize, vec(1, 1, 1)) : null,
    color,
    opacity,
    colorMetricKey: typeof s.colorMetricKey === 'string' ? s.colorMetricKey : null,
    colorMetricConfig: s.colorMetricConfig ?? null,
  };
  if (type === 'component_ref') {
    shape.componentProductId = shape.represents?.productId || (typeof s.componentProductId === 'string' ? s.componentProductId : '');
    shape.componentSlotId = shape.represents?.slotId ?? (typeof s.componentSlotId === 'string' ? s.componentSlotId : null);
    shape.slotInstanceId = shape.represents?.slotInstanceId ?? (typeof s.slotInstanceId === 'string' ? s.slotInstanceId : null);
  }
  shape.material.color = shape.material.color || color;
  shape.color = shape.material.color;
  shape.opacity = shape.material.opacity;
  applyMirrors(shape);
  return shape;
}

export function normalizeModel(raw: unknown): VisualModel {
  const base = defaultModel();
  const src = asRecord(raw);
  if (!src) return base;
  const version = Number(src.schemaVersion) || 1;
  const ctxIn = asRecord(src.spatialContext);
  const spatialContext = defaultSpatialContext();
  if (ctxIn) {
    const precision = Number(ctxIn.precisionMm);
    const decimals = Number(ctxIn.displayDecimals);
    if (Number.isFinite(precision) && precision > 0) spatialContext.precisionMm = precision;
    if (Number.isFinite(decimals)) spatialContext.displayDecimals = Math.max(0, Math.min(6, decimals));
  }
  const gen = asRecord(src.generator);
  return {
    ...base,
    schemaVersion: SCHEMA_VERSION,
    spatialContext,
    viewMode: src.viewMode === '2d' ? '2d' : '3d',
    view2dSide: typeof src.view2dSide === 'string' ? src.view2dSide : 'front',
    opacity: clamp01(src.opacity, 0.92),
    shapes: Array.isArray(src.shapes) ? src.shapes.map((s) => normalizeShape(s, version)) : [],
    interfaceMarkers: Array.isArray(src.interfaceMarkers)
      ? src.interfaceMarkers.map((m) => {
          const row = asRecord(m) || {};
          return {
            interfaceId: String(row.interfaceId || ''),
            shapeId: typeof row.shapeId === 'string' ? row.shapeId : null,
            partId: typeof row.partId === 'string' ? row.partId : null,
            position: readVec(row.position),
            label: String(row.label || ''),
          };
        })
      : [],
    generator: gen
      ? {
          language: 'js',
          apiVersion: 1,
          source: typeof gen.source === 'string' ? gen.source : '',
          chunks: normalizeChunks(gen.chunks),
          updatedAt: typeof gen.updatedAt === 'string' ? gen.updatedAt : null,
          updatedBy: typeof gen.updatedBy === 'string' ? gen.updatedBy : null,
          lastRunAt: typeof gen.lastRunAt === 'string' ? gen.lastRunAt : null,
          lastRunHash: typeof gen.lastRunHash === 'string' ? gen.lastRunHash : null,
          dirty: gen.dirty === true,
          manualEdits: Array.isArray(gen.manualEdits) ? gen.manualEdits.filter((x) => typeof x === 'string') as string[] : [],
        }
      : null,
    globalColorMetricKey: typeof src.globalColorMetricKey === 'string' ? src.globalColorMetricKey : null,
    globalColorMetricConfig: src.globalColorMetricConfig ?? null,
    colorTestValue: Number(src.colorTestValue) || 50,
    interfaceHighlightPreview: clamp01(src.interfaceHighlightPreview, 0),
  };
}

/** Persist v3 plus the Y-up scene-unit mirrors legacy readers already consume. */
export function serializeWithMirrors(model: VisualModel): VisualModel {
  const normalized = normalizeModel(model);
  for (const shape of normalized.shapes) applyMirrors(shape);
  return normalized;
}

export function cloneModel(model: VisualModel): VisualModel {
  return JSON.parse(JSON.stringify(model)) as VisualModel;
}

export function findShape(model: VisualModel, id: string): ShapeDef | undefined {
  return model.shapes.find((s) => s.id === id);
}

export function ancestorHidden(model: VisualModel, shape: ShapeDef, hidden?: ReadonlySet<string>): boolean {
  const seen = new Set<string>();
  let current: ShapeDef | undefined = shape;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.visible === false) return true;
    if (hidden && hidden.has(current.id)) return true;
    current = current.parentId ? findShape(model, current.parentId) : undefined;
  }
  return false;
}
