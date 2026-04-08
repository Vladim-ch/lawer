#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import pg from "pg";
import fs from "fs";
import path from "path";

const server = new McpServer({
  name: "mcp-law-database",
  version: "0.1.0",
});

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const LAW_DOCS_PATH = process.env.LAW_DOCS_PATH || "/data/law-documents";

/* ------------------------------------------------------------------ */
/*  Database helper — lazy singleton pool                              */
/* ------------------------------------------------------------------ */

let _pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    _pool = new pg.Pool({ connectionString, max: 3 });
  }
  return _pool;
}

/* ------------------------------------------------------------------ */
/*  PDF parsing helper                                                 */
/* ------------------------------------------------------------------ */

async function parsePdf(filePath: string): Promise<{ text: string; pages: number }> {
  const dataBuffer = await fs.promises.readFile(filePath);
  // pdf-parse is a CJS module, dynamic import for ESM compat
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(dataBuffer);
  return { text: data.text, pages: data.numpages };
}

/* ------------------------------------------------------------------ */
/*  Tool: index_documents                                              */
/* ------------------------------------------------------------------ */

server.tool(
  "index_documents",
  "Scan the legal documents directory for PDF files, parse them, and index their text content into the database for full-text search. Skips already indexed files unless their size has changed. Returns a summary of how many documents were indexed or updated.",
  {},
  async () => {
    try {
      const pool = getPool();

      if (!fs.existsSync(LAW_DOCS_PATH)) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ error: `Директория не найдена: ${LAW_DOCS_PATH}` }),
          }],
          isError: true,
        };
      }

      // Recursively find all PDF files
      const pdfFiles = findPdfFiles(LAW_DOCS_PATH);

      let indexed = 0;
      let skipped = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const filePath of pdfFiles) {
        try {
          const stat = await fs.promises.stat(filePath);
          const relativePath = path.relative(LAW_DOCS_PATH, filePath);
          const filename = path.basename(filePath);

          // Check if already indexed with same size
          const existing = await pool.query(
            `SELECT id, file_size FROM legal_documents WHERE file_path = $1`,
            [relativePath],
          );

          if (existing.rows.length > 0 && existing.rows[0].file_size === stat.size) {
            skipped++;
            continue;
          }

          // Parse PDF
          const { text, pages } = await parsePdf(filePath);

          if (!text.trim()) {
            errors.push(`${filename}: пустой текст (возможно, скан без OCR)`);
            failed++;
            continue;
          }

          // Extract title from first line of text
          const title = text.split("\n").find((l) => l.trim().length > 3)?.trim().slice(0, 500) || filename;

          if (existing.rows.length > 0) {
            // Update existing record
            await pool.query(
              `UPDATE legal_documents
               SET content_text = $1, title = $2, page_count = $3, file_size = $4,
                   filename = $5, updated_at = NOW()
               WHERE file_path = $6`,
              [text, title, pages, stat.size, filename, relativePath],
            );
          } else {
            // Insert new record
            await pool.query(
              `INSERT INTO legal_documents (id, filename, file_path, title, content_text, page_count, file_size, updated_at)
               VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())`,
              [filename, relativePath, title, text, pages, stat.size],
            );
          }

          indexed++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${path.basename(filePath)}: ${msg}`);
          failed++;
        }
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            total: pdfFiles.length,
            indexed,
            skipped,
            failed,
            errors: errors.length > 0 ? errors : undefined,
          }),
        }],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  },
);

/* ------------------------------------------------------------------ */
/*  Tool: search_law                                                   */
/* ------------------------------------------------------------------ */

server.tool(
  "search_law",
  "Search indexed legal documents using full-text search (Russian language). Returns matching document snippets with relevance ranking. Use this tool when the user asks about laws, regulations, normative acts, or legal questions.",
  {
    query: z.string().describe("Search query in Russian, e.g. 'ответственность за нарушение сроков поставки'"),
    limit: z.number().optional().default(5).describe("Maximum number of results (default 5)"),
  },
  async ({ query, limit }) => {
    try {
      const pool = getPool();

      // Use plainto_tsquery for natural language input
      const result = await pool.query(
        `SELECT
           id, filename, title, page_count,
           ts_rank(search_vector, plainto_tsquery('russian', $1)) AS rank,
           ts_headline('russian', content_text, plainto_tsquery('russian', $1),
             'StartSel=>>>, StopSel=<<<, MaxWords=60, MinWords=20, MaxFragments=3, FragmentDelimiter= ... '
           ) AS snippet
         FROM legal_documents
         WHERE search_vector @@ plainto_tsquery('russian', $1)
         ORDER BY rank DESC
         LIMIT $2`,
        [query, limit],
      );

      if (result.rows.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              results: [],
              message: `По запросу "${query}" ничего не найдено. Попробуйте переформулировать запрос или проиндексировать документы (index_documents).`,
            }),
          }],
        };
      }

      const results = result.rows.map((row: Record<string, unknown>) => ({
        id: row.id,
        filename: row.filename,
        title: row.title,
        pageCount: row.page_count,
        relevance: Math.round((row.rank as number) * 1000) / 1000,
        snippet: row.snippet,
      }));

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ results, count: results.length }),
        }],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  },
);

/* ------------------------------------------------------------------ */
/*  Tool: get_document_text                                            */
/* ------------------------------------------------------------------ */

server.tool(
  "get_document_text",
  "Retrieve the full text content of a specific indexed legal document by its ID. Use this after search_law to read the complete document text when the user needs detailed information.",
  {
    documentId: z.string().uuid().describe("UUID of the legal document"),
  },
  async ({ documentId }) => {
    try {
      const pool = getPool();

      const result = await pool.query(
        `SELECT id, filename, title, content_text, page_count FROM legal_documents WHERE id = $1`,
        [documentId],
      );

      if (result.rows.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ error: `Документ не найден: ${documentId}` }),
          }],
          isError: true,
        };
      }

      const row = result.rows[0] as Record<string, unknown>;
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            id: row.id,
            filename: row.filename,
            title: row.title,
            pageCount: row.page_count,
            text: row.content_text,
          }),
        }],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  },
);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function findPdfFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findPdfFiles(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) {
      results.push(fullPath);
    }
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  Start server                                                       */
/* ------------------------------------------------------------------ */

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp-law-database] Server started on stdio");
}

main().catch((error: unknown) => {
  console.error("[mcp-law-database] Fatal error:", error);
  process.exit(1);
});

/* Graceful shutdown: close DB pool on exit */
process.on("SIGTERM", () => {
  if (_pool) _pool.end().catch(() => {});
  process.exit(0);
});
