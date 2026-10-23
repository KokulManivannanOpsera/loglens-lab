import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { Request, Response, NextFunction } from "express";
import { findUserById, publicUser, type UserRecord } from "./users.js";

export const COOKIE_NAME = "loglens_session";
const TOKEN_TTL = "7d";

export type SessionUser = { id: string; email: string };

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 16) {
    // Dev fallback — override in server/.env for anything shared
    return new TextEncoder().encode("loglens-dev-session-secret-change-me");
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export async function signSession(user: UserRecord): Promise<string> {
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(getSecretKey());
}

export async function verifySession(
  token: string,
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const id = typeof payload.sub === "string" ? payload.sub : null;
    const email = typeof payload.email === "string" ? payload.email : null;
    if (!id || !email) return null;
    const user = findUserById(id);
    if (!user || user.email !== email) return null;
    return publicUser(user);
  } catch {
    return null;
  }
}

function cookieSecure(): boolean {
  // Explicit override wins; otherwise HTTPS cookies in production (D5 PaaS).
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
  });
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token || typeof token !== "string") {
    res.status(401).json({
      error: "Authentication required",
      hint: "Sign up or log in first",
    });
    return;
  }
  const user = await verifySession(token);
  if (!user) {
    clearSessionCookie(res);
    res.status(401).json({
      error: "Session expired or invalid",
      hint: "Please log in again",
    });
    return;
  }
  req.user = user;
  next();
}

export function validateCredentials(
  email: string,
  password: string,
): string | null {
  const trimmed = email.trim();
  if (!trimmed || !trimmed.includes("@") || trimmed.length > 200) {
    return "Enter a valid email address";
  }
  if (!password || password.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (password.length > 200) {
    return "Password is too long";
  }
  return null;
}
