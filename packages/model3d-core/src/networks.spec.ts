import { describe, expect, it } from 'vitest';
import { applyOps } from './ops';
import { buildModelGroup } from './three-group';
import { outlineModel } from './outline';
import { networkRouteSegments, routeBetween } from './networks';
import { normalizeModel } from './schema';

function fakeThree() {
  const object = () => ({
    children: [] as unknown[],
    name: '',
    userData: {} as Record<string, unknown>,
    position: { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; } },
    rotation: { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; } },
    add(child: unknown) { this.children.push(child); },
  });
  return {
    Group: function Group() { return object(); },
    Mesh: function Mesh() { return object(); },
    BoxGeometry: function BoxGeometry() { return {}; },
    SphereGeometry: function SphereGeometry() { return {}; },
    CylinderGeometry: function CylinderGeometry(_rt: number, _rb: number, height: number) { return { height }; },
    MeshStandardMaterial: function MeshStandardMaterial() { return {}; },
    DoubleSide: 2,
  };
}

function cabinet() {
  return applyOps(normalizeModel({ schemaVersion: 3, shapes: [] }), [
    { op: 'addGroup', id: 'floor', name: 'Floor 1', positionMm: { x: 0, y: 0, z: 0 } },
    { op: 'add', id: 'shell', type: 'box', name: 'Shell', parentId: 'floor', positionMm: { x: 0, y: 0, z: 400 } },
    { op: 'add', id: 'jack-a', type: 'box', name: 'Jack A', parentId: 'floor', positionMm: { x: -200, y: 40, z: 80 } },
    { op: 'add', id: 'jack-b', type: 'box', name: 'Jack B', parentId: 'floor', positionMm: { x: 200, y: 40, z: 80 } },
    { op: 'add', id: 'jack-c', type: 'box', name: 'Jack C', parentId: 'floor', positionMm: { x: 0, y: 40, z: 200 } },
    { op: 'add', id: 'tap', type: 'box', name: 'Tap', parentId: 'floor', positionMm: { x: 0, y: -80, z: 40 } },
  ]).model;
}

