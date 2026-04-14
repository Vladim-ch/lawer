import { env } from "../config/env";
import { SYSTEM_PROMPT } from "../config/systemPrompt";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmStreamCallbacks {
  onToken: (token: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
}

/**
 * Build the messages array for the Ollama chat API.
 * Includes system prompt + last N messages from history.
 */
export function buildMessages(
  history: Array<{ role: string; content: string }>,
): LlmMessage[] {
  const messages: LlmMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  // Take last N messages for context window
  const recent = history.slice(-env.llm.maxContext);
  for (const msg of recent) {
    messages.push({
      role: msg.role as LlmMessage["role"],
      content: msg.content,
    });
  }

  return messages;
}

/**
 * Stream a chat completion from Ollama.
 * Returns the full response text when done.
 */
export async function streamChat(
  messages: LlmMessage[],
  callbacks: LlmStreamCallbacks,
  signal?: AbortSignal,
): Promise<string> {
  const url = `${env.llm.ollamaUrl}/api/chat`;

  const body = {
    model: env.llm.ollamaModel,
    messages,
    stream: true,
    keep_alive: -1,
    options: {
      temperature: env.llm.temperature,
      num_ctx: env.llm.numCtx,
      num_predict: env.llm.numPredict,
    },
  };

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
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Ollama streams newline-delimited JSON
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const chunk = JSON.parse(line);

          if (chunk.message?.content) {
            const token = chunk.message.content;
            fullText += token;
            callbacks.onToken(token);
          }

          if (chunk.done) {
            callbacks.onDone(fullText);
            return fullText;
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    // If we exited the loop without a done signal
    callbacks.onDone(fullText);
    return fullText;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Non-streaming chat completion (for tool-use iterations).
 */
export async function chatCompletion(
  messages: LlmMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const url = `${env.llm.ollamaUrl}/api/chat`;

  const body = {
    model: env.llm.ollamaModel,
    messages,
    stream: false,
    keep_alive: -1,
    options: {
      temperature: env.llm.temperature,
      num_ctx: env.llm.numCtx,
      num_predict: env.llm.numPredict,
    },
  };

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
  return data.message?.content || "";
}

/**
 * Warm up Ollama: load model and populate KV cache for the system prompt.
 * CPU-only prompt eval of 2–3k-token system prompt takes minutes cold;
 * prefix caching makes subsequent requests fast, so we pay that cost once
 * on startup (fire-and-forget, non-blocking).
 */
export async function warmUp(): Promise<void> {
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
