import * as acorn from 'acorn';
import { MAX_GENERATOR_SOURCE } from './validate';

const FORBIDDEN = new Set([
  'eval',
  'Function',
  'import',
  'require',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'postMessage',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'cookie',
  'document',
  'window',
  'parent',
  'top',
  'location',
  'href',
  'navigator',
  'globalThis',
  'documentElement',
]);

export interface ScriptCheck {
  ok: boolean;
  errors: string[];
}

function walk(node: unknown, errors: string[], seen: WeakSet<object>): void {
  if (!node || typeof node !== 'object') return;
  if (seen.has(node)) return;
  seen.add(node);
  const rec = node as Record<string, unknown>;
  const type = String(rec.type || '');
  if (type === 'Identifier' && FORBIDDEN.has(String(rec.name))) {
    errors.push(`forbidden identifier ${String(rec.name)}`);
  }
  if (type === 'MemberExpression' && rec.computed === true) {
    errors.push('computed member access is not allowed');
  }
  if (type === 'ImportExpression' || type === 'ImportDeclaration' || type === 'WithStatement') {
    errors.push(`forbidden syntax ${type}`);
  }
  for (const value of Object.values(rec)) {
    if (Array.isArray(value)) {
      for (const item of value) walk(item, errors, seen);
    } else if (value && typeof value === 'object' && typeof (value as { type?: string }).type === 'string') {
      walk(value, errors, seen);
    }
  }
}

/** Static deny-list. The iframe sandbox is a second layer and lives in the portal. */
export function checkGeneratorScript(source: string): ScriptCheck {
  const errors: string[] = [];
  if (typeof source !== 'string' || !source.trim()) errors.push('script is empty');
  if (source.length > MAX_GENERATOR_SOURCE) errors.push(`script exceeds ${MAX_GENERATOR_SOURCE} characters`);
  if (errors.length) return { ok: false, errors };
  let ast: acorn.Node;
  try {
    ast = acorn.parse(source, { ecmaVersion: 2022, sourceType: 'script' });
  } catch (err) {
    return { ok: false, errors: [`parse error: ${err instanceof Error ? err.message : 'invalid script'}`] };
  }
  walk(ast, errors, new WeakSet());
  const unique = [...new Set(errors)];
  return { ok: unique.length === 0, errors: unique };
}

export const GENERATOR_API_DOC = [
  'api.box({ id, name, sizeMm:[w,d,h], positionMm:{x,y,z}, rotationDeg, color, parentId, surface })',
  'api.cylinder({ id, name, radiusMm, heightMm, positionMm, rotationDeg, color, parentId })',
  'api.sphere / api.disk / api.tube / api.prism / api.group / api.instance({ id, productId, parentId })',
  'api.interface({ shapeId, interfaceId, type, side, name }) marks that shape as an interface. A mesh is not an interface without this call.',
  'api.network({ id, name, type, kind }) kind is point_to_point or bus (shared_multidrop tree).',
  'api.edge({ id, networkId, from, to }) from and to are interface ids, not shape ids or chunk ids.',
  'api.list() returns the ops created in this run',
  'Coordinates are Z-up millimetres, +Y forward, +X right. Return value is ignored; calls record ops.',
].join('\n');

/** Ops the sandboxed script is allowed to emit. The parent validates them again. */
export interface ScriptCall {
  op: 'add' | 'addGroup' | 'addPrism' | 'instance' | 'markInterface' | 'addNetwork' | 'addEdge';
  type?: string;
  name?: string;
  positionMm?: { x: number; y: number; z: number };
  rotationDeg?: { x: number; y: number; z: number };
  dimensionsMm?: Record<string, number>;
  profile?: { pointsMm: Array<[number, number]>; depthMm: number };
  color?: string;
  parentId?: string | null;
  surface?: 'floor' | 'wall' | 'roof' | null;
  productId?: string;
  shapeId?: string;
  interfaceId?: string;
  side?: string;
  medium?: string;
  networkId?: string;
  kind?: string;
  fromInterfaceId?: string;
  toInterfaceId?: string;
  label?: string;
}

export function scriptCallToOp(call: ScriptCall): ScriptCall {
  return call;
}
