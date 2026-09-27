import { describe, expect, it } from 'vitest';
import type { ChatToolRun } from '@nexus/chat-core';
import { formatToolRunDisplay } from './tool-run-display';

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

describe('formatToolRunDisplay', () => {
  it('search_anx_commands shows returned / totalMatch on success', () => {
    const d = formatToolRunDisplay(
      run({
        tool: 'search_anx_commands',
        args: { query: 'crm campaign strategy' },
        result: {
          count: 3,
          totalMatch: 12,
          commands: [
            { command: 'anx.crm.campaign.strategy.update' },
            { command: 'anx.crm.campaign.strategy.get' },
          ],
        },
      }),
    );
    expect(d.title).toBe('search · 3 / 12');
    expect(d.tooltip).toContain('returned 3');
    expect(d.tooltip).toContain('total match 12');
  });

  it('search_anx_commands shows the query while running', () => {
    const d = formatToolRunDisplay(
      run({
        tool: 'search_anx_commands',
        status: 'running',
        args: { query: 'lead zones' },
      }),
    );
    expect(d.title).toBe('search · lead zones');
  });

  it('assemble_tool_catalog shows +/− counts and lists names in the tooltip', () => {
    const d = formatToolRunDisplay(
      run({
        tool: 'assemble_tool_catalog',
        args: { task: 'update campaign strategy' },
        result: {
          added: [
            { name: 'anx.crm.campaign.strategy.update', oneLiner: 'Update strategy' },
            { name: 'crm', oneLiner: 'CRM pack' },
          ],
          removed: ['anx.notes.create'],
        },
      }),
    );
    expect(d.title).toBe('tools +2 −1');
    expect(d.tooltip).toContain('+ anx.crm.campaign.strategy.update, crm');
    expect(d.tooltip).toContain('− anx.notes.create');
  });

  it('anx_command shows the anx.* command and a metafield title when present', () => {
    const d = formatToolRunDisplay(
      run({
        tool: 'anx_command',
        args: {
          command: 'anx.crm.campaign.strategy.update',
          title: 'Update campaign strategy',
        },
      }),
    );
    expect(d.title).toBe('anx.crm.campaign.strategy.update');
    expect(d.subtitle).toBe('Update campaign strategy');
  });

  it('direct assembled anx.* tools keep the command as the title', () => {
    const d = formatToolRunDisplay(
      run({
        tool: 'anx.crm.campaign.get',
        args: { campaignId: 'c1' },
        result: { oneLiner: 'Fetch a campaign' },
      }),
    );
    expect(d.title).toBe('anx.crm.campaign.get');
    expect(d.subtitle).toBe('Fetch a campaign');
  });
});
