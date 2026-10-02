import { describe, expect, it, vi } from 'vitest';
import {
  CHUNK_DESCRIPTION_MAX,
  CHUNK_TITLE_MAX,
  composeGeneratorSource,
  reorderGeneratorChunks,
  upsertGeneratorChunk,
} from './generator-chunks';
import { emptyGenerator, normalizeModel } from './schema';

const hull = {
  title: 'Hull script',
  description: 'Ops that create the body group. Not a scene node.',
  source: 'api.group({ id: "body", name: "body" })',
};
const plate = {
  title: 'Plate script',
  description: 'Box ops that parent to body. The chunk itself is not the parent.',
  source: 'api.box({ name: "plate", parentId: "body", sizeMm: [10, 10, 2] })',
};

describe('generator chunks', () => {
  it('rejects an empty title or description and does not log the source', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const missingTitle = upsertGeneratorChunk(emptyGenerator(), { title: '  ', description: 'for the next agent', source: 'api.box({})' });
    expect(missingTitle.ok).toBe(false);
    expect(missingTitle.errors.join(' ')).toMatch(/title/);
    expect(missingTitle.generator.chunks).toHaveLength(0);
    const missingDescription = upsertGeneratorChunk(emptyGenerator(), { title: 'Wheels', description: ' ', source: 'api.box({})' });
    expect(missingDescription.ok).toBe(false);
    expect(missingDescription.errors.join(' ')).toMatch(/description/);
    const logged = spy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logged).toContain('upsert_rejected');
    expect(logged).not.toContain('api.box');
    spy.mockRestore();
  });

  it('rejects titles and descriptions over the limit', () => {
    const longTitle = upsertGeneratorChunk(emptyGenerator(), {
      title: 'T'.repeat(CHUNK_TITLE_MAX + 1),
      description: 'notes for a later agent',
      source: '',
    });
    expect(longTitle.ok).toBe(false);
    const longDescription = upsertGeneratorChunk(emptyGenerator(), {
      title: 'Wheels',
      description: 'D'.repeat(CHUNK_DESCRIPTION_MAX + 1),
      source: '',
    });
    expect(longDescription.ok).toBe(false);
  });

  it('adds and replaces one chunk without rewriting the others or slicing the legacy source', () => {
    const legacy = emptyGenerator('api.box({ name: "legacy" })');
    const first = upsertGeneratorChunk(legacy, { id: 'hull', ...hull });
    expect(first.ok).toBe(true);
    expect(first.generator.source).toBe('api.box({ name: "legacy" })');
    expect(first.warning).toMatch(/legacy source/);
    const second = upsertGeneratorChunk(first.generator, { id: 'plate', ...plate });
    expect(second.generator.chunks.map((chunk) => chunk.id)).toEqual(['hull', 'plate']);
    const replaced = upsertGeneratorChunk(second.generator, {
      id: 'hull',
      title: 'Hull script',
      description: 'Replaced body ops only.',
      source: 'api.group({ id: "body", name: "replaced" })',
    });
    expect(replaced.ok).toBe(true);
    expect(replaced.generator.chunks.find((chunk) => chunk.id === 'plate')!.source).toBe(plate.source);
    expect(replaced.generator.chunks).toHaveLength(2);
    expect(replaced.generator.source).toContain('legacy');
  });

  it('concatenates sources in order and omits titles, descriptions, and the legacy string', () => {
    const saved = upsertGeneratorChunk(
      upsertGeneratorChunk(emptyGenerator('api.box({ name: "legacy" })'), { id: 'bPlate', order: 1, ...plate }).generator,
      { id: 'aHull', order: 0, ...hull, clearLegacySource: true },
    );
    const composed = composeGeneratorSource(saved.generator);
    expect(composed).toBe(`${hull.source}\n${plate.source}`);
    expect(composed).not.toContain('Hull script');
    expect(composed).not.toContain('Plate script');
    expect(composed).not.toContain('scene node');
    expect(composed).not.toContain('legacy');
    expect(saved.generator.chunks.some((chunk) => 'parentId' in chunk)).toBe(false);
  });

  it('reorders run order without changing bodies, and refuses a partial id list', () => {
    let gen = upsertGeneratorChunk(emptyGenerator(), { id: 'hull', order: 0, ...hull }).generator;
    gen = upsertGeneratorChunk(gen, { id: 'plate', order: 1, ...plate }).generator;
    const moved = reorderGeneratorChunks(gen, ['plate', 'hull']);
    expect(moved.ok).toBe(true);
    expect(composeGeneratorSource(moved.generator).startsWith(plate.source)).toBe(true);
    expect(moved.generator.chunks.find((chunk) => chunk.id === 'hull')!.title).toBe(hull.title);
    expect(moved.generator.chunks.find((chunk) => chunk.id === 'hull')!.source).toBe(hull.source);
    const rejected = reorderGeneratorChunks(moved.generator, ['plate']);
    expect(rejected.ok).toBe(false);
    expect(composeGeneratorSource(rejected.generator).startsWith(plate.source)).toBe(true);
  });

  it('keeps a single source when no chunks were saved, and does not invent chunk titles', () => {
    const model = normalizeModel({
      schemaVersion: 3,
      generator: { source: 'api.group({ name: "only" })', chunks: [{ source: 'api.box({})' }] },
      shapes: [{ id: 'door', type: 'box', name: 'Door', parentId: null }],
    });
    expect(composeGeneratorSource(model.generator)).toBe('api.group({ name: "only" })');
    expect(model.generator!.chunks).toHaveLength(0);
    expect(model.shapes.map((shape) => shape.name)).toEqual(['Door']);
    const untitled = normalizeModel({
      generator: { chunks: [{ id: 'c1', order: 2, title: '', description: '', source: 'api.box({ name: "kept" })' }] },
    });
    expect(untitled.generator!.chunks[0]!.title).toBe('');
    expect(composeGeneratorSource(untitled.generator)).toBe('api.box({ name: "kept" })');
    expect(untitled.shapes).toHaveLength(0);
  });
});
