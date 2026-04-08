import { Request, Response, NextFunction } from "express";
import * as messageService from "../services/messageService";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const messages = await messageService.getMessages(
      req.params.conversationId,
      req.user!.userId,
    );
    res.json(messages);
  } catch (err) {
    next(err);
  }
}

export async function stream(req: Request, res: Response, next: NextFunction) {
  try {
    await messageService.streamResponse(
      req.params.conversationId,
      req.user!.userId,
      req.body.content,
      res,
      req.body.attachments,
    );
  } catch (err) {
    next(err);
  }
}
