import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import { Document } from "@prisma/client";
import minioClient from "../config/minio";
import { callTool } from "./mcpClient";
import prisma from "../config/database";
import { env } from "../config/env";
import { AppError } from "../middleware/errorHandler";

const FILE_TYPE_MAP: Record<string, string> = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".txt": "txt",
};

function getFileType(filename: string): string {
  const ext = "." + filename.split(".").pop()?.toLowerCase();
  return FILE_TYPE_MAP[ext] || "unknown";
}

/**
 * Upload file to MinIO, extract text via MCP parse_document, save to DB.
 * With disk storage, file.path points to a temp file — streamed to MinIO,
 * then read for MCP text extraction, and cleaned up afterwards.
 */
export async function uploadDocument(
  userId: string,
  file: Express.Multer.File,
): Promise<Document> {
  const uniquePath = `documents/${userId}/${uuidv4()}_${file.originalname}`;
  const fileType = getFileType(file.originalname);

  try {
    // Stream file to MinIO from disk (no full buffer in RAM)
    await minioClient.putObject(
      env.minio.bucket,
      uniquePath,
      fs.createReadStream(file.path),
      file.size,
      { "Content-Type": file.mimetype },
    );

    // Extract text via MCP (read file to base64 for parse_document).
    // On failure we keep contentText = null so the file is still uploaded
    // and downloadable, but downstream code can detect the missing text.
    let contentText: string | null = null;
    try {
      const base64 = await fs.promises.readFile(file.path, { encoding: "base64" });
      const response = await callTool("parse_document", {
        content: base64,
        fileType,
      }) as {
        content?: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      if (response?.isError) {
        const errBody = response?.content?.[0]?.text ?? "(no error body)";
        console.warn(
          `[DocumentService] parse_document returned error for "${file.originalname}" (${fileType}): ${errBody}`,
        );
      } else if (response?.content?.[0]?.type === "text") {
        const parsed = JSON.parse(response.content[0].text);
        contentText = parsed.text || null;
        if (!contentText) {
          console.warn(
            `[DocumentService] parse_document returned empty text for "${file.originalname}" (${fileType})`,
          );
        }
      } else {
        console.warn(
          `[DocumentService] Unexpected parse_document response for "${file.originalname}" (${fileType})`,
        );
      }
    } catch (err) {
      console.warn(
        `[DocumentService] Failed to extract text from "${file.originalname}":`,
        (err as Error).message,
      );
    }

    // Save to DB. If this fails, the file is already in MinIO — remove it
    // so we don't leave an orphan object behind.
    let document: Document;
    try {
      document = await prisma.document.create({
        data: {
          userId,
          filename: file.originalname,
          filePath: uniquePath,
          fileType,
          contentText,
          fileSize: file.size,
        },
      });
    } catch (dbErr) {
      await minioClient.removeObject(env.minio.bucket, uniquePath).catch((cleanupErr) => {
        console.warn(
          `[DocumentService] Failed to remove orphan object "${uniquePath}":`,
          (cleanupErr as Error).message,
        );
      });
      throw dbErr;
    }

    return document;
  } finally {
    // Clean up temp file
    fs.promises.unlink(file.path).catch(() => {});
  }
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

/**
 * Download file from MinIO by document id with ownership check.
 * Returns a readable stream along with filename and content type.
 */
export async function downloadDocument(
  documentId: string,
  userId: string,
): Promise<{ stream: import("stream").Readable; filename: string; contentType: string; fileSize: number | null }> {
  const document = await getDocument(documentId, userId);

  const CONTENT_TYPE_MAP: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    txt: "text/plain; charset=utf-8",
    rtf: "application/rtf",
  };

  const contentType = CONTENT_TYPE_MAP[document.fileType] || "application/octet-stream";
  const stream = await minioClient.getObject(env.minio.bucket, document.filePath);

  return {
    stream,
    filename: document.filename,
    contentType,
    fileSize: document.fileSize,
  };
}

/**
 * Save a generated file (from MCP tool result) to MinIO and create a Document record.
 * Expects base64-encoded file content from the tool result.
 */
export async function saveGeneratedDocument(
  userId: string,
  filename: string,
  base64Content: string,
  fileType: string,
): Promise<Document> {
  const buffer = Buffer.from(base64Content, "base64");
  const uniquePath = `documents/${userId}/${uuidv4()}_${filename}`;

  const MIME_MAP: Record<string, string> = {
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pdf: "application/pdf",
    txt: "text/plain",
  };

  await minioClient.putObject(
    env.minio.bucket,
    uniquePath,
    buffer,
    buffer.length,
    { "Content-Type": MIME_MAP[fileType] || "application/octet-stream" },
  );

  try {
    const document = await prisma.document.create({
      data: {
        userId,
        filename,
        filePath: uniquePath,
        fileType,
        fileSize: buffer.length,
      },
    });
    return document;
  } catch (dbErr) {
    await minioClient.removeObject(env.minio.bucket, uniquePath).catch((cleanupErr) => {
      console.warn(
        `[DocumentService] Failed to remove orphan generated object "${uniquePath}":`,
        (cleanupErr as Error).message,
      );
    });
    throw dbErr;
  }
}
