/// <reference types="node" />
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "mcp-template-engine",
  version: "0.1.0",
});

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
