/// <reference types="node" />
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import mammoth from "mammoth";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  convertMillimetersToTwip,
} from "docx";

// @ts-ignore — pdf-parse has no type declarations
import pdfParse from "pdf-parse";
import { diffWords } from "diff";

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
  "Generate a .docx document from structured content. Accepts a document title, an array of sections (each with a heading and body text), and optional metadata (author, date, organization). Returns the generated file as base64-encoded content. Use this tool when you need to create a new legal document such as a contract, claim, power of attorney, or order. The output uses Times New Roman 12pt and Russian GOST page margins.",
  {
    title: z.string().describe("Document title displayed on the first page"),
    sections: z
      .array(
        z.object({
          heading: z.string().describe("Section heading"),
          body: z.string().describe("Section body text content. May contain newline characters (\\n) to separate paragraphs"),
        })
      )
      .describe("Array of document sections, each with a heading and body"),
    metadata: z
      .object({
        author: z.string().optional().describe("Document author name"),
        date: z.string().optional().describe("Document date, e.g. '10 марта 2026 г.'"),
        organization: z.string().optional().describe("Organization name for the document header"),
      })
      .optional()
      .describe("Optional metadata for the document header (author, date, organization)"),
  },
  async ({ title, sections, metadata }) => {
    try {
      // Default font configuration for Russian legal documents
      const fontFamily = "Times New Roman";
      const fontSize = 24; // docx uses half-points, 24 = 12pt

      // Build document children (paragraphs)
      const children: Paragraph[] = [];

      // Organization name (if provided)
      if (metadata?.organization) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: metadata.organization,
                font: fontFamily,
                size: fontSize,
                bold: true,
              }),
            ],
          })
        );
      }

      // Document title
      children.push(
        new Paragraph({
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: title,
              font: fontFamily,
              size: 28, // 14pt for title
              bold: true,
            }),
          ],
        })
      );

      // Date line (if provided)
      if (metadata?.date) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: metadata.date,
                font: fontFamily,
                size: fontSize,
              }),
            ],
          })
        );
      }

      // Sections
      for (const section of sections) {
        // Section heading
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 240, after: 120 },
            children: [
              new TextRun({
                text: section.heading,
                font: fontFamily,
                size: fontSize,
                bold: true,
              }),
            ],
          })
        );

        // Section body — split by newlines into separate paragraphs
        const lines = section.body.split("\n");
        for (const line of lines) {
          children.push(
            new Paragraph({
              spacing: { after: 80 },
              children: [
                new TextRun({
                  text: line,
                  font: fontFamily,
                  size: fontSize,
                }),
              ],
            })
          );
        }
      }

      // Create document with GOST page margins (left 30mm, right 15mm, top 20mm, bottom 20mm)
      const doc = new Document({
        creator: metadata?.author ?? "Lawer AI",
        title,
        description: `Generated legal document: ${title}`,
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: convertMillimetersToTwip(20),
                  bottom: convertMillimetersToTwip(20),
                  left: convertMillimetersToTwip(30),
                  right: convertMillimetersToTwip(15),
                },
              },
            },
            children,
          },
        ],
      });

      const buffer = await Packer.toBuffer(doc);
      const base64 = Buffer.from(buffer).toString("base64");

      // Build a safe filename from the title
      const safeTitle = title
        .replace(/[^\p{L}\p{N}\s-]/gu, "")
        .trim()
        .replace(/\s+/g, "_")
        .substring(0, 80);
      const filename = `${safeTitle || "document"}.docx`;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              base64,
              filename,
              size: buffer.byteLength,
            }),
          },
        ],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: `Failed to generate DOCX document: ${message}`,
            }),
          },
        ],
        isError: true,
      };
    }
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
  async ({ textA, textB }) => {
    try {
      const changes = diffWords(textA, textB);

      const additions: string[] = [];
      const deletions: string[] = [];
      const segments: Array<{ type: "added" | "removed" | "unchanged"; value: string }> = [];

      for (const part of changes) {
        if (part.added) {
          additions.push(part.value);
          segments.push({ type: "added", value: part.value });
        } else if (part.removed) {
          deletions.push(part.value);
          segments.push({ type: "removed", value: part.value });
        } else {
          segments.push({ type: "unchanged", value: part.value });
        }
      }

      const totalChanges = additions.length + deletions.length;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              summary: {
                totalChanges,
                additions: additions.length,
                deletions: deletions.length,
                isIdentical: totalChanges === 0,
              },
              segments,
            }),
          },
        ],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: `Failed to compare documents: ${message}`,
            }),
          },
        ],
        isError: true,
      };
    }
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
