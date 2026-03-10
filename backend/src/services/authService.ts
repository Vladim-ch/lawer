import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../config/database";
import { env } from "../config/env";
import { AppError } from "../middleware/errorHandler";
import type { JwtPayload } from "../middleware/auth";

interface LoginInput {
  email: string;
  password: string;
}

interface AuthResult {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  mustChangePassword?: boolean;
}

function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
  } as jwt.SignOptions);
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw new AppError(401, "Неверный email или пароль");
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, "Неверный email или пароль");
  }

  const token = generateToken({ userId: user.id, email: user.email, role: user.role });

  return {
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    mustChangePassword: user.mustChangePassword,
  };
}

interface ChangePasswordInput {
  userId: string;
  currentPassword: string;
  newPassword: string;
}

export async function changePassword(input: ChangePasswordInput): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) {
    throw new AppError(404, "Пользователь не найден");
  }

  const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!valid) {
    throw new AppError(400, "Текущий пароль указан неверно");
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 12);

  await prisma.user.update({
    where: { id: input.userId },
    data: {
      passwordHash,
      mustChangePassword: false,
    },
  });
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, createdAt: true, mustChangePassword: true },
  });
  if (!user) {
    throw new AppError(404, "Пользователь не найден");
  }
  return user;
}
