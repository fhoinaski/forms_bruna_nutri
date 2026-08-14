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
  // Prova de migrabilidade: o valor recifrado com a chave atual deve decifrar de
  // volta ao MESMO plaintext (comparação em memória — nada é logado/persistido).
  if (!verify.ok || verify.plaintext !== leg.plaintext) return { status: "failed" };

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

/**
 * Valida um manifesto de backup em memória (sem I/O). Deve cobrir exatamente
 * `expectedCount` entradas, cada uma com table/field/id/oldValue (ciphertext
 * anterior) e newValue (ciphertext novo, usado na condição do rollback).
 * Nunca aceita secret/plaintext — apenas os campos estruturais + ciphertext.
 */
export function verifyBackupManifest(backup, expectedCount) {
  if (!backup || typeof backup !== "object") return { ok: false, reason: "backup ausente" };
  if (backup.count !== expectedCount) return { ok: false, reason: `count ${backup.count} !== ${expectedCount}` };
  if (!Array.isArray(backup.entries) || backup.entries.length !== expectedCount) return { ok: false, reason: "entries inválido" };
  for (const e of backup.entries) {
    if (!e || !e.table || !e.field || !e.id || typeof e.oldValue !== "string" || !e.oldValue || typeof e.newValue !== "string" || !e.newValue) {
      return { ok: false, reason: "entry malformado" };
    }
  }
  return { ok: true };
}

/**
 * Guarda do --apply: só autoriza aplicar quando o backup está presente e
 * cobre integralmente o plano. Retorna { ok, reason } — a CLI aborta se !ok.
 */
export function guardApply({ plan, backup }) {
  const manifest = verifyBackupManifest(backup, plan.length);
  if (!manifest.ok) return { ok: false, reason: `backup ausente/inválido: ${manifest.reason}` };
  return { ok: true };
}

/**
 * Simula o UPDATE condicional (WHERE id=? AND field=oldValue) de forma pura.
 * Se o valor corrente ainda é o esperado (`oldValue`), grava `newValue`; senão,
 * é conflito e NÃO sobrescreve — devolve o valor corrente intacto.
 */
export function applyConditionalUpdate({ currentValue, oldValue, newValue }) {
  if (currentValue === oldValue) {
    return { status: "migrated", value: newValue, conflict: false };
  }
  return { status: "conflict", value: currentValue, conflict: true };
}

/**
 * Constrói o plano de rollback a partir do backup: para cada entrada, o UPDATE
 * condicional restaura o ciphertext anterior (oldValue) apenas se o valor
 * atual ainda for o gravado pela migração (newValue) — sem conhecer plaintext.
 * Espelha a assinatura do UPDATE de ida (WHERE field = valor migrado).
 */
export function buildRollbackPlan(backup) {
  const manifest = verifyBackupManifest(backup, backup?.count ?? 0);
  if (!manifest.ok) return { ok: false, reason: manifest.reason };
  return {
    ok: true,
    statements: backup.entries.map((e) => ({
      table: e.table,
      field: e.field,
      id: e.id,
      setTo: e.oldValue,
      whereValue: e.newValue,
    })),
  };
}
