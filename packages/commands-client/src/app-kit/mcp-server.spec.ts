import { describe, expect, it } from 'vitest';
import { createMcpServer, mcpErrorResult, mcpJsonResult } from './mcp-server.js';

function server() {
  return createMcpServer({
    slug: 'demo',
    tools: [
      {
        name: 'list_things',
        description: 'List things.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'find_thing',
        description: 'Find one thing.',
        inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
    ],
    handlers: {
      list_things: () => mcpJsonResult([{ id: 'a' }]),
      find_thing: (args) =>
        args.id === 'a' ? mcpJsonResult({ id: 'a' }) : mcpErrorResult(`no thing ${String(args.id)}`),
    },
  });
}

describe('inbound MCP server', () => {
  it('answers initialize with the protocol version and server info', async () => {
    const response = await server().handle({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    expect(response?.result).toMatchObject({
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'demo' },
    });
  });

  it('lists the declared tools with their schemas', async () => {
    const response = await server().handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const tools = (response?.result as { tools: Array<{ name: string }> }).tools;
    expect(tools.map((tool) => tool.name)).toEqual(['list_things', 'find_thing']);
  });

  it('calls a tool and returns JSON text content', async () => {
    const response = await server().handle({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'list_things', arguments: {} },
    });
    const content = (response?.result as { content: Array<{ text: string }> }).content;
    expect(JSON.parse(content[0].text)).toEqual([{ id: 'a' }]);
  });

  it('passes arguments through and can return an error result', async () => {
    const response = await server().handle({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'find_thing', arguments: { id: 'zzz' } },
    });
    const result = response?.result as { content: Array<{ text: string }>; isError?: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('no thing zzz');
  });

  it('rejects an unknown tool with a JSON-RPC error', async () => {
    const response = await server().handle({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'nope', arguments: {} },
    });
    expect(response?.error?.code).toBe(-32602);
  });

  it('rejects an unknown method', async () => {
    const response = await server().handle({ jsonrpc: '2.0', id: 6, method: 'resources/list' });
    expect(response?.error?.code).toBe(-32601);
  });

  it('ignores notifications', async () => {
    expect(await server().handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
  });

  it('answers ping', async () => {
    const response = await server().handle({ jsonrpc: '2.0', id: 7, method: 'ping' });
    expect(response?.result).toEqual({});
  });

  it('awaits an async handler', async () => {
    const asyncServer = createMcpServer({
      slug: 'demo',
      tools: [{ name: 'slow', description: 'Slow.', inputSchema: { type: 'object', properties: {} } }],
      handlers: { slow: async () => mcpJsonResult({ ok: true }) },
    });
    const response = await asyncServer.handle({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: { name: 'slow', arguments: {} },
    });
    const content = (response?.result as { content: Array<{ text: string }> }).content;
    expect(JSON.parse(content[0].text)).toEqual({ ok: true });
  });
});
