import { Router } from "express";
import { z } from "zod";
import * as authController from "../controllers/authController";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";

const router = Router();

const registerSchema = z.object({
  email: z.string().email("Некорректный email"),
  name: z.string().min(2, "Имя должно содержать минимум 2 символа"),
  password: z.string().min(6, "Пароль должен содержать минимум 6 символов"),
});

const loginSchema = z.object({
  email: z.string().email("Некорректный email"),
  password: z.string().min(1, "Пароль обязателен"),
});

router.post("/register", validate(registerSchema), authController.register);
router.post("/login", validate(loginSchema), authController.login);
router.get("/profile", authMiddleware, authController.getProfile);

export default router;
