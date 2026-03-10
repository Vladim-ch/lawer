import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { requireRole } from "../middleware/roleMiddleware";
import { validate } from "../middleware/validate";
import * as userController from "../controllers/userController";

const router = Router();

// All admin routes require authentication and admin role
router.use(authMiddleware);
router.use(requireRole("admin"));

const createUserSchema = z.object({
  email: z.string().email("Некорректный email"),
  name: z.string().min(2, "Имя должно содержать минимум 2 символа"),
  password: z.string().min(6, "Пароль должен содержать минимум 6 символов"),
  role: z.enum(["admin", "lawyer", "viewer"], {
    errorMap: () => ({ message: "Роль должна быть: admin, lawyer или viewer" }),
  }),
});

const updateUserSchema = z.object({
  name: z.string().min(2, "Имя должно содержать минимум 2 символа").optional(),
  email: z.string().email("Некорректный email").optional(),
  role: z
    .enum(["admin", "lawyer", "viewer"], {
      errorMap: () => ({ message: "Роль должна быть: admin, lawyer или viewer" }),
    })
    .optional(),
  resetPassword: z.boolean().optional(),
});

router.get("/users", userController.listUsers);
router.get("/users/:id", userController.getUserById);
router.post("/users", validate(createUserSchema), userController.createUser);
router.patch("/users/:id", validate(updateUserSchema), userController.updateUser);
router.delete("/users/:id", userController.deleteUser);

export default router;
