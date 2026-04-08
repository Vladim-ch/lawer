import { Request, Response, NextFunction } from "express";
import * as documentService from "../services/documentService";
import { AppError } from "../middleware/errorHandler";

export async function upload(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      throw new AppError(400, "Файл не прикреплён");
    }
    // Multer decodes Content-Disposition filename as latin1; re-decode as UTF-8
    req.file.originalname = Buffer.from(req.file.originalname, "latin1").toString("utf8");
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
