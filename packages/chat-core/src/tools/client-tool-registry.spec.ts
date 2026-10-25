import { describe, expect, it } from 'vitest';
import { ClientToolRegistry } from './client-tool-registry.js';

/**
 * Regression: the bound schema must carry the declared `access`.
 *
 * `bind_client_tool` returns the tool's full schema to the server. If that
 * schema drops `access`, the server defaults to `write` and a `read`
 * discoverable tool wrongly pauses for approval in Plan mode.
 */
describe('ClientToolRegistry access preservation', () => {
  function makeRegistry() {
    const registry = new ClientToolRegistry();
    registry.register({
      name: 'app.xcamp.suggestion.show',
      description: 'render a suggestion card',
      parameters: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
      access: 'read',
      availability: 'discoverable',
      handler: () => ({ ok: true }),
    });
    registry.register({
      name: 'app.xcamp.note.create',
      description: 'create a note',
      access: 'write',
      availability: 'discoverable',
      handler: () => ({ ok: true }),
    });
    return registry;
  }

  it('reports the declared access in the compact index', () => {
    const index = makeRegistry().indexEntries();
    const byName = Object.fromEntries(index.map((e) => [e.name, e.access]));
    expect(byName['app.xcamp.suggestion.show']).toBe('read');
    expect(byName['app.xcamp.note.create']).toBe('write');
  });

  it('carries access on the full schema for a read tool', () => {
    const schema = makeRegistry().schemaFor('app.xcamp.suggestion.show');
    expect(schema).toMatchObject({ name: 'app.xcamp.suggestion.show', access: 'read' });
  });

  it('carries access on the full schema for a write tool', () => {
    const schema = makeRegistry().schemaFor('app.xcamp.note.create');
    expect(schema).toMatchObject({ access: 'write' });
  });

  it('carries access on the bind result the server merges back', () => {
    const bind = makeRegistry().bindResult('app.xcamp.suggestion.show');
    expect(bind?.extraFunctionSchemas[0]).toMatchObject({
      name: 'app.xcamp.suggestion.show',
      access: 'read',
    });
  });

  it('still resolves the schema by wire-form name', () => {
    const schema = makeRegistry().schemaFor('app_xcamp_suggestion_show');
    expect(schema).toMatchObject({ name: 'app.xcamp.suggestion.show', access: 'read' });
  });

  it('resolves a wire-form name in `has` and `get`', () => {
    // Regression: the server names a discoverable tool by its wire spelling on
    // the `client_tool_request`, but the host registered the dotted name. The
    // exact-match `has`/`get` missed it, so the pause found no handler and the
    // suggestion card never rendered even though the tool "succeeded".
    const registry = makeRegistry();
    expect(registry.has('app_xcamp_suggestion_show')).toBe(true);
    expect(registry.get('app_xcamp_suggestion_show')?.descriptor.name).toBe(
      'app.xcamp.suggestion.show',
    );
    expect(registry.has('app_xcamp_nope')).toBe(false);
    expect(registry.get('app_xcamp_nope')).toBeUndefined();
  });

  it('carries access on the pinned schema too', () => {
    // A pinned `read` tool must not become a plan-mode write for lack of an
    // `access` field on the `browserFunctionCalls` entry.
    const registry = new ClientToolRegistry();
    registry.register({
      name: 'app.xcamp.pinned.read',
      description: 'pinned read tool',
      access: 'read',
      handler: () => ({ ok: true }),
    });
    expect(registry.pinnedSchemas()[0]).toMatchObject({ access: 'read' });
  });

  it('returns null for an unknown tool', () => {
    expect(makeRegistry().schemaFor('app.xcamp.nope')).toBeNull();
    expect(makeRegistry().bindResult('app.xcamp.nope')).toBeNull();
  });
});
