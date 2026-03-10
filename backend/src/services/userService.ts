import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import prisma from "../config/database";
import { AppError } from "../middleware/errorHandler";

const BCRYPT_ROUNDS = 12;
const DEFAULT_TEMP_PASSWORD = "changeme123";

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
  mustChangePassword: true,
} as const;

interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  role: UserRole;
}

interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: UserRole;
  resetPassword?: boolean;
}

export async function listUsers() {
  return prisma.user.findMany({
    select: USER_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: USER_SELECT,
  });

  if (!user) {
    throw new AppError(404, "Пользователь не найден");
  }

  return user;
}

export async function createUser(input: CreateUserInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError(409, "Пользователь с таким email уже существует");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      role: input.role,
      passwordHash,
      mustChangePassword: true,
    },
    select: USER_SELECT,
  });

  return user;
}

export async function updateUser(id: string, input: UpdateUserInput) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new AppError(404, "Пользователь не найден");
  }

  if (input.email && input.email !== user.email) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new AppError(409, "Пользователь с таким email уже существует");
    }
  }

  const data: Record<string, unknown> = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.email !== undefined) data.email = input.email;
  if (input.role !== undefined) data.role = input.role;

  if (input.resetPassword) {
    data.passwordHash = await bcrypt.hash(DEFAULT_TEMP_PASSWORD, BCRYPT_ROUNDS);
    data.mustChangePassword = true;
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: USER_SELECT,
  });

  return updated;
}

export async function deleteUser(id: string, currentUserId: string) {
  if (id === currentUserId) {
    throw new AppError(400, "Нельзя удалить собственную учётную запись");
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new AppError(404, "Пользователь не найден");
  }

  if (user.role === "admin") {
    const adminCount = await prisma.user.count({ where: { role: "admin" } });
    if (adminCount <= 1) {
      throw new AppError(400, "Нельзя удалить последнего администратора");
    }
  }

  await prisma.user.delete({ where: { id } });
}
