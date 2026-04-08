import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { ensureBucket } from "./config/minio";
import { shutdownAll as shutdownMcp } from "./services/mcpClient";
import { errorHandler } from "./middleware/errorHandler";
import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import conversationRoutes from "./routes/conversations";
import documentRoutes from "./routes/documents";

const app = express();

// Security headers
app.use(helmet());

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много запросов, попробуйте позже" },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много попыток входа, попробуйте позже" },
});

app.use(generalLimiter);

// Middleware
app.use(cors({ origin: env.frontendUrl, credentials: true }));
app.use(express.json({ limit: "10mb" }));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/documents", documentRoutes);

// Error handler
app.use(errorHandler);

async function start() {
  try {
    // Ensure MinIO bucket exists
    await ensureBucket().catch((err) => {
      console.warn("MinIO not available, file uploads will fail:", err.message);
    });

    app.listen(env.port, () => {
      console.log(`Lawer backend running on port ${env.port}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

start();

// Graceful shutdown — kill MCP child processes on exit
function shutdown() {
  console.log("[Server] Shutting down...");
  shutdownMcp();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
