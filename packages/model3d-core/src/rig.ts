import { type ShapeDef, type VisualModel, normalizeModel } from './schema';
import { type Vec3, yUpDirToZUp, yUpSceneToZUpMm, zUpDirToYUp, zUpMmToYUpMetres } from './units';

export interface RigVisual {
  shape: 'box' | 'cylinder' | 'sphere';
  size?: [number, number, number];
  radius?: number;
  length?: number;
  axis?: 'x' | 'y' | 'z';
  color?: string;
}

export interface RigJoint {
  id: string;
  parentId: string | null;
  type: string;
  axis?: Vec3;
  origin: Vec3;
  visual?: RigVisual;
  restDeg?: number;
  metricId?: string | null;
  servoChannel?: number | null;
  invert?: boolean;
}

export interface Rig {
  procedural?: boolean;
  grounded?: boolean;
  joints: RigJoint[];
}

function dimsToVisual(shape: ShapeDef): RigVisual {
  const d = shape.dimensionsMm;
  if (shape.type === 'cylinder' || shape.type === 'disk') {
    return {
      shape: 'cylinder',
      radius: (d.radiusMm || 50) / 1000,
      length: ((shape.type === 'disk' ? d.thicknessMm : d.heightMm) || 100) / 1000,
      axis: 'z',
      color: shape.color,
    };
  }
  if (shape.type === 'sphere') {
    return { shape: 'sphere', radius: (d.diameterMm || 100) / 2000, color: shape.color };
  }
  return {
    shape: 'box',
    size: [(d.widthMm || 100) / 1000, (d.heightMm || 100) / 1000, (d.depthMm || 100) / 1000],
    color: shape.color,
  };
}

/** Composition (Z-up mm) → play rig (Y-up metres). */
export function compositionToRig(model: VisualModel): Rig {
  const joints: RigJoint[] = model.shapes
    .filter((shape) => shape.type !== 'cad_ref')
    .map((shape) => {
      const origin = zUpMmToYUpMetres(shape.positionMm);
      const joint: RigJoint = {
        id: shape.id,
        parentId: shape.parentId,
        type: shape.joint?.type || 'fixed',
        origin,
        visual: shape.type === 'group' || shape.type === 'component_ref' || shape.type === 'model' ? undefined : dimsToVisual(shape),
      };
      if (shape.joint) {
        joint.axis = zUpDirToYUp(shape.joint.axis);
        joint.restDeg = shape.joint.restDeg;
        joint.metricId = shape.joint.metricId;
        joint.servoChannel = shape.joint.servoChannel;
        joint.invert = shape.joint.invert;
      }
      return joint;
    });
  return { procedural: true, grounded: true, joints };
}

/** Play rig (Y-up metres) → editable composition. */
export function rigToComposition(rig: Rig): VisualModel {
  const shapes = (rig.joints || []).map((joint) => {
    const positionMm = yUpSceneToZUpMm({
      x: joint.origin.x / 0.1,
      y: joint.origin.y / 0.1,
      z: joint.origin.z / 0.1,
    });
    // origin is metres; scene units = metres / 0.1. yUpSceneToZUpMm expects scene units.
    const visual = joint.visual;
    let type: ShapeDef['type'] = 'box';
    const dimensionsMm: Record<string, number> = {};
    if (visual?.shape === 'cylinder') {
      type = 'cylinder';
      dimensionsMm.radiusMm = (visual.radius || 0.05) * 1000;
      dimensionsMm.heightMm = (visual.length || 0.1) * 1000;
    } else if (visual?.shape === 'sphere') {
      type = 'sphere';
      dimensionsMm.diameterMm = (visual.radius || 0.05) * 2000;
    } else if (visual?.size) {
      dimensionsMm.widthMm = visual.size[0] * 1000;
      dimensionsMm.heightMm = visual.size[1] * 1000;
      dimensionsMm.depthMm = visual.size[2] * 1000;
    }
    return {
      id: joint.id,
      type: visual ? type : 'group',
      name: joint.id,
      parentId: joint.parentId,
      positionMm,
      color: visual?.color,
      dimensionsMm,
      joint: joint.axis
        ? {
            type: joint.type || 'revolute',
            axis: yUpDirToZUp(joint.axis),
            restDeg: joint.restDeg || 0,
            metricId: joint.metricId || null,
            servoChannel: joint.servoChannel ?? null,
            invert: joint.invert === true,
          }
        : null,
    };
  });
  return normalizeModel({ schemaVersion: 3, shapes });
}

/** Fix the metres→scene comment path: origin metres to scene is / METRES_PER_SCENE_UNIT. */
export function rigOriginToPositionMm(origin: Vec3): Vec3 {
  return yUpSceneToZUpMm({
    x: origin.x / 0.1,
    y: origin.y / 0.1,
    z: origin.z / 0.1,
  });
}
