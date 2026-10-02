import { describe, expect, it } from 'vitest';
import { exportModel, readGlbTranslations, writeDae, writeDxf, writeObj } from './export-model';
import { checkGeneratorScript } from './generator';
import { cornerCandidates, elevationForFootprint, snapPoint, stretchShape } from './geometry';
import { createHistory, editHistoryParams, pushHistory, undoHistory } from './history';
import { importProfiles, registerCadAdapter } from './import-model';
import { applyOps } from './ops';
import { outlineModel, userDeltaLines } from './outline';
import { compositionToRig, rigToComposition } from './rig';
import { ancestorHidden, normalizeModel, serializeWithMirrors } from './schema';
import { nearlyEqualMm, yUpSceneToZUpMm, zUpEulerToYUpEuler, zUpMmToYUpMetres } from './units';

describe('frame', () => {
  it('round-trips a sub-millimetre offset through mirrors and glb', () => {
    const model = normalizeModel({
      schemaVersion: 3,
      shapes: [{ id: 'pin', type: 'box', name: 'pin', positionMm: { x: 0.001, y: 0, z: 0 }, dimensionsMm: { widthMm: 10, heightMm: 10, depthMm: 10 } }],
    });
    const saved = serializeWithMirrors(model);
    const loaded = normalizeModel(JSON.parse(JSON.stringify(saved)));
    expect(nearlyEqualMm(loaded.shapes[0]!.positionMm.x, 0.001)).toBe(true);
    const glb = exportModel(saved, 'glb').glb!;
    const [x, y, z] = readGlbTranslations(glb)[0]!;
    const back = zUpMmToYUpMetres(loaded.shapes[0]!.positionMm);
    expect(Math.abs(x - back.x)).toBeLessThan(1e-9);
    expect(Math.abs(y - back.y)).toBeLessThan(1e-9);
    expect(Math.abs(z - back.z)).toBeLessThan(1e-9);
  });

  it('migrates a v1 Y-up scene pose into Z-up millimetres and writes mirrors back', () => {
    const v1 = { shapes: [{ id: 'a', type: 'box', position: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 0, z: 0 }, dimensionsMm: { widthMm: 100, heightMm: 200, depthMm: 300 } }] };
    const canon = normalizeModel(v1);
    expect(canon.shapes[0]!.positionMm).toEqual(yUpSceneToZUpMm({ x: 1, y: 2, z: 3 }));
    const saved = serializeWithMirrors(canon);
    expect(saved.shapes[0]!.position.x).toBeCloseTo(1, 4);
    expect(saved.shapes[0]!.position.y).toBeCloseTo(2, 4);
    expect(saved.schemaVersion).toBe(3);
    expect(saved.shapes[0]!.sourceModelId).toBeNull();
  });

  it('keeps sourceModelId', () => {
    const model = normalizeModel({ schemaVersion: 1, shapes: [{ id: 'din', type: 'box', sourceModelId: 'model-din-mcb-2m', position: { x: 0, y: 0, z: 0 } }] });
    expect(model.shapes[0]!.sourceModelId).toBe('model-din-mcb-2m');
  });
});

