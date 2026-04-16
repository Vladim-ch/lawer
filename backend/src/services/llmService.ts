import { env } from "../config/env";
import { SYSTEM_PROMPT } from "../config/systemPrompt";
import type { OllamaToolSchema } from "./mcpClient";

export interface LlmToolCall {
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{
    id?: string;
    function: { name: string; arguments: Record<string, unknown> };
  }>;
  tool_name?: string;
}

export interface LlmStreamCallbacks {
  onToken: (token: string) => void;
  onDone: (fullText: string, toolCalls: LlmToolCall[]) => void;
  onError: (error: Error) => void;
}

/**
 * Build the messages array to pass to the current provider.
 * Includes the system prompt + last N messages from history.
 *
 * Anthropic extracts the system role out of `messages` into a top-level
 * parameter — `anthropicProvider` handles that transparently, so callers
 * don't care which provider is behind the dispatcher.
 */
export function buildMessages(
  history: Array<{ role: string; content: string }>,
): LlmMessage[] {
  const messages: LlmMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  const recent = history.slice(-env.llm.maxContext);
  for (const msg of recent) {
    messages.push({
      role: msg.role as LlmMessage["role"],
      content: msg.content,
    });
  }

  return messages;
}

// ---------------------------------------------------------------------------
// Provider dispatch — delayed require() to keep this file importable by the
// providers themselves without circular-import pain.
// ---------------------------------------------------------------------------

type StreamFn = (
  messages: LlmMessage[],
  callbacks: LlmStreamCallbacks,
  signal: AbortSignal | undefined,
  tools: OllamaToolSchema[] | undefined,
) => Promise<{ text: string; toolCalls: LlmToolCall[] }>;

type ChatFn = (
  messages: LlmMessage[],
  signal: AbortSignal | undefined,
  tools: OllamaToolSchema[] | undefined,
) => Promise<{ text: string; toolCalls: LlmToolCall[] }>;

type WarmFn = () => Promise<void>;

function providers(): { stream: StreamFn; chat: ChatFn; warm: WarmFn } {
  if (env.llm.provider === "anthropic") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require("./anthropicProvider");
    return { stream: m.streamChatAnthropic, chat: m.chatCompletionAnthropic, warm: m.warmUpAnthropic };
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const m = require("./ollamaProvider");
  return { stream: m.streamChatOllama, chat: m.chatCompletionOllama, warm: m.warmUpOllama };
}

export async function streamChat(
  messages: LlmMessage[],
  callbacks: LlmStreamCallbacks,
  signal?: AbortSignal,
  tools?: OllamaToolSchema[],
) {
  return providers().stream(messages, callbacks, signal, tools);
}

export async function chatCompletion(
  messages: LlmMessage[],
  signal?: AbortSignal,
  tools?: OllamaToolSchema[],
) {
  return providers().chat(messages, signal, tools);
}

export async function warmUp(): Promise<void> {
  return providers().warm();
}
