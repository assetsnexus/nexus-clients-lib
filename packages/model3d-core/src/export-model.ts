import { shapeAabb } from './geometry';
import { type ShapeDef, type VisualModel } from './schema';
import { zUpMmToYUpMetres } from './units';

export type ExportFormat = 'glb' | 'dae' | 'obj' | 'dxf' | 'ifc' | 'step';

const IMPLEMENTED = new Set<ExportFormat>(['glb', 'dae', 'obj', 'dxf']);

export class ExportNotSupportedError extends Error {
  constructor(format: string) {
    super(`Export format "${format}" is not supported yet`);
    this.name = 'ExportNotSupportedError';
  }
}

export interface ExportResult {
  format: ExportFormat;
  text?: string;
  glb?: Uint8Array;
  warnings: string[];
}

function solidShapes(model: VisualModel): ShapeDef[] {
  return model.shapes.filter((s) => s.type !== 'group' && s.type !== 'component_ref');
}

function boxCorners(shape: ShapeDef): Array<[number, number, number]> {
  const box = shapeAabb(shape);
  const xs = [box.min.x, box.max.x];
  const ys = [box.min.y, box.max.y];
  const zs = [box.min.z, box.max.z];
  const out: Array<[number, number, number]> = [];
  for (const x of xs) for (const y of ys) for (const z of zs) out.push([x, y, z]);
  return out;
}

/** Collada, Z-up, millimetres. SketchUp imports DAE. */
export function writeDae(model: VisualModel): string {
  const geometries: string[] = [];
  const nodes: string[] = [];
  solidShapes(model).forEach((shape, index) => {
    const id = `geom_${index}`;
    const corners = boxCorners(shape);
    const positions = corners.map((c) => c.join(' ')).join(' ');
    geometries.push(
      `<geometry id="${id}" name="${escapeXml(shape.name)}"><mesh><source id="${id}-p"><float_array id="${id}-a" count="${corners.length * 3}">${positions}</float_array><technique_common><accessor source="#${id}-a" count="${corners.length}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source><vertices id="${id}-v"><input semantic="POSITION" source="#${id}-p"/></vertices><triangles count="0"></triangles></mesh></geometry>`,
    );
    const p = shape.positionMm;
    nodes.push(`<node id="${escapeXml(shape.id)}" name="${escapeXml(shape.name)}"><translate>${p.x} ${p.y} ${p.z}</translate><instance_geometry url="#${id}"/></node>`);
  });
  return `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><unit name="millimeter" meter="0.001"/><up_axis>Z_UP</up_axis></asset>
<library_geometries>${geometries.join('')}</library_geometries>
<library_visual_scenes><visual_scene id="Scene">${nodes.join('')}</visual_scene></library_visual_scenes>
<scene><instance_visual_scene url="#Scene"/></scene>
</COLLADA>`;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch] || ch));
}

/** Wavefront OBJ in Z-up millimetres. */
export function writeObj(model: VisualModel): string {
  const lines = ['# ANX composition Z-up millimetres'];
  let base = 1;
  for (const shape of solidShapes(model)) {
    lines.push(`o ${shape.name.replace(/\s+/g, '_')}`);
    const corners = boxCorners(shape);
    for (const [x, y, z] of corners) lines.push(`v ${x} ${y} ${z}`);
    lines.push(`f ${base} ${base + 1} ${base + 2} ${base + 3}`);
    base += corners.length;
  }
  return lines.join('\n') + '\n';
}

/** 2D plan (XY, Z-up identity) as DXF LWPOLYLINE entities. */
export function writeDxf(model: VisualModel): string {
  const entities: string[] = [];
  for (const shape of solidShapes(model)) {
    const box = shapeAabb(shape);
    const pts = [
      [box.min.x, box.min.y],
      [box.max.x, box.min.y],
      [box.max.x, box.max.y],
      [box.min.x, box.max.y],
    ];
    entities.push('0', 'LWPOLYLINE', '8', 'ANX', '90', '4', '70', '1');
    for (const [x, y] of pts) entities.push('10', String(x), '20', String(y));
  }
  return ['0', 'SECTION', '2', 'ENTITIES', ...entities, '0', 'ENDSEC', '0', 'EOF', ''].join('\n');
}

