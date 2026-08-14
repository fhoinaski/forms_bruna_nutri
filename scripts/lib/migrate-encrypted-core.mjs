// @ts-nocheck
// Funções puras da migração de dados cifrados — sem I/O, sem env, sem D1.
// Testadas em tests/migrate-encrypted-data.test.ts. Nunca logam plaintext/secret.
import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const PREFIX = "enc:v1:";

export function deriveKey(secret) {
  return createHash("sha256").update(secret).digest();
}

export function isEncryptedValue(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/** Decifra um payload (sem prefixo "enc:v1:"). Retorna { ok, plaintext? | reason }. */
export function decryptPayload(payload, keyBuffers) {
  const [iv, tag, cipher] = payload.split(".");
  if (!iv || !tag || !cipher) return { ok: false, reason: "invalid_format" };
  for (const key of keyBuffers) {
    try {
      const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      d.setAuthTag(Buffer.from(tag, "base64url"));
      const plaintext = Buffer.concat([d.update(Buffer.from(cipher, "base64url")), d.final()]).toString("utf8");
      return { ok: true, plaintext };
    } catch {
      /* próxima chave */
    }
  }
  return { ok: false, reason: "failed" };
}

/** Cifra um plaintext com UMA chave (formato idêntico ao runtime). Retorna "enc:v1:<iv>.<tag>.<cipher>". */
export function encryptFieldValue(plaintext, keyBuffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${PREFIX}${[iv, cipher.getAuthTag(), encrypted].map((p) => p.toString("base64url")).join(".")}`;
}

/**
 * Classifica um valor de campo. NUNCA expõe plaintext no resultado.
 * status: empty | plaintext_legacy | invalid_format | already_current |
 *         legacy_recoverable (com newValue pronto para persistir) | failed
 */
export function classifyValue(value, { currentChain, legacyChain, currentPrimaryKey }) {
  if (value === null || value === undefined || value === "") return { status: "empty" };
  if (!isEncryptedValue(value)) return { status: "plaintext_legacy" };

  const payload = value.slice(PREFIX.length);
  const cur = decryptPayload(payload, currentChain);
  if (cur.ok) return { status: "already_current" };
  if (cur.reason === "invalid_format") return { status: "invalid_format" };

  const leg = decryptPayload(payload, legacyChain);
  if (!leg.ok) return { status: "failed" };

  const newValue = encryptFieldValue(leg.plaintext, currentPrimaryKey);
  const verify = decryptPayload(newValue.slice(PREFIX.length), [currentPrimaryKey]);
  if (!verify.ok) return { status: "failed" };

  return { status: "legacy_recoverable", newValue };
}

/** Valida a configuração de chaves. Retorna lista de erros (vazia = OK). */
export function validateKeyConfig(keys) {
  const errors = [];
  for (const k of ["currentClinical", "currentMfa", "authSecret", "legacyClinical", "legacyMfa"]) {
    if (!keys[k]) errors.push(`${k} ausente`);
  }
  if (keys.legacyClinical && keys.legacyClinical === keys.currentClinical) {
    errors.push("legacyClinical == currentClinical");
  }
  if (keys.legacyMfa && keys.legacyMfa === keys.currentMfa) {
    errors.push("legacyMfa == currentMfa");
  }
  return errors;
}

/** Agrega classificações em um resumo numérico. */
export function summarize(classified) {
  const s = { already_current: 0, legacy_recoverable: 0, failed: 0, invalid_format: 0, plaintext_legacy: 0, empty: 0 };
  for (const c of classified) s[c.status] = (s[c.status] ?? 0) + 1;
  return s;
}
