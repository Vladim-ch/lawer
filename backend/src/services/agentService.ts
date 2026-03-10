import {
  buildMessages,
  streamChat,
  chatCompletion,
  LlmMessage,
} from "./llmService";
import { callTool, getAvailableTools } from "./mcpClient";
import { env } from "../config/env";

const TOOL_CALL_REGEX = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/;

export interface AgentStreamCallbacks {
  onToken: (token: string) => void;
  onToolCall: (toolName: string, args: Record<string, unknown>) => void;
  onToolResult: (toolName: string, result: unknown) => void;
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
  return text.replace(/<tool_call>[\s\S]*?<\/tool_call>/, "").trim();
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
  signal?: AbortSignal,
): Promise<string> {
  const messages = buildMessages(history);
  const availableTools = getAvailableTools();
  let fullResponse = "";
  let iteration = 0;

  // First iteration: stream to user
  const firstResponse = await streamChat(
    messages,
    {
      onToken: callbacks.onToken,
      onDone: () => {},
      onError: callbacks.onError,
    },
    signal,
  );

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
      // Last iteration: stream final response
      const finalResponse = await streamChat(
        messages,
        {
          onToken: callbacks.onToken,
          onDone: () => {},
          onError: callbacks.onError,
        },
        signal,
      );
      fullResponse = stripToolCall(fullResponse) + "\n\n" + finalResponse;
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

    // Send the non-streamed response as a batch of tokens
    for (let i = 0; i < nextResponse.length; i += 20) {
      const chunk = nextResponse.slice(i, i + 20);
      callbacks.onToken(chunk);
    }

    fullResponse = (cleanPrevious ? cleanPrevious + separator : "") + nextResponse;
    toolCall = null;
  }

  // Clean up any remaining tool_call tags from the final response
  const cleanResponse = stripToolCall(fullResponse) || fullResponse;
  callbacks.onDone(cleanResponse);
  return cleanResponse;
}
