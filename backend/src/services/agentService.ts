import {
  buildMessages,
  streamChat,
  chatCompletion,
  LlmMessage,
} from "./llmService";
import { callTool, getAvailableTools } from "./mcpClient";
import { saveGeneratedDocument } from "./documentService";
import { env } from "../config/env";

/** Tools that produce downloadable files */
const FILE_PRODUCING_TOOLS = new Set(["generate_docx", "fill_template"]);

// Matches both properly closed <tool_call>...</tool_call> and the common
// case where the model forgets the closing tag — we take the JSON object
// up to and including its matching closing brace.
const TOOL_CALL_REGEX = /<tool_call>\s*(\{[\s\S]*?\})\s*(?:<\/tool_call>|$)/;

export interface AgentStreamCallbacks {
  onToken: (token: string) => void;
  onToolCall: (toolName: string, args: Record<string, unknown>) => void;
  onToolResult: (toolName: string, result: unknown) => void;
  onFile: (documentId: string, filename: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
}

interface ParsedToolCall {
  tool: string;
  arguments: Record<string, unknown>;
}

function parseToolCall(text: string): ParsedToolCall | null {
  const match = text.match(TOOL_CALL_REGEX);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]);
    if (typeof parsed.tool === "string" && parsed.arguments) {
      return { tool: parsed.tool, arguments: parsed.arguments };
    }
  } catch {
    // malformed JSON in tool call
  }
  return null;
}

/**
 * Remove the tool_call tag from response text, returning the clean portion.
 */
function stripToolCall(text: string): string {
  // Strip properly closed tags AND dangling <tool_call>...(eof) without
  // closing tag (qwen2.5 sometimes omits it).
  return text
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "")
    .replace(/<tool_call>[\s\S]*$/g, "")
    .trim();
}

/**
 * Streaming filter that hides `<tool_call>...</tool_call>` blocks from the
 * token stream reaching the client. Handles tags split across chunks by
 * holding back a small tail buffer.
 */
function createToolCallFilter(emit: (t: string) => void) {
  const OPEN = "<tool_call>";
  const CLOSE = "</tool_call>";
  let buf = "";
  let inside = false;
  return {
    push(chunk: string) {
      buf += chunk;
      while (buf.length > 0) {
        if (inside) {
          const ci = buf.indexOf(CLOSE);
          if (ci === -1) {
            buf = buf.slice(Math.max(0, buf.length - (CLOSE.length - 1)));
            return;
          }
          buf = buf.slice(ci + CLOSE.length);
          inside = false;
          continue;
        }
        const oi = buf.indexOf(OPEN);
        if (oi === -1) {
          const safeLen = Math.max(0, buf.length - (OPEN.length - 1));
          if (safeLen > 0) {
            emit(buf.slice(0, safeLen));
            buf = buf.slice(safeLen);
          }
          return;
        }
        if (oi > 0) emit(buf.slice(0, oi));
        buf = buf.slice(oi + OPEN.length);
        inside = true;
      }
    },
    flush() {
      if (!inside && buf.length > 0) emit(buf);
      buf = "";
      inside = false;
    },
  };
}

/**
 * Run the ReAct agent loop:
 * 1. Stream LLM response to user
 * 2. If response contains <tool_call>, execute it via MCP
 * 3. Feed result back to LLM, repeat (up to maxToolIterations)
 * 4. Final response is streamed to user
 */
