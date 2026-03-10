import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { ensureBucket } from "./config/minio";
import { errorHandler } from "./middleware/errorHandler";
import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import conversationRoutes from "./routes/conversations";

const app = express();

// Middleware
app.use(cors({ origin: env.frontendUrl, credentials: true }));
app.use(express.json({ limit: "50mb" }));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/conversations", conversationRoutes);

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
