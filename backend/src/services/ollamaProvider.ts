import { env } from "../config/env";
import { SYSTEM_PROMPT } from "../config/systemPrompt";
import type { OllamaToolSchema } from "./mcpClient";
import type { LlmMessage, LlmStreamCallbacks, LlmToolCall } from "./llmService";

function serializeMessage(msg: LlmMessage): Record<string, unknown> {
  const base: Record<string, unknown> = {
    role: msg.role === "tool" ? "tool" : msg.role,
    content: msg.content,
  };
  if (msg.tool_calls) base.tool_calls = msg.tool_calls;
  if (msg.tool_name) base.name = msg.tool_name;
  return base;
}

export async function streamChatOllama(
  messages: LlmMessage[],
  callbacks: LlmStreamCallbacks,
  signal: AbortSignal | undefined,
  tools: OllamaToolSchema[] | undefined,
): Promise<{ text: string; toolCalls: LlmToolCall[] }> {
  const url = `${env.llm.ollamaUrl}/api/chat`;

  const body: Record<string, unknown> = {
    model: env.llm.ollamaModel,
    messages: messages.map(serializeMessage),
    stream: true,
    keep_alive: -1,
    options: {
      temperature: env.llm.temperature,
      num_ctx: env.llm.numCtx,
      num_predict: env.llm.numPredict,
    },
  };
  if (tools && tools.length) body.tools = tools;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    const error = new Error(
      `Ollama connection failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    callbacks.onError(error);
    throw error;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "unknown error");
    const error = new Error(`Ollama API error ${response.status}: ${text}`);
    callbacks.onError(error);
    throw error;
  }

  if (!response.body) {
    const error = new Error("Ollama returned no response body");
    callbacks.onError(error);
    throw error;
  }

  let fullText = "";
  const toolCalls: LlmToolCall[] = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const chunk = JSON.parse(line);
          const msg = chunk.message;

          if (msg?.content) {
            fullText += msg.content;
            callbacks.onToken(msg.content);
          }

          if (Array.isArray(msg?.tool_calls)) {
            for (const tc of msg.tool_calls) {
              if (tc?.function?.name) {
                toolCalls.push({
                  id: tc.id,
                  name: tc.function.name,
                  arguments: tc.function.arguments ?? {},
                });
              }
            }
          }

          if (chunk.done) {
            callbacks.onDone(fullText, toolCalls);
            return { text: fullText, toolCalls };
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    callbacks.onDone(fullText, toolCalls);
    return { text: fullText, toolCalls };
  } finally {
    reader.releaseLock();
  }
}

export async function chatCompletionOllama(
  messages: LlmMessage[],
  signal: AbortSignal | undefined,
  tools: OllamaToolSchema[] | undefined,
): Promise<{ text: string; toolCalls: LlmToolCall[] }> {
  const url = `${env.llm.ollamaUrl}/api/chat`;

  const body: Record<string, unknown> = {
    model: env.llm.ollamaModel,
    messages: messages.map(serializeMessage),
    stream: false,
    keep_alive: -1,
    options: {
      temperature: env.llm.temperature,
      num_ctx: env.llm.numCtx,
      num_predict: env.llm.numPredict,
    },
  };
  if (tools && tools.length) body.tools = tools;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "unknown error");
    throw new Error(`Ollama API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const msg = data.message ?? {};
  const toolCalls: LlmToolCall[] = Array.isArray(msg.tool_calls)
    ? msg.tool_calls.map((tc: { id?: string; function: { name: string; arguments?: Record<string, unknown> } }) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments ?? {},
      }))
    : [];
  return { text: msg.content ?? "", toolCalls };
}

export async function warmUpOllama(): Promise<void> {
  const url = `${env.llm.ollamaUrl}/api/chat`;
  const body = {
    model: env.llm.ollamaModel,
    stream: false,
    keep_alive: -1,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: "ping" },
    ],
    options: {
      temperature: 0,
      num_ctx: env.llm.numCtx,
      num_predict: 1,
    },
  };
  const startedAt = Date.now();
  console.log(`[LLM] Warming up ${env.llm.ollamaModel} (may take a few minutes on CPU)...`);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      console.warn(`[LLM] Warmup failed: HTTP ${r.status}`);
      return;
    }
    await r.json();
    console.log(`[LLM] Warmup complete in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  } catch (err) {
    console.warn(`[LLM] Warmup error:`, (err as Error).message);
  }
}
