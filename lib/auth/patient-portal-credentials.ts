import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";

export const PATIENT_PORTAL_ACCESS_STATUSES = [
  "NO_ACCESS",
  "INVITE_PENDING",
  "ACTIVE",
  "TEMP_PASSWORD",
  "PASSWORD_CHANGE_REQUIRED",
  "REVOKED",
  "LOCKED",
] as const;

export type PatientPortalAccessStatus = typeof PATIENT_PORTAL_ACCESS_STATUSES[number];
export type PatientPortalTokenPurpose = "invite" | "password_reset";

const MIN_PASSWORD_LENGTH = 12;
const TOKEN_BYTES = 32;

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET environment variable is not set.");
  return value;
}

function hashWithSecret(value: string, namespace: string): string {
  return createHmac("sha256", secret()).update(`${namespace}:${value}`).digest("hex");
}

export function generatePatientPortalToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashPatientPortalToken(token: string): string {
  return hashWithSecret(token, "patient-portal-token");
}

export function hashPatientPortalSessionId(sessionId: string): string {
  return hashWithSecret(sessionId, "patient-portal-session");
}

export function secureHashEquals(value: string, expectedHash: string): boolean {
  const actual = Buffer.from(value, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function validatePatientPortalPassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (password.length > 200) return "A senha é longa demais.";
  if (/^(password|senha|123456|12345678|qwerty)$/i.test(password.trim())) return "Escolha uma senha mais segura.";
  return null;
}

export async function hashPatientPortalPassword(password: string): Promise<string> {
  const issue = validatePatientPortalPassword(password);
  if (issue) throw new Error(issue);
  return bcrypt.hash(password, 12);
}

export async function verifyPatientPortalPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function generateTemporaryPatientPortalPassword(): string {
  // High-entropy, copyable once, and compatible with the normal passphrase policy.
  return `BF-${randomBytes(18).toString("base64url")}`;
}
