import { Request, Response, NextFunction } from "express";
import * as documentService from "../services/documentService";
import { AppError } from "../middleware/errorHandler";

export async function upload(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      throw new AppError(400, "Файл не прикреплён");
    }
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