describe('ops', () => {
  it('rejects a parent cycle, a non-unit axis, and edits inside a component ref', () => {
    const base = applyOps(normalizeModel({ schemaVersion: 3, shapes: [] }), [
      { op: 'add', id: 'a', type: 'box' },
      { op: 'add', id: 'b', type: 'box', parentId: 'a' },
    ]).model;
    const cycle = applyOps(base, [{ op: 'setParent', id: 'a', parentId: 'b' }]);
    expect(cycle.warnings[0]).toMatch(/cycle/);
    const axis = applyOps(base, [{ op: 'setJoint', id: 'a', joint: { axis: { x: 2, y: 0, z: 0 } } }]);
    expect(axis.warnings[0]).toMatch(/unit/);
    const withRef = applyOps(base, [{ op: 'instance', id: 'child', productId: 'prod-1', name: 'module' }]).model;
    const stretch = applyOps(withRef, [{ op: 'stretch', id: 'child', face: 'pz', pullMm: 10 }]);
    expect(stretch.warnings[0]).toMatch(/not editable/);
    expect(stretch.model.shapes.find((s) => s.id === 'child')!.dimensionsMm).toEqual(withRef.shapes.find((s) => s.id === 'child')!.dimensionsMm);
  });

  it('keeps the opposite face fixed when a box is stretched', () => {
    const model = normalizeModel({
      schemaVersion: 3,
      shapes: [{ id: 'box', type: 'box', positionMm: { x: 0, y: 0, z: 50 }, dimensionsMm: { widthMm: 100, heightMm: 100, depthMm: 100 } }],
    });
    const before = model.shapes[0]!;
    const bottom = before.positionMm.z - before.dimensionsMm.heightMm! / 2;
    const next = stretchShape(before, 'pz', 10);
    expect(next).toBeTruthy();
    expect(next!.dimensionsMm.heightMm).toBe(110);
    expect(nearlyEqualMm(next!.positionMm.z - next!.dimensionsMm.heightMm! / 2, bottom)).toBe(true);
  });

  it('snaps to a corner unless Alt is held', () => {
    const model = normalizeModel({
      schemaVersion: 3,
      shapes: [{ id: 'a', type: 'box', positionMm: { x: 0, y: 0, z: 50 }, dimensionsMm: { widthMm: 100, heightMm: 100, depthMm: 100 } }],
    });
    const corners = cornerCandidates(model);
    const snapped = snapPoint({ point: { x: 49, y: 49, z: 99 }, stepMm: 10, altHeld: false, corners });
    expect(snapped.x).toBe(50);
    const free = snapPoint({ point: { x: 49, y: 49, z: 99 }, stepMm: 10, altHeld: true, corners });
    expect(free.x).toBeCloseTo(49, 3);
  });

  it('hides descendants of a hidden group and keeps a floor surface', () => {
    const model = applyOps(normalizeModel({}), [
      { op: 'addGroup', id: 'roof', name: 'Roof' },
      { op: 'add', id: 'tile', type: 'box', parentId: 'roof' },
      { op: 'add', id: 'slab', type: 'box', name: 'Level 1', surface: 'floor' },
      { op: 'setVisible', id: 'roof', visible: false },
    ]).model;
    const tile = model.shapes.find((s) => s.id === 'tile')!;
    expect(ancestorHidden(model, tile)).toBe(true);
    expect(model.shapes.find((s) => s.id === 'slab')!.surface).toBe('floor');
    const again = normalizeModel(JSON.parse(JSON.stringify(serializeWithMirrors(model))));
    expect(again.shapes.find((s) => s.id === 'slab')!.surface).toBe('floor');
  });
});

describe('history', () => {
  it('replays an edited pull from the before snapshot and drops redo', () => {
    const start = normalizeModel({ schemaVersion: 3, shapes: [{ id: 'box', type: 'box', positionMm: { x: 0, y: 0, z: 0 }, dimensionsMm: { widthMm: 100, heightMm: 100, depthMm: 100 } }] });
    const applied = applyOps(start, [{ op: 'stretch', id: 'box', face: 'px', pullMm: 10 }]);
    let history = pushHistory(createHistory(), applied.entries);
    const edited = editHistoryParams(history, applied.entry!.id, { pullMm: 22 });
    expect(edited.model!.shapes[0]!.dimensionsMm.widthMm).toBe(122);
    history = edited.history;
    const undone = undoHistory(history);
    expect(undone.model!.shapes[0]!.dimensionsMm.widthMm).toBe(100);
  });
});

