import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Antes desta mudanca, MFA_ENCRYPTION_KEY (com fallback para AUTH_SECRET)
 * era a UNICA chave usada para cifrar QUALQUER coisa via encryptValue —
 * segredo TOTP, prontuario, evolucoes clinicas, credencial de IA. Um
 * unico segredo vazado comprometia sessao + MFA + todo dado clinico
 * cifrado ao mesmo tempo.
 *
 * "purpose" separa isso conceitualmente sem quebrar dado ja cifrado:
 * cada finalidade tem sua propria CADEIA de chaves, da mais nova (a
 * preferida para cifrar dado NOVO) para a mais antiga (mantida so para
 * conseguir decifrar dado ANTIGO). Nunca removemos um elo da cadeia —
 * isso tornaria dado existente ilegivel, exatamente o que nao pode
 * acontecer.
 */
export type EncryptionPurpose = "clinical" | "mfa" | "backup";

function keyChainForPurpose(purpose: EncryptionPurpose): string[] {
  const candidates =
    purpose === "clinical"
      ? [process.env.CLINICAL_DATA_ENCRYPTION_KEY, process.env.MFA_ENCRYPTION_KEY, process.env.AUTH_SECRET]
      : purpose === "mfa"
        ? [process.env.MFA_ENCRYPTION_KEY, process.env.AUTH_SECRET]
        : [process.env.BACKUP_ENCRYPTION_KEY];

  const seen = new Set<string>();
  const chain: string[] = [];
  for (const secret of candidates) {
    if (secret && !seen.has(secret)) {
      seen.add(secret);
      chain.push(secret);
    }
  }
  return chain;
}

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function encryptValue(value: string, purpose: EncryptionPurpose = "mfa"): string {
  const [secret] = keyChainForPurpose(purpose);
  if (!secret) throw new Error(`No encryption key configured for purpose "${purpose}".`);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

/**
 * Tenta decifrar com a chave mais nova primeiro; se a tag GCM nao bater
 * (chave errada), tenta a proxima da cadeia — nunca a mais nova sozinha.
 * E assim que um valor cifrado ANTES de CLINICAL_DATA_ENCRYPTION_KEY
 * existir continua legivel depois que a variavel e definida, sem
 * nenhuma migracao/re-criptografia manual de dado existente.
 */
export function decryptValue(payload: string, purpose: EncryptionPurpose = "mfa"): string {
  const [ivValue, tagValue, encryptedValue] = payload.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Invalid encrypted payload.");

  const chain = keyChainForPurpose(purpose);
  if (!chain.length) throw new Error(`No encryption key configured for purpose "${purpose}".`);

  let lastError: unknown;
  for (const secret of chain) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), Buffer.from(ivValue, "base64url"));
      decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(encryptedValue, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Failed to decrypt value with any configured key.");
}

export function hashRecoveryCode(code: string) {
  return createHash("sha256")
    .update(`${process.env.AUTH_SECRET ?? "local-development"}:${code.replace(/\s/g, "").toUpperCase()}`)
    .digest("hex");
}

export function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const value = randomBytes(5).toString("hex").toUpperCase();
    return `${value.slice(0, 5)}-${value.slice(5)}`;
  });
}
