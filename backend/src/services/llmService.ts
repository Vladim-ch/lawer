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
