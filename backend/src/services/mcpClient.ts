import { ChildProcess, spawn } from "child_process";
import { join } from "path";

interface McpRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface McpResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface McpServer {
  name: string;
  process: ChildProcess;
  requestId: number;
  pending: Map<number, {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>;
  ready: boolean;
  buffer: string;
}

const REQUEST_TIMEOUT_MS = 30_000;

const servers = new Map<string, McpServer>();

// MCP server configurations: name → path to entry point
const MCP_SERVERS: Record<string, string> = {
  "mcp-document-processor": join(__dirname, "../../mcp/mcp-document-processor/dist/index.js"),
  "mcp-template-engine": join(__dirname, "../../mcp/mcp-template-engine/dist/index.js"),
};

// Map tool names to their MCP server
const TOOL_SERVER_MAP: Record<string, string> = {
  parse_document: "mcp-document-processor",
  generate_docx: "mcp-document-processor",
  compare_documents: "mcp-document-processor",
  fill_template: "mcp-template-engine",
  validate_template: "mcp-template-engine",
};

function spawnServer(name: string): McpServer {
  const scriptPath = MCP_SERVERS[name];
  if (!scriptPath) {
    throw new Error(`Unknown MCP server: ${name}`);
  }

  const child = spawn("node", [scriptPath], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "production" },
  });

  const server: McpServer = {
    name,
    process: child,
    requestId: 0,
    pending: new Map(),
    ready: false,
    buffer: "",
  };

  child.stdout!.on("data", (chunk: Buffer) => {
    server.buffer += chunk.toString();

    // MCP uses newline-delimited JSON-RPC over stdio
    const lines = server.buffer.split("\n");
    server.buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as McpResponse;
        const pending = server.pending.get(msg.id);
        if (pending) {
          clearTimeout(pending.timer);
          server.pending.delete(msg.id);
          if (msg.error) {
            pending.reject(new Error(`MCP error [${msg.error.code}]: ${msg.error.message}`));
          } else {
            pending.resolve(msg.result);
          }
        }
      } catch {
        // skip non-JSON lines (e.g. MCP server logs)
      }
    }
  });

  child.stderr!.on("data", (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) {
      console.error(`[MCP:${name}] ${text}`);
    }
  });

  child.on("exit", (code) => {
    console.error(`[MCP:${name}] exited with code ${code}`);
    servers.delete(name);
    // Reject all pending requests
    for (const [id, pending] of server.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`MCP server ${name} exited unexpectedly`));
      server.pending.delete(id);
    }
  });

  servers.set(name, server);
  return server;
}

function getOrSpawnServer(name: string): McpServer {
  const existing = servers.get(name);
  if (existing && existing.process.exitCode === null) {
    return existing;
  }
  return spawnServer(name);
}

function sendRequest(server: McpServer, method: string, params?: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = ++server.requestId;

    const timer = setTimeout(() => {
      server.pending.delete(id);
      reject(new Error(`MCP request timeout: ${method} (${REQUEST_TIMEOUT_MS}ms)`));
    }, REQUEST_TIMEOUT_MS);

    server.pending.set(id, { resolve, reject, timer });

    const request: McpRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    const data = JSON.stringify(request) + "\n";
    server.process.stdin!.write(data, (err) => {
      if (err) {
        clearTimeout(timer);
        server.pending.delete(id);
        reject(new Error(`Failed to write to MCP server ${server.name}: ${err.message}`));
      }
    });
  });
}

/**
 * Initialize an MCP server connection by sending initialize + initialized.
 */
async function ensureInitialized(server: McpServer): Promise<void> {
  if (server.ready) return;

  await sendRequest(server, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "lawer-backend", version: "0.1.0" },
  });

  // Send initialized notification (no id, but we use request for simplicity)
  const notification = JSON.stringify({
    jsonrpc: "2.0",
    method: "notifications/initialized",
  }) + "\n";
  server.process.stdin!.write(notification);

  server.ready = true;
}

/**
 * Call an MCP tool by name with arguments.
 * Automatically routes to the correct MCP server.
 */
export async function callTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const serverName = TOOL_SERVER_MAP[toolName];
  if (!serverName) {
    throw new Error(`Unknown tool: ${toolName}. Available: ${Object.keys(TOOL_SERVER_MAP).join(", ")}`);
  }

  const server = getOrSpawnServer(serverName);
  await ensureInitialized(server);

  const result = await sendRequest(server, "tools/call", {
    name: toolName,
    arguments: args,
  });

  return result;
}

/**
 * Get the list of available tool names.
 */
export function getAvailableTools(): string[] {
  return Object.keys(TOOL_SERVER_MAP);
}

/**
 * Shutdown all running MCP servers gracefully.
 */
export function shutdownAll(): void {
  for (const [name, server] of servers) {
    console.log(`[MCP] Shutting down ${name}`);
    server.process.kill("SIGTERM");
    servers.delete(name);
  }
}
