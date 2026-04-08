/// <reference types="node" />
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import pg from "pg";

const server = new McpServer({
  name: "mcp-template-engine",
  version: "0.1.0",
});

/* ------------------------------------------------------------------ */
/*  Database helper — lazy singleton pool                             */
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
/*  Tool: list_templates                                              */
/* ------------------------------------------------------------------ */

server.tool(
  "list_templates",
  "List available legal document templates from the database. Returns id, name, category, parameter schema, and creation date for each template. Optionally filter by category. Use this tool when the user asks what templates are available or wants to choose a template to fill.",
  {
    category: z
      .string()
      .optional()
      .describe("Optional category filter, e.g. 'договор' or 'соглашение'"),
  },
  async ({ category }) => {
    try {
      const pool = getPool();
      let query = `SELECT id, name, category, parameters, created_at FROM templates ORDER BY name`;
      const values: string[] = [];

      if (category) {
        query = `SELECT id, name, category, parameters, created_at FROM templates WHERE category = $1 ORDER BY name`;
        values.push(category);
      }

      const result = await pool.query(query, values);
      const templates = result.rows.map((row: Record<string, unknown>) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        parameters: row.parameters,
        createdAt: row.created_at,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ templates, count: templates.length }),
          },
        ],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: `Failed to list templates: ${message}` }),
          },
        ],
        isError: true,
      };
    }
  }
);

/* ------------------------------------------------------------------ */
/*  Tool: get_template                                                */
/* ------------------------------------------------------------------ */

server.tool(
  "get_template",
  "Retrieve a single template by ID, including its full body text. Use this tool to get the template body before calling fill_template.",
  {
    templateId: z.string().uuid().describe("UUID of the template to retrieve"),
  },
  async ({ templateId }) => {
    try {
      const pool = getPool();
      const result = await pool.query(
        `SELECT id, name, category, template_body, parameters, created_at FROM templates WHERE id = $1`,
        [templateId]
      );

      if (result.rows.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: `Template not found: ${templateId}` }),
            },
          ],
          isError: true,
        };
      }

      const row = result.rows[0] as Record<string, unknown>;
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              id: row.id,
              name: row.name,
              category: row.category,
              templateBody: row.template_body,
              parameters: row.parameters,
              createdAt: row.created_at,
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
            text: JSON.stringify({ error: `Failed to get template: ${message}` }),
          },
        ],
        isError: true,
      };
    }
  }
);

/* ------------------------------------------------------------------ */
/*  Tool: create_template                                             */
/* ------------------------------------------------------------------ */

server.tool(
  "create_template",
  "Create a new legal document template and save it to the database. The template body must use {{placeholder}} syntax. Returns the created template record. Use this tool when the user wants to add a new reusable document template.",
  {
    name: z.string().describe("Template name, e.g. 'Договор поставки'"),
    category: z.string().describe("Template category, e.g. 'договор' or 'соглашение'"),
    templateBody: z
      .string()
      .describe("Full template text with {{placeholder}} markers"),
    parameters: z
      .array(
        z.object({
          name: z.string().describe("Placeholder name matching {{name}} in the body"),
          description: z.string().describe("Human-readable description of this field"),
          type: z
            .enum(["string", "date", "number", "text"])
            .describe("Data type hint for the field"),
        })
      )
      .describe("Array of parameter definitions for each placeholder"),
    createdBy: z.string().uuid().describe("UUID of the user creating the template"),
  },
  async ({ name, category, templateBody, parameters, createdBy }) => {
    try {
      const pool = getPool();
      const result = await pool.query(
        `INSERT INTO templates (id, name, category, template_body, parameters, created_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING id, name, category, created_at`,
        [name, category, templateBody, JSON.stringify(parameters), createdBy]
      );

      const row = result.rows[0] as Record<string, unknown>;
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              created: true,
              id: row.id,
              name: row.name,
              category: row.category,
              createdAt: row.created_at,
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
            text: JSON.stringify({ error: `Failed to create template: ${message}` }),
          },
        ],
        isError: true,
      };
    }
  }
);

/**
 * Tool: fill_template
 *
 * Fills a document template with provided parameter values.
 * Placeholders use the syntax {{parameter_name}}.
 * Returns the filled text and a list of any unfilled placeholders.
 */
