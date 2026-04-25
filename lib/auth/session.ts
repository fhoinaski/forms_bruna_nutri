import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type { AdminUser } from "@/lib/repositories/admin-users";

const COOKIE_NAME = "bruna_nutri_admin_session";
const MAX_AGE = 60 * 60 * 8; // 8 hours

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET environment variable is not set.");
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  sub: string;
  email: string;
  name: string;
  mustChangePassword: boolean;
}

export async function createSessionToken(
  admin: Pick<AdminUser, "id" | "email" | "name" | "must_change_password">
): Promise<string> {
  const payload: SessionPayload = {
    sub: admin.id,
    email: admin.email,
    name: admin.name,
    mustChangePassword: admin.must_change_password === 1,
  };
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const p = payload as Record<string, unknown>;
    if (
      typeof p.sub !== "string" ||
      typeof p.email !== "string" ||
      typeof p.name !== "string" ||
      typeof p.mustChangePassword !== "boolean"
    ) {
      return null;
    }
    return {
      sub: p.sub,
      email: p.email,
      name: p.name,
      mustChangePassword: p.mustChangePassword,
    };
  } catch {
    return null;
  }
}

export function setAuthCookie(response: NextResponse, token: string): void {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function clearAuthCookie(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// Keep legacy names as aliases so existing callers don't break
export const setSessionCookie = setAuthCookie;
export const clearSessionCookie = clearAuthCookie;

export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

// Legacy alias used by existing routes
export const getCurrentAdmin = getSessionFromCookies;

export async function getAdminFromRequest(
  request: NextRequest
): Promise<SessionPayload | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
