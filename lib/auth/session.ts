import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type { AdminUser } from "@/lib/repositories/admin-users";
import { d1Query } from "@/lib/d1/client";

const COOKIE_NAME = "bruna_nutri_admin_session";
const MAX_AGE = 60 * 60 * 8; // 8 hours
const INTERNAL_ASSERTION_MAX_AGE = 30;
const SESSION_CACHE_MAX_ENTRIES = 500;
const configuredCacheTtl = Number(process.env.SESSION_VERSION_CACHE_TTL_MS ?? 15_000);
const SESSION_CACHE_TTL_MS = Number.isFinite(configuredCacheTtl) && configuredCacheTtl >= 0 ? configuredCacheTtl : 15_000;
export const INTERNAL_SESSION_HEADER = "x-bruna-admin-session";

const sessionVersionCache = new Map<string, { version: number; expiresAt: number }>();

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
  sessionVersion: number;
}

function parseSessionPayload(payload: Record<string, unknown>): SessionPayload | null {
  if (
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.name !== "string" ||
    typeof payload.mustChangePassword !== "boolean" ||
    typeof payload.sessionVersion !== "number"
  ) return null;
  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    mustChangePassword: payload.mustChangePassword,
    sessionVersion: payload.sessionVersion,
  };
}

export function primeSessionVersionCache(userId: string, version: number): void {
  if (sessionVersionCache.size >= SESSION_CACHE_MAX_ENTRIES && !sessionVersionCache.has(userId)) {
    sessionVersionCache.delete(sessionVersionCache.keys().next().value as string);
  }
  sessionVersionCache.set(userId, { version, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
}

export function invalidateSessionVersionCache(userId: string): void {
  sessionVersionCache.delete(userId);
}

async function hasCurrentSessionVersion(userId: string, expectedVersion: number): Promise<boolean> {
  // So confia no cache para o veredito POSITIVO (versao bate — caminho
  // comum, evita ida ao banco a cada request). Um veredito NEGATIVO do
  // cache nunca e definitivo: proxy.ts (Edge) e as rotas de API (Node.js)
  // sao runtimes isolados, cada um com sua propria instancia deste modulo —
  // primeSessionVersionCache() escrito por uma rota Node.js (ex.:
  // change-password, habilitar/desabilitar MFA) nunca chega ao cache do
  // Edge. Sem isso, um admin que troca a senha logo apos abrir uma pagina
  // do dashboard era derrubado de volta para /login por ate
  // SESSION_VERSION_CACHE_TTL_MS, mesmo com o token novo va correto —
  // sempre reconsulta o banco antes de decidir por invalido.
  const cached = sessionVersionCache.get(userId);
  if (cached && cached.expiresAt > Date.now() && cached.version === expectedVersion) return true;
  if (cached && cached.expiresAt <= Date.now()) sessionVersionCache.delete(userId);
  const current = (await d1Query<{ session_version: number }>(
    "SELECT session_version FROM admin_users WHERE id = ?1 LIMIT 1",
    [userId]
  ))[0];
  if (!current) return false;
  primeSessionVersionCache(userId, current.session_version);
  return current.session_version === expectedVersion;
}

export async function createSessionToken(
  admin: Pick<AdminUser, "id" | "email" | "name" | "must_change_password" | "session_version">
): Promise<string> {
  const payload: SessionPayload = {
    sub: admin.id,
    email: admin.email,
    name: admin.name,
    mustChangePassword: admin.must_change_password === 1,
    sessionVersion: admin.session_version,
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
    const session = parseSessionPayload(payload as Record<string, unknown>);
    if (!session || !(await hasCurrentSessionVersion(session.sub, session.sessionVersion))) return null;
    return session;
  } catch {
    return null;
  }
}

export async function createInternalSessionAssertion(session: SessionPayload): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("bruna-nutri-internal")
    .setIssuedAt()
    .setExpirationTime(`${INTERNAL_ASSERTION_MAX_AGE}s`)
    .sign(getSecret());
}

export async function verifyInternalSessionAssertion(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { audience: "bruna-nutri-internal" });
    return parseSessionPayload(payload as Record<string, unknown>);
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
  const assertion = (await headers()).get(INTERNAL_SESSION_HEADER);
  if (assertion) {
    const session = await verifyInternalSessionAssertion(assertion);
    if (session) return session;
  }
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
  const assertion = request.headers.get(INTERNAL_SESSION_HEADER);
  if (assertion) {
    const session = await verifyInternalSessionAssertion(assertion);
    if (session) return session;
  }
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