describe('composition interfaces and networks', () => {
  it('does not treat a mesh or a chunk id as an interface', () => {
    const model = cabinet();
    expect(model.shapes.find((shape) => shape.id === 'shell')!.linkedInterfaceIds).toEqual([]);
    const missed = applyOps(model, [
      { op: 'markInterface', interfaceId: 'eth0' },
      { op: 'addNetwork', id: 'lan', medium: 'ethernet', kind: 'point_to_point' },
      { op: 'addEdge', networkId: 'lan', fromInterfaceId: 'chunk-ports', toInterfaceId: 'eth0' },
    ]);
    expect(missed.warnings[0]).toMatch(/requires a shape id/);
    expect(missed.warnings.join(' ')).toMatch(/missing interface "chunk-ports"/);
    expect(missed.model.interfaceMarkers).toEqual([]);
  });

  it('marks only the shape the interface op names', () => {
    const marked = applyOps(cabinet(), [
      { op: 'markInterface', shapeId: 'jack-a', interfaceId: 'eth0', side: 'female', medium: 'ethernet', label: 'LAN' },
    ]);
    expect(marked.warnings).toEqual([]);
    const jack = marked.model.shapes.find((shape) => shape.id === 'jack-a')!;
    const shell = marked.model.shapes.find((shape) => shape.id === 'shell')!;
    expect(jack.linkedInterfaceIds).toEqual(['eth0']);
    expect(shell.linkedInterfaceIds).toEqual([]);
    expect(marked.model.interfaceMarkers[0]).toMatchObject({ interfaceId: 'eth0', shapeId: 'jack-a', side: 'female', medium: 'ethernet' });
    const again = normalizeModel(JSON.parse(JSON.stringify(marked.model)));
    expect(again.interfaceMarkers[0]!.shapeId).toBe('jack-a');
  });

  it('accepts one point-to-point edge and draws it between the two interfaces', () => {
    const base = applyOps(cabinet(), [
      { op: 'markInterface', shapeId: 'jack-a', interfaceId: 'eth0', side: 'female', medium: 'ethernet' },
      { op: 'markInterface', shapeId: 'jack-b', interfaceId: 'eth1', side: 'male', medium: 'ethernet' },
      { op: 'addNetwork', id: 'lan', name: 'LAN', medium: 'ethernet', kind: 'point_to_point' },
      { op: 'addEdge', id: 'lan-edge', networkId: 'lan', fromInterfaceId: 'eth0', toInterfaceId: 'eth1' },
    ]);
    expect(base.warnings).toEqual([]);
    const lines = networkRouteSegments(base.model);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ fromInterfaceId: 'eth0', toInterfaceId: 'eth1', fromShapeId: 'jack-a', toShapeId: 'jack-b' });
    expect(lines[0]!.fromMm).toEqual({ x: -200, y: 40, z: 80 });
    expect(lines[0]!.toMm).toEqual({ x: 200, y: 40, z: 80 });
    const group = buildModelGroup(fakeThree() as never, base.model);
    const cable = (group.children as Array<{ userData: Record<string, unknown> }>).find((child) => child.userData.pickKind === 'edge');
    expect(cable!.userData.fromMm).toEqual(lines[0]!.fromMm);
    expect(cable!.userData.toMm).toEqual(lines[0]!.toMm);
    const outline = outlineModel(base.model);
    expect(outline.interfaces.map((row) => row.interfaceId)).toEqual(['eth0', 'eth1']);
    expect(outline.networks[0]!.edges[0]).toMatchObject({ fromInterfaceId: 'eth0', toInterfaceId: 'eth1' });
    expect(outline.generator).toBeNull();
  });

  it('grows a bus as a tree and routes along those edges', () => {
    const bus = applyOps(cabinet(), [
      { op: 'markInterface', shapeId: 'jack-a', interfaceId: 'a', side: 'terminal', medium: 'rs485' },
      { op: 'markInterface', shapeId: 'jack-b', interfaceId: 'b', side: 'terminal', medium: 'data-bus' },
      { op: 'markInterface', shapeId: 'jack-c', interfaceId: 'c', side: 'terminal', medium: 'serial' },
      { op: 'addNetwork', id: 'modbus', name: 'RS485', medium: 'ethernet', kind: 'bus' },
      { op: 'addEdge', id: 'e-ab', networkId: 'modbus', fromInterfaceId: 'a', toInterfaceId: 'b' },
      { op: 'addEdge', id: 'e-bc', networkId: 'modbus', fromInterfaceId: 'b', toInterfaceId: 'c' },
    ]);
    expect(bus.warnings).toEqual([]);
    expect(bus.model.networks[0]!.kind).toBe('shared_multidrop');
    expect(routeBetween(bus.model, 'modbus', 'a', 'c')).toEqual(['a', 'b', 'c']);
    const lines = networkRouteSegments(bus.model);
    expect(lines.map((line) => [line.fromInterfaceId, line.toInterfaceId])).toEqual([['a', 'b'], ['b', 'c']]);
    expect(lines.every((line) => line.fromShapeId !== 'chunk-bus')).toBe(true);
  });

  it('rejects a second point-to-point edge, a cycle, a disconnected bus edge, a duplicate, the wrong side, and an illegal pair', () => {
    const ready = applyOps(cabinet(), [
      { op: 'markInterface', shapeId: 'jack-a', interfaceId: 'eth0', side: 'female', medium: 'ethernet' },
      { op: 'markInterface', shapeId: 'jack-b', interfaceId: 'eth1', side: 'male', medium: 'ethernet' },
      { op: 'markInterface', shapeId: 'jack-c', interfaceId: 'eth2', side: 'terminal', medium: 'ethernet' },
      { op: 'markInterface', shapeId: 'tap', interfaceId: 'water-out', side: 'male', medium: 'water' },
      { op: 'addNetwork', id: 'lan', medium: 'ethernet', kind: 'point_to_point' },
      { op: 'addEdge', networkId: 'lan', fromInterfaceId: 'eth0', toInterfaceId: 'eth1' },
      { op: 'addNetwork', id: 'bus', medium: 'ethernet', kind: 'shared_multidrop' },
      { op: 'addEdge', networkId: 'bus', fromInterfaceId: 'eth0', toInterfaceId: 'eth1' },
    ]).model;
    const rejected = applyOps(ready, [
      { op: 'addEdge', networkId: 'lan', fromInterfaceId: 'eth1', toInterfaceId: 'eth2' },
      { op: 'addEdge', networkId: 'bus', fromInterfaceId: 'eth1', toInterfaceId: 'eth0' },
      { op: 'addEdge', networkId: 'bus', fromInterfaceId: 'eth2', toInterfaceId: 'water-out' },
      { op: 'addEdge', id: 'spur', networkId: 'bus', fromInterfaceId: 'eth0', toInterfaceId: 'eth1' },
      { op: 'markInterface', shapeId: 'shell', interfaceId: 'plug', side: 'male', medium: 'ethernet' },
      { op: 'addEdge', networkId: 'bus', fromInterfaceId: 'eth2', toInterfaceId: 'plug' },
      { op: 'addEdge', networkId: 'bus', fromInterfaceId: 'eth1', toInterfaceId: 'plug' },
      { op: 'addEdge', networkId: 'bus', fromInterfaceId: 'missing', toInterfaceId: 'eth0' },
      { op: 'addNetwork', id: 'radio', medium: 'wifi', kind: 'bus' },
    ]);
    const text = rejected.warnings.join('\n');
    expect(text).toMatch(/point-to-point network "lan" already has an edge/);
    expect(text).toMatch(/duplicate edge between "eth1" and "eth0"/);
    expect(text).toMatch(/illegal pair/);
    expect(text).toMatch(/wrong side/);
    expect(text).toMatch(/disconnected endpoint/);
    expect(text).toMatch(/missing interface "missing"/);
    expect(text).toMatch(/radio network and has no cable tree/);
    expect(rejected.model.networks.find((network) => network.id === 'lan')!.edges).toHaveLength(1);
    expect(rejected.model.networks.find((network) => network.id === 'bus')!.edges).toHaveLength(1);
    const grown = applyOps(rejected.model, [
      { op: 'addEdge', networkId: 'bus', fromInterfaceId: 'eth1', toInterfaceId: 'eth2' },
    ]);
    expect(grown.warnings).toEqual([]);
    expect(routeBetween(grown.model, 'bus', 'eth0', 'eth2')).toEqual(['eth0', 'eth1', 'eth2']);
    const cycle = applyOps(grown.model, [
      { op: 'addEdge', networkId: 'bus', fromInterfaceId: 'eth0', toInterfaceId: 'eth2' },
    ]);
    expect(cycle.warnings[0]).toMatch(/cycles bus "bus"/);
    expect(cycle.model.networks.find((network) => network.id === 'bus')!.edges).toHaveLength(2);
  });

  it('allows a wifi point-to-point link and keeps a parent offset on the endpoint', () => {
    const model = applyOps(normalizeModel({ schemaVersion: 3, shapes: [] }), [
      { op: 'addGroup', id: 'roof', positionMm: { x: 0, y: 0, z: 3000 } },
      { op: 'add', id: 'ap', type: 'box', parentId: 'roof', positionMm: { x: 10, y: 0, z: 0 } },
      { op: 'add', id: 'sta', type: 'box', parentId: 'roof', positionMm: { x: -10, y: 20, z: 0 } },
      { op: 'markInterface', shapeId: 'ap', interfaceId: 'hotspot', side: 'terminal', medium: 'wifi' },
      { op: 'markInterface', shapeId: 'sta', interfaceId: 'client', side: 'terminal', medium: 'wifi' },
      { op: 'addNetwork', id: 'wlan', medium: 'wifi', kind: 'point_to_point' },
      { op: 'addEdge', networkId: 'wlan', fromInterfaceId: 'hotspot', toInterfaceId: 'client' },
    ]);
    expect(model.warnings).toEqual([]);
    const [line] = networkRouteSegments(model.model);
    expect(line!.fromMm).toEqual({ x: 10, y: 0, z: 3000 });
    expect(line!.toMm).toEqual({ x: -10, y: 20, z: 3000 });
  });
});
