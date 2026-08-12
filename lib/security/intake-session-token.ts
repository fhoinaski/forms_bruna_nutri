import { SignJWT, jwtVerify } from "jose";
import type { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "bruna_nutri_pre_consulta_intake";
const COOKIE_PATH = "/api/public/pre-consultation/intake";
const INTAKE_SESSION_TTL_SECONDS = 60 * 60; // 60 minutos — casado com INTAKE_SESSION_TTL_MS.

const MIN_SECRET_BYTES = 32;

/**
 * Segredo DEDICADO para a sessão pública de intake — nunca reutiliza o
 * segredo de autenticação administrativa (AUTH_SECRET) em produção.
 *
 * - Produção: exige PATIENT_INTAKE_SESSION_SECRET com ≥32 bytes e falha de
 *   forma explícita se ausente/curto.
 * - Dev/teste: permite fallback para AUTH_SECRET e, por fim, para uma
 *   constante local — mesmo padrão de "cadeia" já usado em lib/security/crypto.ts
 *   e lib/security/request.ts (nunca um segredo próximo de subir).
 */
function resolveSecret(): Uint8Array {
  const dedicated = process.env.PATIENT_INTAKE_SESSION_SECRET;
  if (dedicated) {
    if (Buffer.byteLength(dedicated, "utf8") < MIN_SECRET_BYTES) {
      throw new Error(
        "PATIENT_INTAKE_SESSION_SECRET must be at least 32 bytes."
      );
    }
    return new TextEncoder().encode(dedicated);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "PATIENT_INTAKE_SESSION_SECRET environment variable is not set in production."
    );
  }

  const fallback = process.env.AUTH_SECRET || "local-development";
  return new TextEncoder().encode(fallback);
}

export interface IntakeSessionTokenPayload {
  sid: string;
}

export async function createIntakeSessionToken(sessionId: string): Promise<string> {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${INTAKE_SESSION_TTL_SECONDS}s`)
    .sign(resolveSecret());
}

export async function verifyIntakeSessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, resolveSecret());
    if (typeof payload.sid !== "string") return null;
    return payload.sid;
  } catch {
    return null;
  }
}

export function setIntakeSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: INTAKE_SESSION_TTL_SECONDS,
  });
}

export function clearIntakeSessionCookie(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: 0,
  });
}

export function readIntakeSessionToken(req: NextRequest): string | null {
  return req.cookies.get(COOKIE_NAME)?.value ?? null;
}

export const INTAKE_SESSION_COOKIE_NAME = COOKIE_NAME;
export const INTAKE_SESSION_TTL_SECONDS_VALUE = INTAKE_SESSION_TTL_SECONDS;