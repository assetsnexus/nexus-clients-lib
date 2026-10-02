import { shapeHalfExtents } from './geometry';
import {
  type ShapeDef,
  type VisualModel,
  findShape,
  normalizeModel,
  serializeWithMirrors,
} from './schema';
import { type Vec3, vec } from './units';

/** Ground floor slab: 8 m × 8 m × 0.2 m. */
export const BUILDING_FLOOR_MM = Object.freeze({ widthMm: 8000, depthMm: 8000, heightMm: 200 });
/** One wall along the back edge (−Y), 8 m long and 3 m tall. */
export const BUILDING_WALL_MM = Object.freeze({ widthMm: 8000, depthMm: 200, heightMm: 3000 });

export const BUILDING_FOOTPRINT_M = Object.freeze({
  width: BUILDING_FLOOR_MM.widthMm / 1000,
  length: BUILDING_FLOOR_MM.depthMm / 1000,
  height: (BUILDING_FLOOR_MM.heightMm + BUILDING_WALL_MM.heightMm) / 1000,
});

export interface BuildingStorey {
  id: string;
  name: string;
  layerId: string | null;
  /** Walkable top, millimetres above the model origin. */
  topMm: number;
  centerMm: Vec3;
  halfMm: Vec3;
}

/**
 * One floor group, one slab, one wall. The floor's `layerId` is what the
 * cluster layers filter shows and hides. Further storeys are more groups.
 */
export function defaultBuildingModel(opts: { layerId?: string | null } = {}): VisualModel {
  const layerId = opts.layerId || 'layer-level-0';
  const floorH = BUILDING_FLOOR_MM.heightMm;
  const wallH = BUILDING_WALL_MM.heightMm;
  const wallD = BUILDING_WALL_MM.depthMm;
  const depth = BUILDING_FLOOR_MM.depthMm;
  return serializeWithMirrors(normalizeModel({
    schemaVersion: 3,
    shapes: [
      {
        id: 'floor-1',
        type: 'group',
        name: 'Floor 1',
        surface: 'floor',
        layerId,
        positionMm: { x: 0, y: 0, z: 0 },
      },
      {
        id: 'floor-1-slab',
        type: 'box',
        name: 'Floor 1',
        parentId: 'floor-1',
        surface: 'floor',
        layerId,
        positionMm: { x: 0, y: 0, z: floorH / 2 },
        dimensionsMm: { ...BUILDING_FLOOR_MM },
        color: '#c5c1b7',
      },
      {
        id: 'floor-1-wall',
        type: 'box',
        name: 'Wall',
        parentId: 'floor-1',
        surface: 'wall',
        layerId,
        positionMm: { x: 0, y: -(depth / 2 - wallD / 2), z: floorH + wallH / 2 },
        dimensionsMm: { ...BUILDING_WALL_MM },
        color: '#d9d3c7',
      },
    ],
  }));
}

/** Translation of a shape in model space, including parents. Rotations stay on the shape. */
export function worldTranslationMm(model: VisualModel, shape: ShapeDef): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  const seen = new Set<string>();
  let current: ShapeDef | undefined = shape;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    x += current.positionMm.x;
    y += current.positionMm.y;
    z += current.positionMm.z;
    current = current.parentId ? findShape(model, current.parentId) : undefined;
  }
  return vec(x, y, z);
}

/** Walkable slabs (surface floor, not the group). Ordered by height. */
export function buildingStoreys(model: VisualModel | null | undefined): BuildingStorey[] {
  const normalized = normalizeModel(model || {});
  const rows: BuildingStorey[] = [];
  for (const shape of normalized.shapes) {
    if (!shape || shape.type === 'group' || shape.surface !== 'floor') continue;
    const centerMm = worldTranslationMm(normalized, shape);
    const halfMm = shapeHalfExtents(shape);
    rows.push({
      id: shape.id,
      name: shape.name || 'Floor',
      layerId: shape.layerId,
      topMm: centerMm.z + halfMm.z,
      centerMm,
      halfMm,
    });
  }
  rows.sort((a, b) => a.topMm - b.topMm);
  return rows;
}

/**
 * Shape ids whose layer is hidden. The renderer already hides descendants,
 * so only the shapes that carry the hidden layerId are returned.
 */
export function shapesHiddenByLayers(
  model: { shapes?: Array<{ id?: string; layerId?: string | null }> } | null | undefined,
  hiddenLayerIds: ReadonlySet<string>,
): string[] {
  if (!model || !hiddenLayerIds || hiddenLayerIds.size === 0) return [];
  const ids: string[] = [];
  for (const shape of model.shapes || []) {
    if (shape && shape.id && shape.layerId && hiddenLayerIds.has(shape.layerId)) ids.push(shape.id);
  }
  return ids;
}
