/**
 * Inbound MCP server (JSON-RPC 2.0 over HTTP).
 *
 * This is the app side of the MCP story: the region's agent calls
 * `mcp__<slug>__<tool>` and the region forwards the call to the app. The app
 * only implements `initialize`, `tools/list` and `tools/call`; everything else
 * is the transport's job.
 *
 * Registering the server on the agent is a portal step (an app may not widen its
 * own agent's MCP servers), so this module deliberately has no registration
 * side effect.
 */

export type McpToolSchema = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type McpToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

export type McpToolHandler = (args: Record<string, unknown>) => McpToolResult | Promise<McpToolResult>;

export type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

export type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export const MCP_PROTOCOL_VERSION = '2024-11-05';

/** A tool result carrying JSON. */
export function mcpJsonResult(value: unknown): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

/** A tool result carrying an error message. */
export function mcpErrorResult(message: string): McpToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

export type McpServerOptions = {
  /** The MCP slug; the agent sees `mcp__<slug>__<tool>`. */
  slug: string;
  version?: string;
  tools: McpToolSchema[];
  handlers: Record<string, McpToolHandler>;
};

export type McpServer = {
  /** Handles one JSON-RPC request. Returns null for a notification. */
  handle: (request: JsonRpcRequest) => Promise<JsonRpcResponse | null>;
  /** Synchronous variant, for tests and simple tools. */
  handleRequest: (request: JsonRpcRequest) => JsonRpcResponse | null;
  tools: McpToolSchema[];
};

export function createMcpServer(opts: McpServerOptions): McpServer {
  const declared = new Map(opts.tools.map((tool) => [tool.name, tool]));

  function handleRequest(request: JsonRpcRequest): JsonRpcResponse | null {
    const id = request.id ?? null;
    const method = String(request.method || '');

    // Notifications carry no id and expect no response.
    if (method.startsWith('notifications/')) return null;

    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: opts.slug, version: opts.version || '0.1.0' },
        },
      };
    }

    if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };

    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: opts.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        },
      };
    }

    if (method === 'tools/call') {
      const params = request.params || {};
      const name = typeof params.name === 'string' ? params.name : '';
      const args =
        params.arguments && typeof params.arguments === 'object'
          ? (params.arguments as Record<string, unknown>)
          : {};
      const handler = opts.handlers[name];
      if (!handler || !declared.has(name)) {
        return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool: ${name}` } };
      }
      return { jsonrpc: '2.0', id, result: handler(args) as unknown };
    }

    return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
  }

  async function handle(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const response = handleRequest(request);
    if (!response) return null;
    // Await a promise-returning handler without changing the sync fast path.
    if (response.result && typeof (response.result as Promise<unknown>).then === 'function') {
      return { ...response, result: await (response.result as Promise<unknown>) };
    }
    return response;
  }

  return { handle, handleRequest, tools: opts.tools };
}
