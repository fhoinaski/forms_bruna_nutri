import { decryptValue, encryptValue } from "@/lib/security/crypto";

const ENCRYPTED_PREFIX = "enc:v1:";

export function isEncryptedValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(ENCRYPTED_PREFIX);
}

export function encryptSensitiveText(value: string): string {
  return `${ENCRYPTED_PREFIX}${encryptValue(value)}`;
}

export function decryptSensitiveText(value: string): string {
  if (!isEncryptedValue(value)) return value;
  return decryptValue(value.slice(ENCRYPTED_PREFIX.length));
}

export function encryptNullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (isEncryptedValue(value)) return value;
  return encryptSensitiveText(value);
}

export function decryptNullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return decryptSensitiveText(value);
}

export function encryptJsonValue(value: unknown): string {
  return encryptSensitiveText(JSON.stringify(value));
}

export function decryptJsonValue<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(decryptSensitiveText(value)) as T;
  } catch {
    return fallback;
  }
}