server.tool(
  "fill_template",
  "Fill a legal document template with parameter values. The template uses {{placeholder}} syntax for variable substitution. Returns the filled document text and reports any placeholders that were not provided. Use this tool when the user wants to generate a document from a template (contract, claim, power of attorney, order, etc.).",
  {
    templateBody: z
      .string()
      .describe("Template text with {{placeholder}} markers to be replaced"),
    parameters: z
      .record(z.string())
      .describe("Key-value map of placeholder names to their values, e.g. {\"company_name\": \"ООО Ромашка\", \"contract_date\": \"01.01.2026\"}"),
    templateName: z
      .string()
      .optional()
      .describe("Optional template name for reference in the response"),
  },
  async ({ templateBody, parameters, templateName }) => {
    try {
      // Find all placeholders in the template
      const placeholderPattern = /\{\{(\w+)\}\}/g;
      const allPlaceholders = new Set<string>();
      let match;

      while ((match = placeholderPattern.exec(templateBody)) !== null) {
        allPlaceholders.add(match[1]);
      }

      // Replace placeholders with provided values
      const filledText = templateBody.replace(
        /\{\{(\w+)\}\}/g,
        (original, name: string) => {
          if (name in parameters) {
            return parameters[name];
          }
          return original; // keep unfilled placeholder as-is
        }
      );

      // Determine which placeholders were filled and which were missed
      const filledPlaceholders: string[] = [];
      const unfilledPlaceholders: string[] = [];

      for (const name of allPlaceholders) {
        if (name in parameters) {
          filledPlaceholders.push(name);
        } else {
          unfilledPlaceholders.push(name);
        }
      }

      // Check for extra parameters not present in the template
      const extraParameters = Object.keys(parameters).filter(
        (key) => !allPlaceholders.has(key)
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              filledText,
              templateName: templateName ?? null,
              summary: {
                totalPlaceholders: allPlaceholders.size,
                filled: filledPlaceholders.length,
                unfilled: unfilledPlaceholders.length,
                extra: extraParameters.length,
              },
              unfilledPlaceholders,
              extraParameters,
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
              error: `Failed to fill template: ${message}`,
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

/**
 * Tool: validate_template
 *
 * Validates a template body: checks placeholder syntax and extracts the list
 * of required parameters. Useful before saving a new template to the database.
 */
server.tool(
  "validate_template",
  "Validate a document template and extract its placeholder list. Checks for syntax issues (unclosed brackets, nested placeholders) and returns the list of required parameters. Use this tool before saving a new template to ensure it is well-formed.",
  {
    templateBody: z
      .string()
      .describe("Template text to validate"),
  },
  async ({ templateBody }) => {
    try {
      const issues: string[] = [];

      // Check for unclosed placeholders: {{ without matching }}
      const openCount = (templateBody.match(/\{\{/g) || []).length;
      const closeCount = (templateBody.match(/\}\}/g) || []).length;
      if (openCount !== closeCount) {
        issues.push(
          `Mismatched brackets: found ${openCount} opening '{{' and ${closeCount} closing '}}'`
        );
      }

      // Check for empty placeholders {{}}
      const emptyMatches = templateBody.match(/\{\{\s*\}\}/g);
      if (emptyMatches) {
        issues.push(`Found ${emptyMatches.length} empty placeholder(s) {{}}`);
      }

      // Check for placeholders with invalid characters (non-word)
      const invalidPattern = /\{\{([^}]*[^\w}][^}]*)\}\}/g;
      let invalidMatch;
      while ((invalidMatch = invalidPattern.exec(templateBody)) !== null) {
        issues.push(
          `Invalid placeholder name: '{{${invalidMatch[1]}}}' — use only letters, digits, and underscores`
        );
      }

      // Extract valid placeholders
      const validPattern = /\{\{(\w+)\}\}/g;
      const placeholders = new Set<string>();
      let m;
      while ((m = validPattern.exec(templateBody)) !== null) {
        placeholders.add(m[1]);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              isValid: issues.length === 0,
              placeholders: Array.from(placeholders),
              placeholderCount: placeholders.size,
              issues,
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
              error: `Failed to validate template: ${message}`,
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
  console.error("[mcp-template-engine] Server started on stdio transport");
}

main().catch((error: unknown) => {
  console.error("[mcp-template-engine] Fatal error:", error);
  process.exit(1);
});

/* Graceful shutdown: close DB pool on exit */
process.on("SIGTERM", () => {
  if (_pool) _pool.end().catch(() => {});
  process.exit(0);
});
