import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import * as conversationController from "../controllers/conversationController";
import * as messageController from "../controllers/messageController";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";

const messageLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // Key by authenticated userId so a whole team behind a single NAT/VPN
  // doesn't share one 10/min bucket. authMiddleware runs before this,
  // so req.user is always populated; fall back to IP just in case.
  keyGenerator: (req) => req.user?.userId ?? req.ip ?? "anon",
  message: { error: "Слишком много сообщений, подождите минуту" },
});

const router = Router();

router.use(authMiddleware);

const createSchema = z.object({
  title: z.string().optional(),
});

const updateSchema = z.object({
  title: z.string().min(1, "Название не может быть пустым"),
});

const sendMessageSchema = z.object({
  content: z.string().min(1, "Сообщение не может быть пустым"),
  attachments: z
    .array(
      z.object({
        documentId: z.string().uuid(),
        filename: z.string(),
      }),
    )
    .optional(),
});

// Conversations CRUD
router.get("/", conversationController.list);
router.post("/", validate(createSchema), conversationController.create);
router.get("/:id", conversationController.get);
router.patch("/:id", validate(updateSchema), conversationController.update);
router.delete("/:id", conversationController.remove);

// Messages
router.get("/:conversationId/messages", messageController.list);
router.post("/:conversationId/messages", messageLimiter, validate(sendMessageSchema), messageController.stream);

export default router;
