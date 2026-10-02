import { describe, expect, it } from 'vitest';
import { buildingStoreys, defaultBuildingModel, shapesHiddenByLayers } from './building';
import { normalizeModel } from './schema';

describe('default building', () => {
  it('has one floor slab, one wall, and keeps the map layer', () => {
    const model = defaultBuildingModel({ layerId: 'layer-level-0' });
    const again = normalizeModel(JSON.parse(JSON.stringify(model)));
    const floor = again.shapes.find((shape) => shape.id === 'floor-1');
    const slab = again.shapes.find((shape) => shape.id === 'floor-1-slab');
    const wall = again.shapes.find((shape) => shape.id === 'floor-1-wall');
    expect(floor?.type).toBe('group');
    expect(floor?.layerId).toBe('layer-level-0');
    expect(slab?.surface).toBe('floor');
    expect(wall?.surface).toBe('wall');
    const storeys = buildingStoreys(again);
    expect(storeys).toHaveLength(1);
    expect(storeys[0]?.topMm).toBeCloseTo(200, 3);
    expect(shapesHiddenByLayers(again, new Set(['layer-level-0']))).toEqual(
      expect.arrayContaining(['floor-1', 'floor-1-slab', 'floor-1-wall']),
    );
    expect(shapesHiddenByLayers(again, new Set(['layer-level-1']))).toEqual([]);
  });
});
