import { ancestorHidden, type ShapeDef, type VisualModel } from './schema';
import { deg2rad } from './units';

/**
 * Minimal structural type so this module never imports three.
 * Callers pass the THREE namespace they already loaded (0.128 or 0.180).
 */
export interface ThreeLike {
  Group: new () => ThreeObject;
  Mesh: new (geo: unknown, mat: unknown) => ThreeObject;
  BoxGeometry: new (w: number, h: number, d: number) => unknown;
  SphereGeometry: new (r: number, w: number, h: number) => unknown;
  CylinderGeometry: new (rt: number, rb: number, h: number, seg: number) => unknown;
  MeshStandardMaterial: new (params: Record<string, unknown>) => unknown;
  DoubleSide: number;
}

export interface ThreeObject {
  add: (child: ThreeObject) => void;
  position: { set: (x: number, y: number, z: number) => void };
  rotation: { set: (x: number, y: number, z: number) => void; x: number };
  scale?: { set: (x: number, y: number, z: number) => void };
  userData: Record<string, unknown>;
  name: string;
}

export interface BuildModelOptions {
  /** Session hides. Does not write the composition. */
  hiddenIds?: ReadonlySet<string>;
  resolveTextureUrl?: (fileId: string) => string | null;
  sceneUnitPerMm?: number;
}

const UNIT = 1 / 100;

function materialParams(shape: ShapeDef, faceColor?: string): Record<string, unknown> {
  return {
    color: faceColor || shape.material.color || shape.color,
    transparent: true,
    opacity: shape.material.opacity ?? shape.opacity ?? 0.92,
    metalness: shape.material.metalness,
    roughness: shape.material.roughness,
  };
}

function addShape(THREE: ThreeLike, shape: ShapeDef, opts: BuildModelOptions): ThreeObject {
  const group = new THREE.Group();
  group.name = shape.name;
  group.userData = {
    shapeId: shape.id,
    shapeType: shape.type,
    surface: shape.surface,
    editable: shape.type !== 'model' && shape.type !== 'cad_ref' && shape.type !== 'component_ref',
    textureUrl: shape.material.textureFileId && opts.resolveTextureUrl ? opts.resolveTextureUrl(shape.material.textureFileId) : null,
  };
  const p = shape.positionMm;
  group.position.set(p.x * UNIT, p.y * UNIT, p.z * UNIT);
  const r = shape.rotationDeg;
  group.rotation.set(deg2rad(r.x), deg2rad(r.y), deg2rad(r.z));
  if (shape.type === 'group') return group;

  const d = shape.dimensionsMm;
  let mesh: ThreeObject | null = null;
  if (shape.type === 'sphere') {
    const radius = ((d.diameterMm || 100) / 2) * UNIT;
    mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), new THREE.MeshStandardMaterial(materialParams(shape)));
  } else if (shape.type === 'cylinder' || shape.type === 'disk' || shape.type === 'tube') {
    const radius = (d.radiusMm || d.outerRadiusMm || 50) * UNIT;
    const height = (shape.type === 'disk' ? d.thicknessMm : d.heightMm || 100) * UNIT;
    const geo = new THREE.CylinderGeometry(radius, radius, height, 24);
    mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial(materialParams(shape)));
    mesh.rotation.x = Math.PI / 2;
  } else if (shape.type === 'prism' && shape.profile) {
    const depth = shape.profile.depthMm * UNIT;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const [u, v] of shape.profile.pointsMm) {
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const w = Math.max(0.001, (maxU - minU) * UNIT);
    const dep = Math.max(0.001, (maxV - minV) * UNIT);
    mesh = new THREE.Mesh(new THREE.BoxGeometry(w, dep, Math.max(0.001, depth)), new THREE.MeshStandardMaterial(materialParams(shape)));
  } else {
    const bounds = shape.cad?.boundsMm;
    const w = (bounds?.widthMm || d.widthMm || 100) * UNIT;
    const dep = (bounds?.depthMm || d.depthMm || 100) * UNIT;
    const h = (bounds?.heightMm || d.heightMm || 100) * UNIT;
    const mats = ['px', 'nx', 'py', 'ny', 'pz', 'nz'].map((key) => {
      const face = shape.faces[key as 'px'];
      return new THREE.MeshStandardMaterial(materialParams(shape, face?.color));
    });
    mesh = new THREE.Mesh(new THREE.BoxGeometry(w, dep, h), mats);
  }
  if (mesh) {
    mesh.userData = { ...group.userData };
    group.add(mesh);
  }
  return group;
}

/**
 * One renderer for the editor, cluster BIM and Play.
 * Children live in Z-up scene units. The basis group rotates −90° about X so Three's Y-up world matches.
 */
export function buildModelGroup(THREE: ThreeLike, model: VisualModel, opts: BuildModelOptions = {}): ThreeObject {
  const hidden = opts.hiddenIds;
  const basis = new THREE.Group();
  basis.name = 'anx-z-up-basis';
  basis.rotation.x = -Math.PI / 2;
  basis.userData = { composition: true, upAxis: 'Z' };
  const nodes = new Map<string, ThreeObject>();
  for (const shape of model.shapes) {
    if (ancestorHidden(model, shape, hidden)) continue;
    nodes.set(shape.id, addShape(THREE, shape, opts));
  }
  for (const shape of model.shapes) {
    const node = nodes.get(shape.id);
    if (!node) continue;
    const parent = shape.parentId ? nodes.get(shape.parentId) : undefined;
    if (parent) parent.add(node);
    else basis.add(node);
  }
  return basis;
}
