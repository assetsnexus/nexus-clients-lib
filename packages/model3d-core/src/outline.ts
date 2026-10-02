import { modelBoundsMm } from './geometry';
import { compareChunks } from './generator-chunks';
import { OPAQUE_TYPES, type VisualModel } from './schema';

export interface OutlineShape {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  visible: boolean;
  surface: string | null;
  dimensionsMm: Record<string, number>;
  positionMm: { x: number; y: number; z: number };
  rotationDeg: { x: number; y: number; z: number };
  jointAxis: { x: number; y: number; z: number } | null;
  material: { color: string; textureFileId: string | null };
  represents: { productId: string | null; slotId: string | null; slotInstanceId: string | null } | null;
  editable: boolean;
  reason: string | null;
}

export interface ModelOutline {
  spatialContext: VisualModel['spatialContext'];
  axes: {
    up: 'Z';
    forward: '+Y';
    right: '+X';
    unit: 'MILLIMETRE';
    note: string;
  };
  bounds: ReturnType<typeof modelBoundsMm>;
  shapes: OutlineShape[];
  interfaces: Array<{ interfaceId: string; shapeId: string; side: string | null; medium: string | null }>;
  networks: Array<{ id: string; name: string; type: string; kind: string; edges: Array<{ id: string; fromInterfaceId: string; toInterfaceId: string }> }>;
  generator: {
    dirty: boolean;
    hasSource: boolean;
    manualEdits: string[];
    /** Authoring index only. These records are not shapes and have no parentId. */
    chunks: Array<{ id: string; order: number; title: string; description: string }>;
    note: string;
  } | null;
}

export function outlineModel(model: VisualModel): ModelOutline {
  return {
    spatialContext: model.spatialContext,
    axes: {
      up: 'Z',
      forward: '+Y',
      right: '+X',
      unit: 'MILLIMETRE',
      note: 'Origin at the footprint centre on the ground. Rotations are degrees, XYZ, in the parent frame. joint.restDeg 0 is the authored pose.',
    },
    bounds: modelBoundsMm(model),
    interfaces: (model.interfaceMarkers || [])
      .filter((marker) => marker.interfaceId && marker.shapeId)
      .map((marker) => ({
        interfaceId: marker.interfaceId,
        shapeId: marker.shapeId as string,
        side: marker.side,
        medium: marker.medium,
      })),
    networks: (model.networks || []).map((network) => ({
      id: network.id,
      name: network.name,
      type: network.type,
      kind: network.kind,
      edges: network.edges.map((edge) => ({
        id: edge.id,
        fromInterfaceId: edge.fromInterfaceId,
        toInterfaceId: edge.toInterfaceId,
      })),
    })),
    shapes: model.shapes.map((shape) => {
      const opaque = OPAQUE_TYPES.has(shape.type);
      return {
        id: shape.id,
        name: shape.name,
        type: shape.type,
        parentId: shape.parentId,
        visible: shape.visible,
        surface: shape.surface,
        dimensionsMm: shape.dimensionsMm,
        positionMm: shape.positionMm,
        rotationDeg: shape.rotationDeg,
        jointAxis: shape.joint ? shape.joint.axis : null,
        material: { color: shape.material.color, textureFileId: shape.material.textureFileId },
        represents: shape.represents
          ? { productId: shape.represents.productId, slotId: shape.represents.slotId, slotInstanceId: shape.represents.slotInstanceId }
          : null,
        editable: !opaque,
        reason: opaque ? `${shape.type} internals are not editable` : null,
      };
    }),
    generator: model.generator
      ? {
          dirty: model.generator.dirty,
          hasSource: !!(model.generator.source || (model.generator.chunks || []).some((chunk) => chunk.source)),
          manualEdits: model.generator.manualEdits.slice(-40),
          chunks: [...(model.generator.chunks || [])].sort(compareChunks).map((chunk) => ({
            id: chunk.id,
            order: chunk.order,
            title: chunk.title,
            description: chunk.description,
          })),
          note: 'Chunk order is script authoring structure, not the model object tree. Titles are ignored when the script runs.',
        }
      : null,
  };
}

export function userDeltaLines(lines: string[], cap = 40): string {
  const sliced = lines.slice(-cap);
  if (!sliced.length) return '';
  return ['User model edits since your last turn:', ...sliced.map((line) => `- ${line}`)].join('\n');
}