describe('rig', () => {
  it('round-trips a rasptank-like shoulder and a hexapod coxa', () => {
    const rig = {
      grounded: true,
      joints: [
        { id: 'chassis', parentId: null, type: 'fixed', origin: { x: 0, y: 0.055, z: 0 }, visual: { shape: 'box' as const, size: [0.16, 0.07, 0.22] as [number, number, number], color: '#3d4c5c' } },
        { id: 'shoulder', parentId: 'chassis', type: 'revolute', origin: { x: 0, y: 0.13, z: 0.04 }, axis: { x: -1, y: 0, z: 0 }, restDeg: 0, invert: true, servoChannel: 0, visual: { shape: 'box' as const, size: [0.02, 0.08, 0.02] as [number, number, number] } },
        { id: 'coxa', parentId: 'chassis', type: 'revolute', origin: { x: 0.08, y: 0.04, z: 0.06 }, axis: { x: 0, y: 1, z: 0 }, restDeg: 0, visual: { shape: 'cylinder' as const, radius: 0.01, length: 0.04, axis: 'y' as const } },
      ],
    };
    const model = rigToComposition(rig);
    const back = compositionToRig(model);
    const shoulder = back.joints.find((j) => j.id === 'shoulder')!;
    expect(shoulder.parentId).toBe('chassis');
    expect(shoulder.axis!.x).toBeCloseTo(-1, 5);
    expect(shoulder.invert).toBe(true);
    expect(shoulder.origin.y).toBeCloseTo(0.13, 5);
    const coxa = back.joints.find((j) => j.id === 'coxa')!;
    expect(coxa.axis!.y).toBeCloseTo(1, 5);
    expect(zUpEulerToYUpEuler({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('export and dxf import', () => {
  it('writes dae, obj and dxf, and reads a polyline back into a prism', () => {
    const model = normalizeModel({ schemaVersion: 3, shapes: [{ id: 'cab', type: 'box', name: 'cabinet', positionMm: { x: 0, y: 0, z: 400 }, dimensionsMm: { widthMm: 600, heightMm: 800, depthMm: 250 } }] });
    expect(writeDae(model)).toContain('Z_UP');
    expect(writeObj(model)).toContain('cabinet');
    expect(writeDxf(model)).toContain('LWPOLYLINE');
    const dxf = ['0', 'SECTION', '2', 'ENTITIES', '0', 'LWPOLYLINE', '90', '4', '70', '1', '10', '0', '20', '0', '10', '100', '20', '0', '10', '100', '20', '40', '10', '0', '20', '40', '0', 'ENDSEC', '0', 'EOF'].join('\n');
    const profiles = importProfiles('dxf', dxf);
    expect(profiles[0]!.pointsMm).toHaveLength(4);
    const prism = applyOps(normalizeModel({}), [{ op: 'addPrism', id: 'rail', profile: { pointsMm: profiles[0]!.pointsMm, depthMm: 7.5 }, name: 'din' }]);
    expect(prism.warnings).toEqual([]);
    expect(prism.model.shapes[0]!.profile!.depthMm).toBe(7.5);
  });

  it('refuses ifc export and accepts a registered adapter slot', () => {
    expect(() => exportModel(normalizeModel({}), 'ifc')).toThrow(/not supported yet/);
    registerCadAdapter({ format: 'ifc', load: async () => ({ boundsMm: { widthMm: 1, heightMm: 1, depthMm: 1 }, elements: [] }) });
  });
});

describe('generator deny list', () => {
  it('rejects storage, location.href and computed access', () => {
    expect(checkGeneratorScript('api.box({ name: "a", sizeMm: [1,1,1] })').ok).toBe(true);
    expect(checkGeneratorScript('localStorage.setItem("a","b")').ok).toBe(false);
    expect(checkGeneratorScript('location.href = "https://evil"').ok).toBe(false);
    expect(checkGeneratorScript('obj["fetch"]()').ok).toBe(false);
  });
});

describe('outline and zones', () => {
  it('reports axes and skips agent lines in the user delta', () => {
    const model = applyOps(normalizeModel({}), [{ op: 'add', id: 'slab', type: 'box', surface: 'floor', name: 'Floor' }]).model;
    const outline = outlineModel(model);
    expect(outline.axes.up).toBe('Z');
    expect(outline.shapes[0]!.editable).toBe(true);
    const delta = userDeltaLines(['move "door" by 22, 0, 44 mm']);
    expect(delta).toContain('move "door"');
    expect(delta).not.toContain('agent');
  });

  it('lifts an asset onto the highest containing floor zone', () => {
    const z = elevationForFootprint(
      [
        { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], elevationM: 3.2 },
        { points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }], elevationM: 0 },
      ],
      1,
      1,
    );
    expect(z).toBe(3.2);
    expect(elevationForFootprint([{ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }], 5, 5)).toBe(0);
  });
});
