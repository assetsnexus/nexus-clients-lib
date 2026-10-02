export type ImportFormat = 'dxf' | 'ifc' | 'step';

export class ImportNotSupportedError extends Error {
  constructor(format: string) {
    super(`Import format "${format}" is not supported yet`);
    this.name = 'ImportNotSupportedError';
  }
}

export interface DxfProfile {
  pointsMm: Array<[number, number]>;
  closed: boolean;
}

/** Read closed LWPOLYLINE / POLYLINE vertices. Group-code parser, enough for plan profiles. */
export function readDxfPolylines(text: string): DxfProfile[] {
  const lines = text.split(/\r?\n/);
  const profiles: DxfProfile[] = [];
  let entity = '';
  let points: Array<[number, number]> = [];
  let closed = false;
  let pendingX: number | null = null;
  const flush = () => {
    if (entity === 'LWPOLYLINE' || entity === 'POLYLINE') {
      if (points.length >= 3) profiles.push({ pointsMm: points, closed });
    }
    entity = '';
    points = [];
    closed = false;
    pendingX = null;
  };
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = lines[i]?.trim();
    const value = lines[i + 1]?.trim() ?? '';
    if (code === '0') {
      if (entity) flush();
      if (value === 'LWPOLYLINE' || value === 'POLYLINE') entity = value;
      else if (value === 'VERTEX' && entity === 'POLYLINE') {
        /* vertices follow */
      } else if (value === 'SEQEND') flush();
      else entity = entity === 'POLYLINE' ? entity : '';
      continue;
    }
    if (!entity) continue;
    if (code === '70' && (value === '1' || value === '9')) closed = true;
    if (code === '10') pendingX = Number(value);
    if (code === '20' && pendingX != null && Number.isFinite(pendingX) && Number.isFinite(Number(value))) {
      points.push([pendingX, Number(value)]);
      pendingX = null;
    }
  }
  if (entity) flush();
  return profiles;
}

export interface CadAdapter {
  format: string;
  load: (file: ArrayBuffer) => Promise<{ boundsMm: { widthMm: number; heightMm: number; depthMm: number }; elements: Array<{ ref: string; name: string; ifcType: string | null }> }>;
}

const adapters = new Map<string, CadAdapter>();

export function registerCadAdapter(adapter: CadAdapter): void {
  adapters.set(adapter.format, adapter);
}

export function cadAdapter(format: string): CadAdapter | undefined {
  return adapters.get(format);
}

export function importProfiles(format: ImportFormat, text: string): DxfProfile[] {
  if (format !== 'dxf') throw new ImportNotSupportedError(format);
  return readDxfPolylines(text);
}
