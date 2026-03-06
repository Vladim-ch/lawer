import dotenv from "dotenv";
dotenv.config();

export const env = {
  port: parseInt(process.env.BACKEND_PORT || "3001", 10),
  databaseUrl: process.env.DATABASE_URL || "",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  jwt: {
    secret: process.env.JWT_SECRET || "dev-secret",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  },
  minio: {
    endpoint: process.env.MINIO_ENDPOINT || "localhost",
    port: parseInt(process.env.MINIO_PORT || "9000", 10),
    accessKey: process.env.MINIO_ACCESS_KEY || "lawer_minio",
    secretKey: process.env.MINIO_SECRET_KEY || "lawer_minio_secret",
    bucket: process.env.MINIO_BUCKET || "lawer-documents",
  },
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  llm: {
    provider: process.env.LLM_PROVIDER || "anthropic",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  },
} as const;
