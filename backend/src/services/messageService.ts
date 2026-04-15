import { Response } from "express";
import prisma from "../config/database";
import { AppError } from "../middleware/errorHandler";
import { runAgent } from "./agentService";
import { acquire, release, queuePosition } from "./llmQueue";

/**
 * Detect whether a document looks like an unfilled template: long
 * underscore runs, "{{placeholder}}" markers, or bracketed placeholders.
 * Returning true triggers an explicit hint injected into the user turn,
 * so even smaller models can't miss it.
 */
function looksLikeBlankTemplate(text: string): boolean {
  const underscoreRuns = (text.match(/_{5,}/g) ?? []).length;
  const curlyPlaceholders = (text.match(/\{\{[^}]{1,60}\}\}/g) ?? []).length;
  const angleSlots = (text.match(/<[А-Яа-яA-Za-z][^<>]{1,40}>/g) ?? []).length;
  return underscoreRuns + curlyPlaceholders + angleSlots >= 3;
}

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
  attachments?: { documentId: string; filename: string }[],
): Promise<void> {
  // Verify conversation
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
  });
  if (!conv) {
    throw new AppError(404, "Диалог не найден");
  }

  // If the user did not attach anything in THIS turn but a previous turn
  // in the same conversation did, carry the most recent document over so
  // follow-up questions ("а какие риски?") still have the text to work
  // on. Past user messages in DB no longer store inflated doc bodies.
  const attachedThisTurn = !!attachments?.length;
  let effectiveAttachments = attachments;
  if (!effectiveAttachments?.length) {
    const previousWithAttachment = await prisma.message.findFirst({
      where: { conversationId, role: "user", attachments: { not: null as never } },
      orderBy: { createdAt: "desc" },
      select: { attachments: true },
    });
    const carried = previousWithAttachment?.attachments as
      | { documentId: string; filename: string }[]
      | null
      | undefined;
    if (carried?.length) {
      effectiveAttachments = carried;
    }
  }

  // Build full message with attachment context
  const contextParts = [userMessage];
  if (effectiveAttachments?.length) {
    for (const att of effectiveAttachments) {
      const doc = await prisma.document.findFirst({
        where: { id: att.documentId, userId },
      });
      if (!doc) {
        contextParts.push(`\n\n[Документ "${att.filename}" недоступен]`);
        continue;
      }
      if (doc.contentText) {
        const trailingHint = attachedThisTurn && looksLikeBlankTemplate(doc.contentText)
          ? `\n\n[ВНИМАНИЕ: в документе много пустых полей (_____, {{...}}, <...>) — это **незаполненный шаблон**. Начни ответ строкой «Документ — незаполненный шаблон.», затем с новой строки продолжи обычный структурированный анализ (тип, стороны, предмет, ключевые условия, риски и т.д.). В пустых полях пиши «не заполнено» — не подставляй выдуманные ФИО, суммы, даты, реквизиты.]`
          : "";
        contextParts.push(
          `\n\n=== ТЕКСТ ПРИКРЕПЛЁННОГО ПОЛЬЗОВАТЕЛЕМ ДОКУМЕНТА "${doc.filename}" ===\n` +
          `Важно: это реальное содержимое файла, извлечённое автоматически. НЕ отвечай "я не могу читать файлы" — текст уже перед тобой, анализируй его напрямую.\n` +
          `--- НАЧАЛО ТЕКСТА ---\n${doc.contentText}\n--- КОНЕЦ ТЕКСТА ---` +
          trailingHint,
        );
      } else {
        contextParts.push(
          `\n\n=== ПРИКРЕПЛЁННЫЙ ДОКУМЕНТ "${doc.filename}" (${doc.fileType.toUpperCase()}) ===\n` +
          `Текст не удалось извлечь автоматически. Сообщи пользователю об этом и попроси прислать документ в другом формате (PDF/DOCX/TXT) или текстом сообщения. НЕ выдумывай содержимое.`,
        );
      }
    }
  }
  const fullMessage = contextParts.join("");

  // Save user message — store only the user-typed text + attachments JSON,
  // not the inflated document body. Re-inflation only happens for the
  // current turn (below), so history replies in the same conversation do
  // not accumulate full document text and blow out num_ctx.
  await prisma.message.create({
    data: {
      conversationId,
      role: "user",
      content: userMessage,
      attachments: attachments
        ? JSON.parse(JSON.stringify(attachments))
        : undefined,
    },
  });

  // Setup SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Get conversation history for context. Past turns store only the raw
  // user text; we inflate the CURRENT turn (the just-saved message) with
  // the attachment body so the agent has the document to analyze now.
  const history = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });
  if (history.length > 0 && history[history.length - 1].role === "user") {
    history[history.length - 1] = { role: "user", content: fullMessage };
  }

  // Abort controller for client disconnect
  const abortController = new AbortController();
  res.on("close", () => abortController.abort());

  // Acquire LLM slot (serializes concurrent requests)
  const position = queuePosition();
  if (position > 0 && !res.writableEnded) {
    const data = JSON.stringify({ type: "queued", position });
    res.write(`data: ${data}\n\n`);
  }

  try {
    await acquire(abortController.signal);
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      if (!res.writableEnded) res.end();
      return;
    }
    if (!res.writableEnded) res.end();
    throw err;
  }

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
        onFile: (documentId, filename) => {
          if (!res.writableEnded) {
            const data = JSON.stringify({ type: "file", documentId, filename });
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
      userId,
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
    release();
    if (!res.writableEnded) {
      res.end();
    }
  }
}
