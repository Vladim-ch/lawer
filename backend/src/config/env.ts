import dotenv from "dotenv";
dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function buildDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  // Passwords use RFC 3986 unreserved chars only, no encoding needed
  const user = requireEnv("POSTGRES_USER");
  const password = requireEnv("POSTGRES_PASSWORD");
  const host = process.env.POSTGRES_HOST || "localhost";
  const port = process.env.POSTGRES_PORT || "5432";
  const db = process.env.POSTGRES_DB || "lawer";
  return `postgresql://${user}:${password}@${host}:${port}/${db}?schema=public`;
}

function buildRedisUrl(): string {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;

  const password = requireEnv("REDIS_PASSWORD");
  const host = process.env.REDIS_HOST || "localhost";
  const port = process.env.REDIS_PORT || "6379";
  return `redis://:${password}@${host}:${port}`;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: parseInt(process.env.BACKEND_PORT || "4001", 10),
  databaseUrl: buildDatabaseUrl(),
  redisUrl: buildRedisUrl(),
  jwt: {
    secret: requireEnv("JWT_SECRET"),
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  },
  minio: {
    endpoint: process.env.MINIO_ENDPOINT || "localhost",
    port: parseInt(process.env.MINIO_PORT || "9000", 10),
    accessKey: requireEnv("MINIO_ACCESS_KEY"),
    secretKey: requireEnv("MINIO_SECRET_KEY"),
    bucket: process.env.MINIO_BUCKET || "lawer-documents",
  },
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:4000",
  llm: {
    provider: process.env.LLM_PROVIDER || "ollama",
    ollamaUrl: process.env.OLLAMA_URL || "http://ollama:11434",
    ollamaModel: process.env.OLLAMA_MODEL || "qwen2.5:1.5b",
    maxContext: parseInt(process.env.LLM_MAX_CONTEXT || "10", 10),
    temperature: parseFloat(process.env.LLM_TEMPERATURE || "0.3"),
    numCtx: parseInt(process.env.LLM_NUM_CTX || "2048", 10),
    numPredict: parseInt(process.env.LLM_NUM_PREDICT || "1024", 10),
    maxToolIterations: parseInt(process.env.LLM_MAX_TOOL_ITERATIONS || "3", 10),
  },
} as const;
