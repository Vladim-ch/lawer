import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@lawer.local";
const ADMIN_NAME = process.env.ADMIN_NAME || "istadmin";
const BCRYPT_ROUNDS = 12;

async function main() {
  console.log("Seeding database...");

  const adminPassword = process.env.ADMIN_PASSWORD || crypto.randomBytes(16).toString("base64url");
  const passwordHash = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      role: "admin",
      passwordHash,
      mustChangePassword: true,
    },
  });

  console.log(`Admin user created/found: ${admin.email} (id: ${admin.id})`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log(`Generated admin password: ${adminPassword}`);
    console.log("IMPORTANT: Save this password — it will not be shown again.");
  }
  console.log("Seeding complete.");
}

main()
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
