import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "mcp-document-processor",
  version: "0.1.0",
});

/**
 * Tool: parse_document
 * Parses a document (PDF or DOCX) from base64 content and extracts plain text with metadata.
 */
server.tool(
  "parse_document",
  "Parse a legal document (PDF or DOCX) from base64-encoded content. Returns extracted plain text and document metadata such as page count and word count. Use this tool when you need to read or analyze the contents of an uploaded document.",
  {
    content: z
      .string()
      .describe("Base64-encoded file content of the document to parse"),
    fileType: z
      .enum(["pdf", "docx"])
      .describe("File format of the document: 'pdf' or 'docx'"),
  },
  async (_params) => {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ status: "not_implemented" }),
        },
      ],
    };
  }
);

/**
 * Tool: generate_docx
 * Generates a DOCX document from structured input (title + sections).
 */
server.tool(
  "generate_docx",
  "Generate a .docx document from structured content. Accepts a document title and an array of sections (each with a heading and body text). Returns the generated file as base64-encoded content. Use this tool when you need to create a new legal document such as a contract, memo, or report.",
  {
    title: z.string().describe("Document title displayed on the first page"),
    sections: z
      .array(
        z.object({
          heading: z.string().describe("Section heading"),
          body: z.string().describe("Section body text content"),
        })
      )
      .describe("Array of document sections, each with a heading and body"),
  },
  async (_params) => {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ status: "not_implemented" }),
        },
      ],
    };
  }
);

/**
 * Tool: compare_documents
 * Compares two text documents and returns a structured diff.
 */
server.tool(
  "compare_documents",
  "Compare two plain-text documents and produce a detailed diff. Returns a list of additions, deletions, and unchanged segments. Use this tool when you need to identify differences between two versions of a legal document or contract.",
  {
    textA: z
      .string()
      .describe("Full plain text of the first (original) document"),
    textB: z
      .string()
      .describe("Full plain text of the second (modified) document"),
  },
  async (_params) => {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ status: "not_implemented" }),
        },
      ],
    };
  }
);

/**
 * Start the MCP server with stdio transport.
 * The server will be spawned as a child process by the backend.
 */
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp-document-processor] Server started on stdio transport");
}

main().catch((error: unknown) => {
  console.error("[mcp-document-processor] Fatal error:", error);
  process.exit(1);
});
