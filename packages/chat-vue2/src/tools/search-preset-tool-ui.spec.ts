import { describe, expect, it } from 'vitest';
import {
  extractNestedSearchToolRow,
  isSearchPresetNestedTool,
  summaryMarkdownText,
} from './search-preset-tool-ui';

describe('search-preset-tool-ui', () => {
  it('detects web-search and marketplace list tools', () => {
    expect(isSearchPresetNestedTool('anx.ai-agents.web-search')).toBe(true);
    expect(isSearchPresetNestedTool('anx.ai-agents.web-search.fetch')).toBe(true);
    expect(isSearchPresetNestedTool('anx.marketplace.product.list')).toBe(true);
    expect(isSearchPresetNestedTool('set_plan')).toBe(false);
  });

  it('extracts engine, http, and outcome from web-search bridge result', () => {
    const row = extractNestedSearchToolRow(
      'anx.ai-agents.web-search',
      JSON.stringify({ query: 'weather', provider: 'brave' }),
      {
        status: 'ok',
        responseCode: 200,
        result: { provider: 'brave', providersUsed: ['brave'], results: [{ provider: 'brave' }] },
      },
      true,
    );
    expect(row.engineId).toBe('brave');
    expect(row.httpStatus).toBe(200);
    expect(row.outcome).toBe('result');
    expect(row.hint).toBe('weather');
  });

  it('extracts blockedReason and httpStatus from fetch result', () => {
    const row = extractNestedSearchToolRow(
      'anx.ai-agents.web-search.fetch',
      { url: 'https://example.com/page' },
      {
        status: 'ok',
        responseCode: 200,
        result: { httpStatus: 403, blockedReason: 'prompt_injection', url: 'https://example.com/page' },
      },
      true,
    );
    expect(row.engineId).toBe('fetch');
    expect(row.httpStatus).toBe(403);
    expect(row.blockedReason).toBe('prompt_injection');
    expect(row.outcome).toBe('skipped');
    expect(row.status).toBe('error');
  });

  it('reads compactSummary markdown text', () => {
    expect(summaryMarkdownText('| a | b |\n|---|---|')).toContain('| a | b |');
    expect(summaryMarkdownText({ compactSummary: 'Findings\n\n| source | http |' })).toContain('Findings');
  });
});
