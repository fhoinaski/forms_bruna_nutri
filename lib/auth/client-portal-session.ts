import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getActivePatientPortalSession, getPatientPortalAccess } from "@/lib/repositories/patient-portal-auth";

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
  sid?: string;
  mustChangePassword?: boolean;
}

export async function createClientPortalToken(clientId: string, sessionVersion: number, sessionId: string): Promise<string> {
  return new SignJWT({ sub: clientId, type: "client_portal", sessionVersion, sid: sessionId })
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
      typeof payload.sessionVersion !== "number" ||
      typeof payload.sid !== "string"
    ) return null;
    const [access, session] = await Promise.all([getPatientPortalAccess(payload.sub), getActivePatientPortalSession(payload.sid)]);
    if (!access || !session || session.client_id !== payload.sub || session.access_id !== access.id) return null;
    if (access.is_active !== 1 || !["ACTIVE", "TEMP_PASSWORD", "PASSWORD_CHANGE_REQUIRED"].includes(access.access_status)) return null;
    if (access.session_version !== payload.sessionVersion) return null;
    return { sub: payload.sub, type: "client_portal", sessionVersion: payload.sessionVersion, sid: payload.sid, mustChangePassword: access.password_must_change === 1 };
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

export async function getClientPortalSessionFromCookies(allowPasswordChange = false): Promise<ClientPortalSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifyClientPortalToken(token);
  return session?.mustChangePassword && !allowPasswordChange ? null : session;
}

export async function getClientPortalSessionFromRequest(request: NextRequest, allowPasswordChange = false): Promise<ClientPortalSession | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifyClientPortalToken(token);
  return session?.mustChangePassword && !allowPasswordChange ? null : session;
}
