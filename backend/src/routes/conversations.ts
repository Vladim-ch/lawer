import { Router } from "express";
import { z } from "zod";
import * as conversationController from "../controllers/conversationController";
import * as messageController from "../controllers/messageController";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";

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
router.post("/:conversationId/messages", validate(sendMessageSchema), messageController.stream);

export default router;
