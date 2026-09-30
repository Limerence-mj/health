import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { Session, User } from "@prisma/client";
import { SESSION_COOKIE } from "@/contracts/constants";
import { env } from "@/server/config";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";

export type AuthContext = {
  session: Session;
  user: User;
  rawToken: string;
  source: "cookie" | "bearer";
};

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function bearer(request: NextRequest): string | null {
  const value = request.headers.get("authorization");
  if (!value) return null;
  const match = value.match(/^Bearer ([A-Za-z0-9_-]{43})$/);
  if (!match?.[1]) throw new AppError(401, "SESSION_REQUIRED", "访问凭证无效");
  return match[1];
}

export async function optionalAuth(request: NextRequest, now = new Date()): Promise<AuthContext | null> {
  const cookieToken = request.cookies.get(SESSION_COOKIE)?.value ?? null;
  const bearerToken = bearer(request);
  if (cookieToken && bearerToken && cookieToken !== bearerToken) {
    throw new AppError(401, "SESSION_REQUIRED", "Cookie 与 Bearer 凭证不一致");
  }
  const token = bearerToken ?? cookieToken;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session || session.revokedAt || session.expiresAt <= now) {
    throw new AppError(401, "SESSION_EXPIRED", "会话已失效，请重新开始");
  }
  if (session.user.isDemo) throw new AppError(401, "SESSION_REQUIRED", "公开演示标识不能作为个人访问凭证");
  return { session, user: session.user, rawToken: token, source: bearerToken ? "bearer" : "cookie" };
}

export async function requireAuth(request: NextRequest, now = new Date()): Promise<AuthContext> {
  const auth = await optionalAuth(request, now);
  if (!auth) throw new AppError(401, "SESSION_REQUIRED", "需要有效会话");
  return auth;
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date): void {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: env().APP_ORIGIN.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    maxAge,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({ name: SESSION_COOKIE, value: "", httpOnly: true, sameSite: "lax", secure: env().APP_ORIGIN.startsWith("https://"), path: "/", maxAge: 0 });
}
