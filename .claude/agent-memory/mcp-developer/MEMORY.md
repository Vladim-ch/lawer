# MCP Developer Memory

## Project: mcp-document-processor
- Path: `mcp/mcp-document-processor/`
- Transport: stdio (child process spawned by backend)
- SDK: `@modelcontextprotocol/sdk` v1.12+ (uses `McpServer` class with built-in zod validation)
- zod is a transitive dependency of the SDK — no need to add it to package.json

### Registered Tools (stub phase)
1. `parse_document` — parse PDF/DOCX from base64, return text + metadata
2. `generate_docx` — generate .docx from title + sections array
3. `compare_documents` — diff two plain texts

### Architecture Decision
- Variant B: MCP server runs as child process from backend container (no separate Docker container)
- Backend will spawn the MCP process via stdio
- No Dockerfile needed for MCP server

## Conventions
- Tool descriptions in English
- Communication with user in Russian
- Commit author: `--author="mcp-developer <mcp@lawer.local>"`
- No Node.js on host — everything runs in Docker
