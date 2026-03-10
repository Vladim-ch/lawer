import { Request, Response, NextFunction } from "express";
import * as authService from "../services/authService";

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.login(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await authService.getProfile(req.user!.userId);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.changePassword({
      userId: req.user!.userId,
      currentPassword: req.body.currentPassword,
      newPassword: req.body.newPassword,
    });
    res.json({ message: "Пароль успешно изменён" });
  } catch (err) {
    next(err);
  }
}
