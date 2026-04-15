import { Request, Response, NextFunction } from "express";
import * as documentService from "../services/documentService";
import { AppError } from "../middleware/errorHandler";

/**
 * Multer decodes the multipart filename field as latin1, so a UTF-8
 * filename like "Договор.docx" arrives as mojibake (each Cyrillic byte
 * shows up as a 0x80-0xFF latin1 char). Re-interpret those bytes as
 * UTF-8 only when the string looks like mojibake — if the name already
 * contains real non-BMP-latin1 chars (U+0100+) or only ASCII, leave it
 * alone. This avoids double-decoding filenames from modern browsers
 * that already send proper UTF-8 in multipart.
 */
function fixMulterFilename(name: string): string {
  let hasHighLatin1 = false;
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (code >= 0x100) return name; // real UTF-8 char already decoded
    if (code >= 0x80) hasHighLatin1 = true;
  }
  if (!hasHighLatin1) return name;
  try {
    const decoded = Buffer.from(name, "latin1").toString("utf8");
    // Guard: if re-decoding produced replacement chars, the original
    // was not mojibake — keep the original bytes.
    if (decoded.includes("\uFFFD")) return name;
    return decoded;
  } catch {
    return name;
  }
}

export async function upload(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      throw new AppError(400, "Файл не прикреплён");
    }
    req.file.originalname = fixMulterFilename(req.file.originalname);
    const doc = await documentService.uploadDocument(req.user!.userId, req.file);
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const docs = await documentService.listDocuments(req.user!.userId);
    res.json(docs);
  } catch (err) {
    next(err);
  }
}

export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    const doc = await documentService.getDocument(req.params.id, req.user!.userId);
    res.json(doc);
  } catch (err) {
    next(err);
  }
}

export async function download(req: Request, res: Response, next: NextFunction) {
  try {
    const { stream, filename, contentType, fileSize } =
      await documentService.downloadDocument(req.params.id, req.user!.userId);

    // RFC 5987 encoding for non-ASCII filenames
    const encodedFilename = encodeURIComponent(filename).replace(/['()]/g, escape);

    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="document"; filename*=UTF-8''${encodedFilename}`,
    );
    if (fileSize) {
      res.setHeader("Content-Length", fileSize);
    }

    stream.pipe(res);

    stream.on("error", (err) => {
      console.error("[Download] Stream error:", err.message);
      if (!res.headersSent) {
        next(new AppError(500, "Ошибка при скачивании файла"));
      }
    });
  } catch (err) {
    next(err);
  }
}
