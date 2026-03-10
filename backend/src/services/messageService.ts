import { Response } from "express";
import prisma from "../config/database";
import { AppError } from "../middleware/errorHandler";
import { runAgent } from "./agentService";

export async function addMessage(
  conversationId: string,
  userId: string,
  role: "user" | "assistant" | "system",
  content: string,
  attachments?: unknown,
) {
  // Verify conversation belongs to user
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
  });
  if (!conv) {
    throw new AppError(404, "Диалог не найден");
  }

  const message = await prisma.message.create({
    data: {
      conversationId,
      role,
      content,
      attachments: attachments ? JSON.parse(JSON.stringify(attachments)) : undefined,
    },
  });

  // Update conversation timestamp
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  return message;
}

export async function getMessages(conversationId: string, userId: string) {
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
  });
  if (!conv) {
    throw new AppError(404, "Диалог не найден");
  }

  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Stream an LLM response via SSE using the ReAct agent loop.
 */
export async function streamResponse(
  conversationId: string,
  userId: string,
  userMessage: string,
  res: Response,
): Promise<void> {
  // Verify conversation
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
  });
  if (!conv) {
    throw new AppError(404, "Диалог не найден");
  }

  // Save user message
  await prisma.message.create({
    data: {
      conversationId,
      role: "user",
      content: userMessage,
    },
  });

  // Setup SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Get conversation history for context
  const history = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });

  // Abort controller for client disconnect
  const abortController = new AbortController();
  res.on("close", () => abortController.abort());

  try {
    // Run the ReAct agent loop with SSE streaming
    const fullResponse = await runAgent(
      history,
      {
        onToken: (token) => {
          if (!res.writableEnded) {
            const data = JSON.stringify({ type: "token", content: token });
            res.write(`data: ${data}\n\n`);
          }
        },
        onToolCall: (toolName, args) => {
          if (!res.writableEnded) {
            const data = JSON.stringify({ type: "tool_call", tool: toolName, arguments: args });
            res.write(`data: ${data}\n\n`);
          }
        },
        onToolResult: (toolName, result) => {
          if (!res.writableEnded) {
            const data = JSON.stringify({ type: "tool_result", tool: toolName, success: !(result as any)?.error });
            res.write(`data: ${data}\n\n`);
          }
        },
        onDone: () => {},
        onError: (error) => {
          console.error("[Agent] Error:", error.message);
          if (!res.writableEnded) {
            const data = JSON.stringify({ type: "error", message: "Произошла ошибка при обработке запроса" });
            res.write(`data: ${data}\n\n`);
          }
        },
      },
      abortController.signal,
    );

    // Save assistant message
    const assistantMsg = await prisma.message.create({
      data: {
        conversationId,
        role: "assistant",
        content: fullResponse,
      },
    });

    // Update conversation title if it's the first exchange
    const messageCount = await prisma.message.count({ where: { conversationId } });
    if (messageCount <= 2) {
      const title = userMessage.slice(0, 80) + (userMessage.length > 80 ? "..." : "");
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { title },
      });
    }

    // Send done event
    if (!res.writableEnded) {
      const doneData = JSON.stringify({
        type: "done",
        messageId: assistantMsg.id,
      });
      res.write(`data: ${doneData}\n\n`);
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      // Client disconnected, nothing to do
      return;
    }
    console.error("[Stream] Error:", err);
    if (!res.writableEnded) {
      const data = JSON.stringify({ type: "error", message: "Произошла ошибка при обработке запроса" });
      res.write(`data: ${data}\n\n`);
    }
  } finally {
    if (!res.writableEnded) {
      res.end();
    }
  }
}
