import { Router } from "express";
import { z } from "zod";
import * as authController from "../controllers/authController";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";

const router = Router();

const loginSchema = z.object({
  email: z.string().email("Некорректный email"),
  password: z.string().min(1, "Пароль обязателен"),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Текущий пароль обязателен"),
  newPassword: z.string().min(6, "Новый пароль должен содержать минимум 6 символов"),
});

router.post("/login", validate(loginSchema), authController.login);
router.get("/profile", authMiddleware, authController.getProfile);
router.post("/change-password", authMiddleware, validate(changePasswordSchema), authController.changePassword);

export default router;
