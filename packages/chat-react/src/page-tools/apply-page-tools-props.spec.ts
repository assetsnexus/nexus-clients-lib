import { describe, expect, it, vi } from 'vitest';
import type { PageToolSource } from '@nexus/chat-core';
import { applyClientToolsProps, applyPageToolsProp, applyToolsProps } from './apply-page-tools-props.js';

describe('tools / pageTools prop reapplication', () => {
  it('registers every standing tool with its descriptor and handler', () => {
    const handler = () => ({ ok: true });
    const registerTool = vi.fn();
    const chat = { registerTool, setPageTools: vi.fn() };

    applyToolsProps(chat, [
      { descriptor: { name: 'app.inventory.reserve', description: 'Reserve' }, handler },
      // A nameless descriptor is skipped rather than registering garbage.
      { descriptor: { name: '' }, handler },
    ]);

    expect(registerTool).toHaveBeenCalledTimes(1);
    expect(registerTool).toHaveBeenCalledWith({ name: 'app.inventory.reserve', description: 'Reserve' }, handler);
  });

  it('swaps page tools in place and clears them with null', () => {
    const setPageTools = vi.fn();
    const chat = { registerTool: vi.fn(), setPageTools };
    const source: PageToolSource = {
      schemas: () => [{ name: 'anx.page.search', description: 'Search' }],
      canExecute: () => true,
      execute: () => ({ ok: true }),
    };

    applyPageToolsProp(chat, source);
    expect(setPageTools).toHaveBeenLastCalledWith(source);

    applyPageToolsProp(chat, undefined);
    expect(setPageTools).toHaveBeenLastCalledWith(null);
  });

  it('tolerates a controller without setPageTools', () => {
    const chat = { registerTool: vi.fn() };
    expect(() => applyPageToolsProp(chat, null)).not.toThrow();
  });
});

describe('clientTools prop reapplication', () => {
  it('forwards conceptSlugs so a discoverable tool reaches the index', () => {
    const registerClientTool = vi.fn();
    const handler = () => ({ ok: true });
    const chat = { registerTool: vi.fn(), registerClientTool };

    // Partner-neutral names: this package is a shared SDK, so the fixture stands in for any
    // host's tool rather than naming one partner's. `app.<partner>.<object>.<verb>` is the
    // convention the SDK documents, with `<partner>` a placeholder.
    applyClientToolsProps(chat, [
      {
        name: 'app.partner.note.open',
        description: 'Open a note',
        availability: 'discoverable',
        access: 'read',
        conceptSlugs: ['partner.notes'],
        handler,
      },
    ]);

    expect(registerClientTool).toHaveBeenCalledTimes(1);
    expect(registerClientTool).toHaveBeenCalledWith({
      name: 'app.partner.note.open',
      description: 'Open a note',
      parameters: undefined,
      access: 'read',
      availability: 'discoverable',
      conceptSlugs: ['partner.notes'],
      handler,
    });
  });

  it('tolerates a controller without registerClientTool', () => {
    const chat = { registerTool: vi.fn() };
    expect(() =>
      applyClientToolsProps(chat, [{ name: 'noop', handler: () => ({ ok: true }) }]),
    ).not.toThrow();
  });
});
