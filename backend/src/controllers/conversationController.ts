import { Request, Response, NextFunction } from "express";
import * as conversationService from "../services/conversationService";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const conversations = await conversationService.listConversations(req.user!.userId);
    res.json(conversations);
  } catch (err) {
    next(err);
  }
}

export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    const conversation = await conversationService.getConversation(
      req.params.id,
      req.user!.userId,
    );
    res.json(conversation);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const conversation = await conversationService.createConversation(
      req.user!.userId,
      req.body.title,
    );
    res.status(201).json(conversation);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const conversation = await conversationService.updateConversation(
      req.params.id,
      req.user!.userId,
      req.body.title,
    );
    res.json(conversation);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await conversationService.deleteConversation(req.params.id, req.user!.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
