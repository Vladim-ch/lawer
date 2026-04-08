import { Router } from "express";
import multer from "multer";
import * as documentController from "../controllers/documentController";
import { authMiddleware } from "../middleware/auth";

const router = Router();

router.use(authMiddleware);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".docx", ".doc", ".txt", ".rtf"];
    const ext = "." + file.originalname.split(".").pop()?.toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Неподдерживаемый формат файла. Допустимые: PDF, DOCX, TXT, RTF",
        ),
      );
    }
  },
});

router.get("/", documentController.list);
router.get("/:id", documentController.get);
router.post("/upload", upload.single("file"), documentController.upload);

export default router;
