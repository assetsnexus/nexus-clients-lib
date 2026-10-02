/** Canonical ANX space is Z-up millimetres. Y-up scene units stay a mirror for legacy readers. */

export const MM_PER_SCENE_UNIT = 100;
export const METRES_PER_SCENE_UNIT = 0.1;
export const PRECISION_MM = 1e-4;

export const SNAP_STEPS_MM = Object.freeze([
  0.001, 0.01, 0.1, 0.5, 1, 5, 10, 25, 50, 100, 500, 1000,
]);

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export function quantizeMm(value: number, precision = PRECISION_MM): number {
  if (!Number.isFinite(value)) return 0;
  const q = Math.round(value / precision) * precision;
  const decimals = Math.min(12, Math.max(0, Math.ceil(-Math.log10(precision))));
  return Number(q.toFixed(decimals));
}

export function nearlyEqualMm(a: number, b: number, precision = PRECISION_MM): boolean {
  return Math.abs(a - b) <= precision;
}

export function vec(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function readVec(raw: unknown, fallback: Vec3 = vec()): Vec3 {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  const v = raw as Record<string, unknown>;
  const n = (k: string, d: number) => {
    const x = Number(v[k]);
    return Number.isFinite(x) ? x : d;
  };
  return { x: n('x', fallback.x), y: n('y', fallback.y), z: n('z', fallback.z) };
}

export function quantizeVecMm(v: Vec3, precision = PRECISION_MM): Vec3 {
  return { x: quantizeMm(v.x, precision), y: quantizeMm(v.y, precision), z: quantizeMm(v.z, precision) };
}

/** Z-up millimetres → Y-up scene units (1 = 100 mm). +Z up becomes +Y; +Y forward becomes −Z. */
export function zUpMmToYUpScene(p: Vec3): Vec3 {
  return {
    x: p.x / MM_PER_SCENE_UNIT,
    y: p.z / MM_PER_SCENE_UNIT,
    z: -p.y / MM_PER_SCENE_UNIT,
  };
}

/** Y-up scene units → Z-up millimetres. */
export function yUpSceneToZUpMm(p: Vec3): Vec3 {
  return quantizeVecMm({
    x: p.x * MM_PER_SCENE_UNIT,
    y: -p.z * MM_PER_SCENE_UNIT,
    z: p.y * MM_PER_SCENE_UNIT,
  });
}

export function zUpMmToYUpMetres(p: Vec3): Vec3 {
  const s = zUpMmToYUpScene(p);
  return { x: s.x * METRES_PER_SCENE_UNIT, y: s.y * METRES_PER_SCENE_UNIT, z: s.z * METRES_PER_SCENE_UNIT };
}

export function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}

export function rad2deg(r: number): number {
  return (r * 180) / Math.PI;
}

/** Three.js / glTF intrinsic XYZ euler → quaternion. Degrees in, xyzw out. */
export function eulerXyzDegToQuat(e: Vec3): Quat {
  const x = deg2rad(e.x) / 2;
  const y = deg2rad(e.y) / 2;
  const z = deg2rad(e.z) / 2;
  const c1 = Math.cos(x);
  const s1 = Math.sin(x);
  const c2 = Math.cos(y);
  const s2 = Math.sin(y);
  const c3 = Math.cos(z);
  const s3 = Math.sin(z);
  return {
    x: s1 * c2 * c3 + c1 * s2 * s3,
    y: c1 * s2 * c3 - s1 * c2 * s3,
    z: c1 * c2 * s3 + s1 * s2 * c3,
    w: c1 * c2 * c3 - s1 * s2 * s3,
  };
}

export function quatMul(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export function quatConjugate(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

/** Quaternion → intrinsic XYZ euler degrees (Three.js XYZ branch). */
export function quatToEulerXyzDeg(q: Quat): Vec3 {
  const clamp = (n: number) => Math.max(-1, Math.min(1, n));
  const y = Math.asin(clamp(2 * (q.w * q.y - q.z * q.x)));
  let x: number;
  let z: number;
  if (Math.abs(y) < 0.9999999) {
    x = Math.atan2(2 * (q.w * q.x + q.y * q.z), 1 - 2 * (q.x * q.x + q.y * q.y));
    z = Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));
  } else {
    x = Math.atan2(2 * (q.y * q.z + q.w * q.x), 1 - 2 * (q.x * q.x + q.z * q.z));
    z = 0;
  }
  const round = (n: number) => quantizeMm(rad2deg(n), 1e-6);
  return { x: round(x), y: round(y), z: round(z) };
}

/** −90° about X. Maps canonical +Z onto Y-up +Y. */
const BASIS = eulerXyzDegToQuat({ x: -90, y: 0, z: 0 });
const BASIS_INV = quatConjugate(BASIS);

function conjugateByBasis(q: Quat, toYUp: boolean): Quat {
  return toYUp ? quatMul(quatMul(BASIS, q), BASIS_INV) : quatMul(quatMul(BASIS_INV, q), BASIS);
}

export function zUpEulerToYUpEuler(e: Vec3): Vec3 {
  return quatToEulerXyzDeg(conjugateByBasis(eulerXyzDegToQuat(e), true));
}

export function yUpEulerToZUpEuler(e: Vec3): Vec3 {
  return quatToEulerXyzDeg(conjugateByBasis(eulerXyzDegToQuat(e), false));
}

/** Rotate a direction that lives in Z-up into Y-up (unit vectors, joints). */
export function zUpDirToYUp(d: Vec3): Vec3 {
  return { x: d.x, y: d.z, z: -d.y };
}

export function yUpDirToZUp(d: Vec3): Vec3 {
  return { x: d.x, y: -d.z, z: d.y };
}

export function formatMm(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(Math.max(0, Math.min(6, decimals)));
}

export function formatVecMm(v: Vec3, decimals = 2): string {
  return `${formatMm(v.x, decimals)}, ${formatMm(v.y, decimals)}, ${formatMm(v.z, decimals)} mm`;
}
