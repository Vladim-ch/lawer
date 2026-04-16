import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env";
import { SYSTEM_PROMPT } from "../config/systemPrompt";
import type { OllamaToolSchema } from "./mcpClient";
import type { LlmMessage, LlmStreamCallbacks, LlmToolCall } from "./llmService";

let clientSingleton: Anthropic | null = null;
function getClient(): Anthropic {
  if (!clientSingleton) {
    if (!env.llm.anthropicApiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set — cannot use anthropic provider");
    }
    clientSingleton = new Anthropic({ apiKey: env.llm.anthropicApiKey });
  }
  return clientSingleton;
}

/**
 * Convert our unified LlmMessage history + Ollama-style tool schemas into the
 * shape Anthropic's Messages API expects:
 *  - `system` is a top-level parameter, not a message role.
 *  - Tool calls ride inside the assistant message as `tool_use` content blocks.
 *  - Tool results come back as user-role `tool_result` content blocks and must
 *    reference the tool_use id from the assistant turn that produced them.
 */
function toAnthropicMessages(messages: LlmMessage[]): {
  system: string;
  messages: Anthropic.MessageParam[];
} {
  const systemParts: string[] = [];
  const out: Anthropic.MessageParam[] = [];
  // Map tool_name → tool_use_id from the most recent assistant tool_use so we
  // can attach it to the matching tool_result block.
  const lastToolUseIdByName = new Map<string, string>();

  for (const msg of messages) {
    if (msg.role === "system") {
      if (msg.content) systemParts.push(msg.content);
      continue;
    }

    if (msg.role === "user") {
      out.push({ role: "user", content: msg.content });
      continue;
    }

    if (msg.role === "assistant") {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (msg.content) blocks.push({ type: "text", text: msg.content });
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          const id = tc.id || `toolu_${Math.random().toString(36).slice(2, 14)}`;
          blocks.push({
            type: "tool_use",
            id,
            name: tc.function.name,
            input: tc.function.arguments,
          });
          lastToolUseIdByName.set(tc.function.name, id);
        }
      }
      if (blocks.length === 0) blocks.push({ type: "text", text: "" });
      out.push({ role: "assistant", content: blocks });
      continue;
    }

    if (msg.role === "tool") {
      const toolName = msg.tool_name ?? "";
      const toolUseId = lastToolUseIdByName.get(toolName);
      if (!toolUseId) continue; // orphan tool result — drop
      out.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUseId,
            content: msg.content,
          },
        ],
      });
    }
  }

  return {
    system: systemParts.join("\n\n"),
    messages: out,
  };
}

/**
 * Convert Ollama-style tool schemas to Anthropic's {name, description, input_schema}.
 */
function toAnthropicTools(tools?: OllamaToolSchema[]): Anthropic.Tool[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters as Anthropic.Tool.InputSchema,
  }));
}

function buildCreateParams(
  messages: LlmMessage[],
  tools: OllamaToolSchema[] | undefined,
): Anthropic.MessageCreateParams {
  const converted = toAnthropicMessages(messages);
  const params: Anthropic.MessageCreateParams = {
    model: env.llm.anthropicModel,
    max_tokens: env.llm.anthropicMaxTokens,
    temperature: env.llm.temperature,
    // Prompt caching on the system prompt — first request pays ~1.25× to
    // write the cache, subsequent requests read at ~0.1× input cost and
    // skip prompt evaluation entirely.
    system: [
      {
        type: "text",
        text: converted.system || SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: converted.messages,
  };
  const antTools = toAnthropicTools(tools);
  if (antTools) params.tools = antTools;
  return params;
}

export async function streamChatAnthropic(
  messages: LlmMessage[],
  callbacks: LlmStreamCallbacks,
  signal: AbortSignal | undefined,
  tools: OllamaToolSchema[] | undefined,
): Promise<{ text: string; toolCalls: LlmToolCall[] }> {
  const client = getClient();
  const params = buildCreateParams(messages, tools);

  let fullText = "";
  const toolCalls: LlmToolCall[] = [];
  const toolInputJsonByIndex = new Map<number, string>();
  const toolMetaByIndex = new Map<number, { id: string; name: string }>();

  try {
    const stream = client.messages.stream(params, { signal });

    for await (const event of stream) {
      if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          toolMetaByIndex.set(event.index, {
            id: event.content_block.id,
            name: event.content_block.name,
          });
          toolInputJsonByIndex.set(event.index, "");
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          fullText += event.delta.text;
          callbacks.onToken(event.delta.text);
        } else if (event.delta.type === "input_json_delta") {
          const prev = toolInputJsonByIndex.get(event.index) ?? "";
          toolInputJsonByIndex.set(event.index, prev + event.delta.partial_json);
        }
      } else if (event.type === "content_block_stop") {
        const meta = toolMetaByIndex.get(event.index);
        if (meta) {
          const json = toolInputJsonByIndex.get(event.index) ?? "{}";
          let parsed: Record<string, unknown> = {};
          try {
            parsed = json ? JSON.parse(json) : {};
          } catch {
            parsed = {};
          }
          toolCalls.push({ id: meta.id, name: meta.name, arguments: parsed });
        }
      }
    }

    await stream.finalMessage();
    callbacks.onDone(fullText, toolCalls);
    return { text: fullText, toolCalls };
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    const error = new Error(
      `Anthropic streaming failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    callbacks.onError(error);
    throw error;
  }
}

export async function chatCompletionAnthropic(
  messages: LlmMessage[],
  signal: AbortSignal | undefined,
  tools: OllamaToolSchema[] | undefined,
): Promise<{ text: string; toolCalls: LlmToolCall[] }> {
  const client = getClient();
  const params = buildCreateParams(messages, tools);
  const response = (await client.messages.create(params, { signal })) as Anthropic.Message;

  let text = "";
  const toolCalls: LlmToolCall[] = [];
  for (const block of response.content) {
    if (block.type === "text") {
      text += block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        arguments: (block.input as Record<string, unknown>) ?? {},
      });
    }
  }
  return { text, toolCalls };
}

export async function warmUpAnthropic(): Promise<void> {
  const client = getClient();
  const startedAt = Date.now();
  console.log(`[LLM] Warming up ${env.llm.anthropicModel} (writing system prompt cache)...`);
  try {
    await client.messages.create({
      model: env.llm.anthropicModel,
      max_tokens: 1,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: "ping" }],
    });
    console.log(`[LLM] Warmup complete in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  } catch (err) {
    console.warn(`[LLM] Warmup error:`, (err as Error).message);
  }
}
