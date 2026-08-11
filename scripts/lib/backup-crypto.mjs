import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Criptografia/framing do backup — extraido de backup-d1.mjs/restore-d1.mjs
 * para um modulo importavel e testavel isoladamente (sem precisar de
 * credenciais reais do Cloudflare D1). Framing: "BFN1" + iv(12) + tag(16) +
 * ciphertext, AES-256-GCM com chave = SHA-256(BACKUP_ENCRYPTION_KEY).
 */

const MAGIC = "BFN1";

export function encryptBackupPayload(payload, secret) {
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([Buffer.from(MAGIC), iv, cipher.getAuthTag(), encrypted]);
}

export function decryptBackupPayload(buffer, secret) {
  if (buffer.subarray(0, 4).toString() !== MAGIC) {
    throw new Error("Formato de backup inválido.");
  }
  const key = createHash("sha256").update(secret).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, buffer.subarray(4, 16));
  decipher.setAuthTag(buffer.subarray(16, 32));
  const decrypted = Buffer.concat([decipher.update(buffer.subarray(32)), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

export function checksumOf(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
