import { decryptValue, encryptValue } from "@/lib/security/crypto";

const ENCRYPTED_PREFIX = "enc:v1:";

/**
 * Todo campo passado por este modulo (prontuario, evolucoes, respostas de
 * formulario, e por ora tambem ai_settings.api_key — uma credencial de IA
 * ainda nao separada em sua propria chave/purpose nesta rodada, ver
 * relatorio de hardening) usa a cadeia "clinical" de lib/security/crypto.ts,
 * nunca mais a mesma chave de sessao/MFA por padrao implicito.
 */
const FIELD_PURPOSE = "clinical" as const;

export function isEncryptedValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(ENCRYPTED_PREFIX);
}

export function encryptSensitiveText(value: string): string {
  return `${ENCRYPTED_PREFIX}${encryptValue(value, FIELD_PURPOSE)}`;
}

export function decryptSensitiveText(value: string): string {
  if (!isEncryptedValue(value)) return value;
  return decryptValue(value.slice(ENCRYPTED_PREFIX.length), FIELD_PURPOSE);
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