function pad4(bytes: Uint8Array, pad: number): Uint8Array {
  const rem = bytes.length % 4;
  if (!rem) return bytes;
  const out = new Uint8Array(bytes.length + (4 - rem));
  out.set(bytes);
  out.fill(pad, bytes.length);
  return out;
}

/** glTF is Y-up. Node translation is the frame-converted centre, in metres. */
export function writeGlb(model: VisualModel): Uint8Array {
  const nodes: Array<Record<string, unknown>> = [];
  const meshes: Array<Record<string, unknown>> = [];
  const accessors: Array<Record<string, unknown>> = [];
  const bufferViews: Array<Record<string, unknown>> = [];
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const push = (data: Uint8Array, componentType: number, count: number, type: string, min?: number[], max?: number[]) => {
    const padded = pad4(data, 0);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length });
    chunks.push(padded);
    offset += padded.length;
    const acc: Record<string, unknown> = { bufferView: bufferViews.length - 1, componentType, count, type };
    if (min) acc.min = min;
    if (max) acc.max = max;
    accessors.push(acc);
    return accessors.length - 1;
  };
  for (const shape of solidShapes(model)) {
    const centre = zUpMmToYUpMetres(shape.positionMm);
    const hx = (shape.dimensionsMm.widthMm || 100) / 2000;
    const hy = (shape.dimensionsMm.heightMm || 100) / 2000;
    const hz = (shape.dimensionsMm.depthMm || 100) / 2000;
    const positions = new Float32Array([
      -hx, -hy, -hz, hx, -hy, -hz, hx, hy, -hz, -hx, hy, -hz,
      -hx, -hy, hz, hx, -hy, hz, hx, hy, hz, -hx, hy, hz,
    ]);
    const posAcc = push(new Uint8Array(positions.buffer), 5126, 8, 'VEC3', [-hx, -hy, -hz], [hx, hy, hz]);
    const meshIndex = meshes.length;
    meshes.push({ name: shape.name, primitives: [{ attributes: { POSITION: posAcc }, mode: 0 }] });
    nodes.push({
      name: shape.name,
      mesh: meshIndex,
      translation: [centre.x, centre.y, centre.z],
    });
  }
  if (!nodes.length) return new Uint8Array();
  const bin = new Uint8Array(offset);
  let cursor = 0;
  for (const chunk of chunks) {
    bin.set(chunk, cursor);
    cursor += chunk.length;
  }
  const json = {
    asset: { version: '2.0', generator: 'ANX model3d-core' },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.length }],
  };
  const jsonBuf = pad4(new TextEncoder().encode(JSON.stringify(json)), 0x20);
  const binBuf = pad4(bin, 0);
  const total = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBuf.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBuf, 20);
  const binHeader = 20 + jsonBuf.length;
  view.setUint32(binHeader, binBuf.length, true);
  view.setUint32(binHeader + 4, 0x004e4942, true);
  out.set(binBuf, binHeader + 8);
  return out;
}

export function readGlbTranslations(glb: Uint8Array): Array<[number, number, number]> {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLength = view.getUint32(12, true);
  const jsonText = new TextDecoder().decode(glb.slice(20, 20 + jsonLength));
  const json = JSON.parse(jsonText) as { nodes?: Array<{ translation?: number[] }> };
  return (json.nodes || []).map((node) => {
    const t = node.translation || [0, 0, 0];
    return [t[0] || 0, t[1] || 0, t[2] || 0];
  });
}

export function exportModel(model: VisualModel, format: ExportFormat): ExportResult {
  if (!IMPLEMENTED.has(format)) throw new ExportNotSupportedError(format);
  if (format === 'dae') return { format, text: writeDae(model), warnings: [] };
  if (format === 'obj') return { format, text: writeObj(model), warnings: [] };
  if (format === 'dxf') return { format, text: writeDxf(model), warnings: [] };
  return { format, glb: writeGlb(model), warnings: [] };
}
