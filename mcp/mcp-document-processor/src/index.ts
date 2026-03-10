/// <reference types="node" />
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import mammoth from "mammoth";

// @ts-ignore — pdf-parse has no type declarations
import pdfParse from "pdf-parse";

const server = new McpServer({
  name: "mcp-document-processor",
  version: "0.1.0",
});

/**
 * Tool: parse_document
 * Parses a document (PDF, DOCX, TXT, or RTF) from base64 content and extracts plain text with metadata.
 */
server.tool(
  "parse_document",
  "Parse a legal document (PDF, DOCX, TXT, or RTF) from base64-encoded content. Returns extracted plain text and document metadata such as page count, word count, and character count. Use this tool when you need to read or analyze the contents of an uploaded document.",
  {
    content: z
      .string()
      .describe("Base64-encoded file content of the document to parse"),
    fileType: z
      .enum(["pdf", "docx", "txt", "rtf"])
      .describe("File format of the document: 'pdf', 'docx', 'txt', or 'rtf'"),
  },
  async ({ content, fileType }) => {
    let buffer: Buffer;
    try {
      buffer = Buffer.from(content, "base64");
      // Validate that the input was actually valid base64 by re-encoding and comparing
      if (buffer.toString("base64") !== content) {
        throw new Error("Input is not valid base64");
      }
    } catch {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: "Invalid base64 content. Ensure the file content is properly base64-encoded.",
            }),
          },
        ],
        isError: true,
      };
    }

    let text: string;
    let pages: number | null = null;

    try {
      switch (fileType) {
        case "pdf": {
          const pdfData = await pdfParse(buffer);
          text = pdfData.text;
          pages = pdfData.numpages ?? null;
          break;
        }
        case "docx": {
          const result = await mammoth.extractRawText({ buffer });
          text = result.value;
          break;
        }
        case "txt":
        case "rtf": {
          text = buffer.toString("utf-8");
          break;
        }
        default: {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: `Unsupported file type: '${fileType}'. Supported types: pdf, docx, txt, rtf.`,
                }),
              },
            ],
            isError: true,
          };
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: `Failed to parse ${fileType} document: ${message}`,
            }),
          },
        ],
        isError: true,
      };
    }

    const words = text.trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const charCount = text.length;

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            text,
            metadata: {
              fileType,
              wordCount,
              charCount,
              pages,
            },
          }),
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
  async ({ title: _title, sections: _sections }) => {
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
  async ({ textA: _textA, textB: _textB }) => {
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