export async function runAgent(
  history: Array<{ role: string; content: string }>,
  callbacks: AgentStreamCallbacks,
  userId: string,
  signal?: AbortSignal,
): Promise<string> {
  const messages = buildMessages(history);
  const availableTools = getAvailableTools();
  let fullResponse = "";
  let iteration = 0;

  // First iteration: stream to user, but hide any <tool_call>...</tool_call>
  // segments so the client never sees the raw tag in the chat bubble.
  const firstFilter = createToolCallFilter(callbacks.onToken);
  const firstResponse = await streamChat(
    messages,
    {
      onToken: (t) => firstFilter.push(t),
      onDone: () => {},
      onError: callbacks.onError,
    },
    signal,
  );
  firstFilter.flush();

  fullResponse = firstResponse;

  // Check for tool calls in the streamed response
  let toolCall = parseToolCall(fullResponse);

  while (toolCall && iteration < env.llm.maxToolIterations) {
    iteration++;

    // Validate tool name
    if (!availableTools.includes(toolCall.tool)) {
      const errorMsg = `\n\n*Инструмент "${toolCall.tool}" не найден.*`;
      callbacks.onToken(errorMsg);
      fullResponse = stripToolCall(fullResponse) + errorMsg;
      break;
    }

    callbacks.onToolCall(toolCall.tool, toolCall.arguments);

    // Execute MCP tool
    let toolResult: unknown;
    try {
      toolResult = await callTool(toolCall.tool, toolCall.arguments);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      toolResult = { error: errorMsg };
    }

    callbacks.onToolResult(toolCall.tool, toolResult);

    // If the tool produces a file, save it to MinIO and emit file event
    if (FILE_PRODUCING_TOOLS.has(toolCall.tool) && toolResult && !(toolResult as any)?.error) {
      try {
        const result = toolResult as { content?: Array<{ type: string; text: string }> };
        const textContent = result?.content?.find((c) => c.type === "text");
        if (textContent) {
          const parsed = JSON.parse(textContent.text);
          if (parsed.base64 && parsed.filename) {
            const fileType = parsed.filename.split(".").pop()?.toLowerCase() || "docx";
            const doc = await saveGeneratedDocument(userId, parsed.filename, parsed.base64, fileType);
            callbacks.onFile(doc.id, doc.filename);
          }
        }
      } catch (err) {
        console.warn("[Agent] Failed to save generated file:", (err as Error).message);
      }
    }

    // Add assistant response (with tool call) and tool result to messages
    messages.push({
      role: "assistant",
      content: fullResponse,
    });
    messages.push({
      role: "user",
      content: `Результат вызова инструмента ${toolCall.tool}:\n\`\`\`json\n${JSON.stringify(toolResult, null, 2)}\n\`\`\``,
    });

    // Check if this is the last iteration — stream, otherwise use completion
    if (iteration >= env.llm.maxToolIterations) {
      // Last iteration: stream final response (still filter tool_call in case
      // the model emits one after hitting the iteration cap).
      const lastFilter = createToolCallFilter(callbacks.onToken);
      const finalResponse = await streamChat(
        messages,
        {
          onToken: (t) => lastFilter.push(t),
          onDone: () => {},
          onError: callbacks.onError,
        },
        signal,
      );
      lastFilter.flush();
      fullResponse = stripToolCall(fullResponse) + "\n\n" + stripToolCall(finalResponse);
      break;
    }

    // Middle iteration: non-streaming for speed, check for more tool calls
    const nextResponse = await chatCompletion(messages, signal);
    const nextToolCall = parseToolCall(nextResponse);

    if (nextToolCall) {
      // More tool calls — continue loop without streaming
      fullResponse = nextResponse;
      toolCall = nextToolCall;
      continue;
    }

    // No more tool calls — stream this final response to user
    // We already have the text, send it as tokens
    const cleanPrevious = stripToolCall(fullResponse);
    const separator = cleanPrevious ? "\n\n" : "";
    if (separator) callbacks.onToken(separator);

    // Send the non-streamed response as a batch of tokens, filtering tool_call
    // tags in case the model emitted one despite us not continuing the loop.
    const batchFilter = createToolCallFilter(callbacks.onToken);
    for (let i = 0; i < nextResponse.length; i += 20) {
      batchFilter.push(nextResponse.slice(i, i + 20));
    }
    batchFilter.flush();

    fullResponse = (cleanPrevious ? cleanPrevious + separator : "") + stripToolCall(nextResponse);
    toolCall = null;
  }

  // Clean up any remaining tool_call tags from the final response
  const cleanResponse = stripToolCall(fullResponse) || fullResponse;
  callbacks.onDone(cleanResponse);
  return cleanResponse;
}
