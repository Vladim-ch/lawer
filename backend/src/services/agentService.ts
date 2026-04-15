import {
  buildMessages,
  streamChat,
  chatCompletion,
  LlmMessage,
  LlmToolCall,
} from "./llmService";
import { callTool, getToolSchemas } from "./mcpClient";
import { saveGeneratedDocument } from "./documentService";
import { env } from "../config/env";

/** Tools whose results include a generated file we should store in MinIO */
const FILE_PRODUCING_TOOLS = new Set(["generate_docx", "fill_template"]);

export interface AgentStreamCallbacks {
  onToken: (token: string) => void;
  onToolCall: (toolName: string, args: Record<string, unknown>) => void;
  onToolResult: (toolName: string, result: unknown) => void;
  onFile: (documentId: string, filename: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
}

/**
 * Extract MCP `content` blocks into a compact JSON string suitable for
 * feeding back to the LLM as the `tool` message content.
 *
 * Some tools (list_templates) return large JSON that blows out the context
 * when fed back verbatim on CPU-only inference. We compact those payloads
 * here so the LLM can still produce a useful answer quickly.
 */
function serializeToolResult(toolName: string, result: unknown): string {
  if (!result || typeof result !== "object") {
    return JSON.stringify(result ?? null);
  }
  const r = result as { content?: Array<{ type: string; text: string }>; isError?: boolean };

  let text = "";
  if (Array.isArray(r.content)) {
    text = r.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");
  }
  if (!text) {
    text = JSON.stringify(result);
  }

  if (toolName === "list_templates" && !r.isError) {
    try {
      const parsed = JSON.parse(text);
      const templates = Array.isArray(parsed?.templates) ? parsed.templates : [];
      const compact = templates.map((t: { id: string; name: string; category: string; parameters?: Array<{ name: string }> }) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        parameter_names: Array.isArray(t.parameters) ? t.parameters.map((p) => p.name) : [],
      }));
      return JSON.stringify({ templates: compact, count: compact.length });
    } catch {
      // fall through and return the raw text
    }
  }

  return text;
}

async function maybeEmitFile(
  toolName: string,
  toolResult: unknown,
  userId: string,
  onFile: (documentId: string, filename: string) => void,
): Promise<void> {
  if (!FILE_PRODUCING_TOOLS.has(toolName)) return;
  if (!toolResult || typeof toolResult !== "object") return;
  const r = toolResult as {
    content?: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
  if (r.isError) return;

  try {
    const textContent = r.content?.find((c) => c.type === "text");
    if (!textContent) return;
    const parsed = JSON.parse(textContent.text);
    if (parsed.base64 && parsed.filename) {
      const fileType = parsed.filename.split(".").pop()?.toLowerCase() || "docx";
      const doc = await saveGeneratedDocument(userId, parsed.filename, parsed.base64, fileType);
      onFile(doc.id, doc.filename);
    }
  } catch (err) {
    console.warn("[Agent] Failed to save generated file:", (err as Error).message);
  }
}

/**
 * ReAct-style agent loop using Ollama's native tool-calling API.
 *
 * 1. Send history + tools to Ollama and stream the response.
 * 2. If the response contains structured tool_calls, execute each one
 *    via MCP, append the assistant turn and a `tool` message with the
 *    result, and loop (non-streaming for middle iterations, streaming
 *    again on the final answer).
 * 3. Stop when the model returns text without tool_calls, or after
 *    `maxToolIterations`.
 */
export async function runAgent(
  history: Array<{ role: string; content: string }>,
  callbacks: AgentStreamCallbacks,
  userId: string,
  signal?: AbortSignal,
): Promise<string> {
  const messages = buildMessages(history);
  const tools = await getToolSchemas().catch((err) => {
    console.warn("[Agent] Could not load tool schemas:", (err as Error).message);
    return [];
  });

  let accumulatedText = "";
  let iteration = 0;

  // Iteration 0: stream first response to user
  const first = await streamChat(
    messages,
    {
      onToken: callbacks.onToken,
      onDone: () => {},
      onError: callbacks.onError,
    },
    signal,
    tools,
  );

  accumulatedText = first.text;
  let pending = first.toolCalls;

  while (pending.length > 0 && iteration < env.llm.maxToolIterations) {
    iteration++;

    // Record the assistant turn that invoked tool_calls, then execute each.
    messages.push({
      role: "assistant",
      content: accumulatedText,
      tool_calls: pending.map((tc) => ({
        id: tc.id,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    for (const tc of pending) {
      callbacks.onToolCall(tc.name, tc.arguments);

      let toolResult: unknown;
      try {
        toolResult = await callTool(tc.name, tc.arguments);
      } catch (err) {
        toolResult = { error: err instanceof Error ? err.message : String(err) };
      }

      callbacks.onToolResult(tc.name, toolResult);
      await maybeEmitFile(tc.name, toolResult, userId, callbacks.onFile);

      messages.push({
        role: "tool",
        tool_name: tc.name,
        content: serializeToolResult(tc.name, toolResult),
      });
    }

    const isLastIteration = iteration >= env.llm.maxToolIterations;

    if (isLastIteration) {
      // Final allowed turn — stream to the user with tools disabled so the
      // model must answer in prose (prevents runaway tool loops).
      const finalFilter = createTextOnlyBridge(callbacks.onToken);
      const last = await streamChat(
        messages,
        {
          onToken: (t) => finalFilter(t),
          onDone: () => {},
          onError: callbacks.onError,
        },
        signal,
        [],
      );
      accumulatedText = accumulatedText
        ? accumulatedText + "\n\n" + last.text
        : last.text;
      pending = [];
      break;
    }

    // Middle iteration: non-streaming so we don't emit intermediate
    // reasoning text piecemeal; we'll stream only the final answer.
    const next = await chatCompletion(messages, signal, tools);
    pending = next.toolCalls;

    if (pending.length === 0) {
      // No more tools — stream this text out as a batch for the client.
      for (let i = 0; i < next.text.length; i += 20) {
        callbacks.onToken(next.text.slice(i, i + 20));
      }
      accumulatedText = accumulatedText
        ? accumulatedText + "\n\n" + next.text
        : next.text;
    } else {
      // Will loop again — don't emit tokens for this turn, only record.
      accumulatedText = next.text || accumulatedText;
    }
  }

  // Fallback: if after all iterations the model produced no user-facing
  // text at all (e.g. it spent every turn calling tools that returned
  // empty results and then gave up), force one final streaming call with
  // tools disabled so the user always gets a real answer.
  if (!accumulatedText.trim()) {
    messages.push({
      role: "user",
      content:
        "Инструменты не помогли или вернули пустой результат. Ответь на исходный вопрос на основе своих знаний о законодательстве РФ. Если сомневаешься в точности — добавь оговорку, что нужно проверить в актуальной редакции.",
    });
    const fallback = await streamChat(
      messages,
      {
        onToken: callbacks.onToken,
        onDone: () => {},
        onError: callbacks.onError,
      },
      signal,
      [],
    );
    accumulatedText = fallback.text;
  }

  callbacks.onDone(accumulatedText);
  return accumulatedText;
}

/**
 * Pass-through text emitter. Kept as a function for parity with the old
 * XML-tag filter so future token-side filtering (e.g. PII redaction) can
 * be added in one place.
 */
function createTextOnlyBridge(emit: (t: string) => void) {
  return (chunk: string) => emit(chunk);
}
