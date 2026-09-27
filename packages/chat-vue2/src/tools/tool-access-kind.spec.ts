import { describe, expect, it } from 'vitest';
import type { ChatToolRun } from '@nexus/chat-core';
import { resolveToolAccessKind } from './shared';

function run(partial: Partial<ChatToolRun> & { tool: string }): ChatToolRun {
  return {
    id: partial.id || 'c1',
    tool: partial.tool,
    label: partial.label || partial.tool,
    status: partial.status || 'success',
    args: partial.args || {},
    result: partial.result,
    error: partial.error ?? null,
  };
}

describe('resolveToolAccessKind', () => {
  it('honors permissionAction from args (CommandMetadata)', () => {
    expect(
      resolveToolAccessKind(
        run({
          tool: 'anx_command',
          args: { command: 'anx.crm.lead.note', permissionAction: 'write' },
        }),
      ),
    ).toBe('write');
    expect(
      resolveToolAccessKind(
        run({
          tool: 'anx_command',
          args: { command: 'anx.crm.lead.list', permissionAction: 'read' },
        }),
      ),
    ).toBe('read');
  });

  it('maps mutationClass read vs write-ish', () => {
    expect(
      resolveToolAccessKind(
        run({ tool: 'anx.crm.lead.list', result: { mutationClass: 'read' } }),
      ),
    ).toBe('read');
    expect(
      resolveToolAccessKind(
        run({ tool: 'anx.crm.lead.create', result: { mutationClass: 'business_write' } }),
      ),
    ).toBe('write');
  });

  it('infers from command verb when annotations are absent', () => {
    expect(
      resolveToolAccessKind(
        run({ tool: 'anx_command', args: { command: 'anx.crm.campaign.list' } }),
      ),
    ).toBe('read');
    expect(
      resolveToolAccessKind(
        run({ tool: 'anx_command', args: { command: 'anx.crm.campaign.strategy.update' } }),
      ),
    ).toBe('write');
    expect(resolveToolAccessKind(run({ tool: 'anx.crm.lead.get' }))).toBe('read');
    expect(resolveToolAccessKind(run({ tool: 'anx.crm.lead.create' }))).toBe('write');
  });

  it('returns null for non-anx tools', () => {
    expect(resolveToolAccessKind(run({ tool: 'search_anx_commands', args: { query: 'x' } }))).toBeNull();
    expect(resolveToolAccessKind(run({ tool: 'assemble_tool_catalog' }))).toBeNull();
  });
});
