import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getClientPortalAccess } from "@/lib/repositories/client-portal";

const COOKIE_NAME = "bruna_nutri_client_portal";
const MAX_AGE = 60 * 60 * 24 * 7;

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET environment variable is not set.");
  return new TextEncoder().encode(secret);
}

export interface ClientPortalSession {
  sub: string;
  type: "client_portal";
  sessionVersion: number;
}

export async function createClientPortalToken(clientId: string, sessionVersion: number): Promise<string> {
  return new SignJWT({ sub: clientId, type: "client_portal", sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifyClientPortalToken(token: string): Promise<ClientPortalSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (
      payload.type !== "client_portal" ||
      typeof payload.sub !== "string" ||
      typeof payload.sessionVersion !== "number"
    ) return null;
    const access = await getClientPortalAccess(payload.sub);
    if (!access || access.is_active !== 1) return null;
    if (access.session_version !== payload.sessionVersion) return null;
    return { sub: payload.sub, type: "client_portal", sessionVersion: payload.sessionVersion };
  } catch {
    return null;
  }
}

export function setClientPortalCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function clearClientPortalCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getClientPortalSessionFromCookies(): Promise<ClientPortalSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyClientPortalToken(token);
}

export async function getClientPortalSessionFromRequest(request: NextRequest): Promise<ClientPortalSession | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyClientPortalToken(token);
}
