import { emptyGenerator, type GeneratorChunk, type GeneratorDef } from './schema';
import { MAX_GENERATOR_SOURCE } from './validate';

/** Agent-authored label for a later agent. Not a mesh name. */
export const CHUNK_TITLE_MAX = 80;
/** Agent-authored note for a later agent. Not inferred from the mesh. */
export const CHUNK_DESCRIPTION_MAX = 500;
/** One chunk stays bounded. The composed script still shares MAX_GENERATOR_SOURCE. */
export const CHUNK_SOURCE_MAX = 20_000;
export const CHUNK_COUNT_MAX = 32;
const CHUNK_ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export interface ChunkWrite {
  id?: string;
  order?: number;
  title: string;
  description: string;
  source: string;
  /** Drop the legacy whole-script string. Never slices it into chunks. */
  clearLegacySource?: boolean;
}

export interface ChunkEditResult {
  ok: boolean;
  generator: GeneratorDef;
  errors: string[];
  warning?: string;
  chunk?: GeneratorChunk;
}

function logChunk(level: 'info' | 'warn', event: string, fields: Record<string, string | number>): void {
  const line = `[model3d-generator-chunk] ${event} ${JSON.stringify(fields)}`;
  if (level === 'warn') console.warn(line);
  else console.info(line);
}

function cloneGenerator(generator: GeneratorDef | null | undefined): GeneratorDef {
  const base = generator || emptyGenerator();
  return {
    ...base,
    source: typeof base.source === 'string' ? base.source : '',
    chunks: Array.isArray(base.chunks) ? base.chunks.map((chunk) => ({ ...chunk })) : [],
    manualEdits: Array.isArray(base.manualEdits) ? [...base.manualEdits] : [],
  };
}

export function compareChunks(a: GeneratorChunk, b: GeneratorChunk): number {
  if (a.order !== b.order) return a.order - b.order;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/**
 * Script text that execution runs.
 * Chunk titles and descriptions are omitted. Chunk order is not a scene parent link.
 * With no chunks, the legacy `source` string is the whole script.
 */
export function composeGeneratorSource(generator: GeneratorDef | null | undefined): string {
  if (!generator) return '';
  const chunks = Array.isArray(generator.chunks) ? generator.chunks : [];
  if (!chunks.length) return typeof generator.source === 'string' ? generator.source : '';
  return [...chunks].sort(compareChunks).map((chunk) => (typeof chunk.source === 'string' ? chunk.source : '')).join('\n');
}

function newChunkId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `chk_${Date.now().toString(36)}${rand}`.slice(0, 64);
}

function validateChunkFields(input: ChunkWrite): string[] {
  const errors: string[] = [];
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (!title) errors.push('chunk title is required');
  else if (title.length > CHUNK_TITLE_MAX) errors.push(`chunk title exceeds ${CHUNK_TITLE_MAX} characters`);
  if (!description) errors.push('chunk description is required');
  else if (description.length > CHUNK_DESCRIPTION_MAX) errors.push(`chunk description exceeds ${CHUNK_DESCRIPTION_MAX} characters`);
  if (typeof input.source !== 'string') errors.push('chunk source must be a string');
  else if (input.source.length > CHUNK_SOURCE_MAX) errors.push(`chunk source exceeds ${CHUNK_SOURCE_MAX} characters`);
  if (input.order != null && !Number.isFinite(Number(input.order))) errors.push('chunk order must be a finite number');
  return errors;
}

/** Add or replace one chunk. Other chunk bodies are left as they are. */
export function upsertGeneratorChunk(generator: GeneratorDef | null | undefined, input: ChunkWrite): ChunkEditResult {
  const current = cloneGenerator(generator);
  const errors = validateChunkFields(input);
  const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : newChunkId();
  if (!CHUNK_ID_RE.test(id)) errors.push('chunk id must start with a letter and use only letters, digits, _ or -');
  if (errors.length) {
    logChunk('warn', 'upsert_rejected', { chunkId: id, errors: errors.length });
    return { ok: false, generator: current, errors };
  }
  const title = input.title.trim();
  const description = input.description.trim();
  const idx = current.chunks.findIndex((chunk) => chunk.id === id);
  const order = input.order == null
    ? (idx >= 0 ? current.chunks[idx]!.order : current.chunks.reduce((max, chunk) => Math.max(max, chunk.order), -1) + 1)
    : Number(input.order);
  const chunk: GeneratorChunk = { id, order, title, description, source: input.source };
  const chunks = idx >= 0 ? current.chunks.map((row, i) => (i === idx ? chunk : row)) : [...current.chunks, chunk];
  if (chunks.length > CHUNK_COUNT_MAX) {
    logChunk('warn', 'upsert_rejected', { chunkId: id, errors: 1 });
    return { ok: false, generator: current, errors: [`at most ${CHUNK_COUNT_MAX} chunks`] };
  }
  const next = cloneGenerator(current);
  next.chunks = chunks;
  if (input.clearLegacySource) next.source = '';
  const composed = composeGeneratorSource(next);
  if (composed.length > MAX_GENERATOR_SOURCE) {
    logChunk('warn', 'upsert_rejected', { chunkId: id, errors: 1, composedChars: composed.length });
    return { ok: false, generator: current, errors: [`composed script exceeds ${MAX_GENERATOR_SOURCE} characters`] };
  }
  const warning = next.source.trim() ? 'legacy source is not executed while chunks exist' : undefined;
  logChunk('info', idx >= 0 ? 'chunk_replaced' : 'chunk_added', {
    chunkId: id,
    order,
    titleChars: title.length,
    descriptionChars: description.length,
    sourceChars: input.source.length,
    chunkCount: chunks.length,
  });
  return { ok: true, generator: next, errors: [], warning, chunk };
}

/** Set run order from an explicit id list. Sources, titles, and descriptions stay put. */
export function reorderGeneratorChunks(generator: GeneratorDef | null | undefined, ids: readonly string[]): ChunkEditResult {
  const current = cloneGenerator(generator);
  const chunks = current.chunks;
  const valid = Array.isArray(ids)
    && ids.length === chunks.length
    && new Set(ids).size === ids.length
    && ids.every((id) => chunks.some((chunk) => chunk.id === id));
  if (!valid) {
    logChunk('warn', 'reorder_rejected', { chunkCount: chunks.length, idCount: Array.isArray(ids) ? ids.length : 0 });
    return { ok: false, generator: current, errors: ['reorder ids must list every chunk exactly once'] };
  }
  const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  current.chunks = ids.map((id, order) => ({ ...byId.get(id)!, order }));
  logChunk('info', 'chunks_reordered', { chunkCount: current.chunks.length });
  return { ok: true, generator: current, errors: [] };
}
