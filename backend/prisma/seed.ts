import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ADMIN_EMAIL = "admin@lawer.local";
const ADMIN_NAME = "istadmin";
const ADMIN_PASSWORD = "changeme123";
const BCRYPT_ROUNDS = 12;

async function main() {
  console.log("Seeding database...");

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);

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
