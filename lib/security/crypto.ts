import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function encryptionKey() {
  const secret = process.env.MFA_ENCRYPTION_KEY ?? process.env.AUTH_SECRET;
  if (!secret) throw new Error("MFA_ENCRYPTION_KEY or AUTH_SECRET is required.");
  return createHash("sha256").update(secret).digest();
}

export function encryptValue(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptValue(payload: string) {
  const [ivValue, tagValue, encryptedValue] = payload.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Invalid encrypted payload.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
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
