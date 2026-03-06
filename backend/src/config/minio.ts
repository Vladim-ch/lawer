import * as Minio from "minio";
import { env } from "./env";

const minioClient = new Minio.Client({
  endPoint: env.minio.endpoint,
  port: env.minio.port,
  useSSL: false,
  accessKey: env.minio.accessKey,
  secretKey: env.minio.secretKey,
});

export async function ensureBucket(): Promise<void> {
  const exists = await minioClient.bucketExists(env.minio.bucket);
  if (!exists) {
    await minioClient.makeBucket(env.minio.bucket);
    console.log(`MinIO bucket "${env.minio.bucket}" created`);
  }
}

export default minioClient;
