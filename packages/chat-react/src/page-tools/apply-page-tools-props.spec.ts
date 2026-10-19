import { describe, expect, it, vi } from 'vitest';
import type { PageToolSource } from '@nexus/chat-core';
import { applyPageToolsProp, applyToolsProps } from './apply-page-tools-props.js';

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
