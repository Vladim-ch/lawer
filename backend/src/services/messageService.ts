import { Response } from "express";
import prisma from "../config/database";
import { AppError } from "../middleware/errorHandler";

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
 * Stream an LLM response via SSE.
 * For MVP, this sends a simulated streamed response.
 * In production, this will proxy to Claude API or local LLM.
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
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });

  // MVP: simulated LLM response
  // TODO: Replace with actual LLM API call (Claude/local)
  const assistantResponse = generateMvpResponse(userMessage, messages);

  // Stream the response token by token
  const tokens = assistantResponse.split(" ");
  let fullResponse = "";

  for (let i = 0; i < tokens.length; i++) {
    const token = (i > 0 ? " " : "") + tokens[i];
    fullResponse += token;

    const data = JSON.stringify({ type: "token", content: token });
    res.write(`data: ${data}\n\n`);

    // Simulate token generation delay
    await new Promise((resolve) => setTimeout(resolve, 30));
  }

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
  const doneData = JSON.stringify({
    type: "done",
    messageId: assistantMsg.id,
  });
  res.write(`data: ${doneData}\n\n`);
  res.end();
}

function generateMvpResponse(
  userMessage: string,
  _history: Array<{ role: string; content: string }>,
): string {
  const lower = userMessage.toLowerCase();

  if (lower.includes("договор") || lower.includes("контракт")) {
    return (
      "Я могу помочь вам с подготовкой договора. В рамках MVP доступны следующие типы:\n\n" +
      "1. **Договор поставки** -- регулирует отношения по передаче товаров\n" +
      "2. **Договор оказания услуг** -- для оформления отношений по оказанию услуг\n" +
      "3. **NDA (соглашение о неразглашении)** -- для защиты конфиденциальной информации\n\n" +
      "Укажите тип договора и основные параметры (стороны, предмет, сроки), и я подготовлю проект.\n\n" +
      "*Обратите внимание: сгенерированный документ требует проверки юристом перед подписанием.*"
    );
  }

  if (lower.includes("документ") || lower.includes("анализ") || lower.includes("загруз")) {
    return (
      "Для анализа документа загрузите файл в формате `.docx`, `.pdf`, `.txt` или `.rtf` " +
      "через кнопку прикрепления файла.\n\n" +
      "Я могу:\n" +
      "- Составить **краткое резюме** документа\n" +
      "- Выявить **ключевые условия** и обязательства сторон\n" +
      "- Определить **потенциальные риски**\n" +
      "- Проверить на соответствие **внутренним стандартам**\n\n" +
      "Какой именно анализ вас интересует?"
    );
  }

  return (
    "Здравствуйте! Я -- AI-ассистент юридического отдела **Lawer**.\n\n" +
    "Я могу помочь вам с:\n" +
    "- **Анализом документов** -- загрузите файл для получения резюме и выявления рисков\n" +
    "- **Генерацией договоров** -- создание типовых договоров по шаблонам\n" +
    "- **Юридическими вопросами** -- ответы с опорой на законодательство РФ\n\n" +
    "Чем могу помочь?"
  );
}
