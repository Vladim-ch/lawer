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
  "mcp-law-database": join(__dirname, "../../mcp/mcp-law-database/dist/index.js"),
};

// Map tool names to their MCP server
const TOOL_SERVER_MAP: Record<string, string> = {
  parse_document: "mcp-document-processor",
  generate_docx: "mcp-document-processor",
  compare_documents: "mcp-document-processor",
  list_templates: "mcp-template-engine",
  get_template: "mcp-template-engine",
  create_template: "mcp-template-engine",
  fill_template: "mcp-template-engine",
  validate_template: "mcp-template-engine",
  index_documents: "mcp-law-database",
  search_law: "mcp-law-database",
  get_document_text: "mcp-law-database",
};

function spawnServer(name: string): McpServer {
  const scriptPath = MCP_SERVERS[name];
  if (!scriptPath) {
    throw new Error(`Unknown MCP server: ${name}`);
  }

  // Only pass necessary env vars to child processes (least-privilege)
  const childEnv: Record<string, string | undefined> = {
    NODE_ENV: "production",
    PATH: process.env.PATH,
  };
  if (name === "mcp-template-engine") {
    childEnv.DATABASE_URL = process.env.DATABASE_URL;
  }
  if (name === "mcp-law-database") {
    childEnv.DATABASE_URL = process.env.DATABASE_URL;
    childEnv.LAW_DOCS_PATH = process.env.LAW_DOCS_PATH;
  }

  const child = spawn("node", [scriptPath], {
    stdio: ["pipe", "pipe", "pipe"],
    env: childEnv,
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

export interface OllamaToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

let toolSchemaCache: OllamaToolSchema[] | null = null;

/**
 * Tools callable via MCP internally but never exposed to the LLM's tool
 * list. parse_document is handled by the backend on upload; exposing it
 * makes small models try to re-parse already-extracted attachments.
 */
const INTERNAL_ONLY_TOOLS = new Set<string>(["parse_document"]);

/**
 * MCP tool descriptions are written for humans and often include multiple
 * examples; on CPU inference each extra token in the tool schema costs a
 * fraction of a second of prompt eval time, per request. Keep descriptions
 * to one short sentence.
 */
function compactDescription(desc: string): string {
  const firstSentence = desc.split(/(?<=[.!?])\s/)[0] ?? desc;
  return firstSentence.trim().slice(0, 140);
}

/**
 * Strip verbose `description`, `examples`, and `default` fields from
 * parameter schemas — they bloat the prompt without helping tool routing.
 */
function compactParameters(schema: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!schema || typeof schema !== "object") {
    return { type: "object", properties: {} };
  }
  const copy: Record<string, unknown> = { ...schema };
  const props = (copy.properties as Record<string, Record<string, unknown>> | undefined) ?? {};
  const slimProps: Record<string, Record<string, unknown>> = {};
  for (const [name, def] of Object.entries(props)) {
    const keep: Record<string, unknown> = {};
    if (def.type) keep.type = def.type;
    if (def.enum) keep.enum = def.enum;
    if (def.items) keep.items = def.items;
    if (typeof def.description === "string") {
      keep.description = (def.description as string).split(/\.\s/)[0].slice(0, 80);
    }
    slimProps[name] = keep;
  }
  copy.properties = slimProps;
  return copy;
}

/**
 * Fetch tool schemas from every MCP server and cache them in the format
 * Ollama expects on /api/chat `tools`. Cached indefinitely — restart the
 * backend to pick up new tools.
 */
export async function getToolSchemas(): Promise<OllamaToolSchema[]> {
  if (toolSchemaCache) return toolSchemaCache;

  const serverNames = Array.from(new Set(Object.values(TOOL_SERVER_MAP)));
  const schemas: OllamaToolSchema[] = [];

  for (const serverName of serverNames) {
    try {
      const server = getOrSpawnServer(serverName);
      await ensureInitialized(server);
      const listResult = (await sendRequest(server, "tools/list", {})) as {
        tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
      };
      for (const tool of listResult?.tools ?? []) {
        if (!TOOL_SERVER_MAP[tool.name]) continue;
        if (INTERNAL_ONLY_TOOLS.has(tool.name)) continue;
        schemas.push({
          type: "function",
          function: {
            name: tool.name,
            description: compactDescription(tool.description ?? ""),
            parameters: compactParameters(tool.inputSchema),
          },
        });
      }
    } catch (err) {
      console.warn(`[MCP] Failed to list tools for ${serverName}:`, (err as Error).message);
    }
  }

  toolSchemaCache = schemas;
  return schemas;
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
