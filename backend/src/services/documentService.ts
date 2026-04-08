import { v4 as uuidv4 } from "uuid";
import { Document } from "@prisma/client";
import minioClient from "../config/minio";
import { callTool } from "./mcpClient";
import prisma from "../config/database";
import { env } from "../config/env";
import { AppError } from "../middleware/errorHandler";

const FILE_TYPE_MAP: Record<string, string> = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".doc": "doc",
  ".txt": "txt",
  ".rtf": "rtf",
};

function getFileType(filename: string): string {
  const ext = "." + filename.split(".").pop()?.toLowerCase();
  return FILE_TYPE_MAP[ext] || "unknown";
}

/**
 * Upload file to MinIO, extract text via MCP parse_document, save to DB.
 */
export async function uploadDocument(
  userId: string,
  file: Express.Multer.File,
): Promise<Document> {
  const uniquePath = `documents/${userId}/${uuidv4()}_${file.originalname}`;
  const fileType = getFileType(file.originalname);

  // Upload to MinIO
  await minioClient.putObject(
    env.minio.bucket,
    uniquePath,
    file.buffer,
    file.size,
    { "Content-Type": file.mimetype },
  );

  // Extract text via MCP
  let contentText: string | null = null;
  try {
    const base64 = file.buffer.toString("base64");
    const response = await callTool("parse_document", {
      content: base64,
      fileType,
    }) as { content?: Array<{ type: string; text: string }> };

    if (response?.content?.[0]?.type === "text") {
      const parsed = JSON.parse(response.content[0].text);
      contentText = parsed.text || null;
    }
  } catch (err) {
    console.warn(
      `[DocumentService] Failed to extract text from "${file.originalname}":`,
      (err as Error).message,
    );
  }

  // Save to DB
  const document = await prisma.document.create({
    data: {
      userId,
      filename: file.originalname,
      filePath: uniquePath,
      fileType,
      contentText,
      fileSize: file.size,
    },
  });

  return document;
}

/**
 * Get document by id with ownership check.
 */
export async function getDocument(
  documentId: string,
  userId: string,
): Promise<Document> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, userId },
  });

  if (!document) {
    throw new AppError(404, "Документ не найден");
  }

  return document;
}

/**
 * Get all documents for a user.
 */
export async function listDocuments(userId: string): Promise<Document[]> {
  return prisma.document.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}
