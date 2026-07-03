import bcrypt from "bcryptjs";
import { prisma } from "@codity/db";
import type { LoginInput, RegisterInput } from "@codity/shared";
import { ConflictError, UnauthorizedError } from "../lib/errors.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt.js";

export async function register(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ConflictError("An account with this email already exists");

  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await prisma.user.create({
    data: { email: input.email, passwordHash, name: input.name },
  });
  return issueTokens(user.id, user.email);
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw new UnauthorizedError("Invalid email or password");

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) throw new UnauthorizedError("Invalid email or password");

  return issueTokens(user.id, user.email);
}

export async function refresh(refreshToken: string) {
  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw new UnauthorizedError("User no longer exists");
  return issueTokens(user.id, user.email);
}

function issueTokens(userId: string, email: string) {
  return {
    accessToken: signAccessToken({ sub: userId, email }),
    refreshToken: signRefreshToken({ sub: userId }),
    user: { id: userId, email },
  };
}
