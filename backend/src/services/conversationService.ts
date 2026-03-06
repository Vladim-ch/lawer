import prisma from "../config/database";
import { AppError } from "../middleware/errorHandler";

export async function listConversations(userId: string) {
  return prisma.conversation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, role: true, createdAt: true },
      },
    },
  });
}

export async function getConversation(id: string, userId: string) {
  const conv = await prisma.conversation.findFirst({
    where: { id, userId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!conv) {
    throw new AppError(404, "Диалог не найден");
  }
  return conv;
}

export async function createConversation(userId: string, title?: string) {
  return prisma.conversation.create({
    data: {
      userId,
      title: title || "Новый диалог",
    },
  });
}

export async function updateConversation(id: string, userId: string, title: string) {
  const conv = await prisma.conversation.findFirst({ where: { id, userId } });
  if (!conv) {
    throw new AppError(404, "Диалог не найден");
  }
  return prisma.conversation.update({
    where: { id },
    data: { title },
  });
}

export async function deleteConversation(id: string, userId: string) {
  const conv = await prisma.conversation.findFirst({ where: { id, userId } });
  if (!conv) {
    throw new AppError(404, "Диалог не найден");
  }
  await prisma.conversation.delete({ where: { id } });
}
