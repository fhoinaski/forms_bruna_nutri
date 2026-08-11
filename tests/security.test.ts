import { beforeAll, describe, expect, it } from "vitest";
import { decryptValue, encryptValue, generateRecoveryCodes, hashRecoveryCode } from "../lib/security/crypto";
import { createMfaSecret, createTotp, verifyMfaCode } from "../lib/security/mfa";
import { createInternalSessionAssertion, verifyInternalSessionAssertion } from "../lib/auth/session";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-auth-secret-with-at-least-thirty-two-characters";
  process.env.MFA_ENCRYPTION_KEY = "test-mfa-secret-with-at-least-thirty-two-characters";
});

describe("security primitives", () => {
  it("signs short-lived internal session assertions and rejects tampering", async () => {
    const session = { sub: "admin-1", email: "admin@example.com", name: "Admin", mustChangePassword: false, sessionVersion: 2 };
    const token = await createInternalSessionAssertion(session);
    await expect(verifyInternalSessionAssertion(token)).resolves.toEqual(session);
    const parts = token.split(".");
    parts[2] = `${parts[2][0] === "a" ? "b" : "a"}${parts[2].slice(1)}`;
    await expect(verifyInternalSessionAssertion(parts.join("."))).resolves.toBeNull();
  });

  it("encrypts secrets with a random authenticated payload", () => {
    const first = encryptValue("sensitive-value");
    const second = encryptValue("sensitive-value");
    expect(first).not.toBe(second);
    expect(decryptValue(first)).toBe("sensitive-value");
  });

  it("hardening: dado cifrado ANTES de CLINICAL_DATA_ENCRYPTION_KEY existir continua legivel depois (cadeia de chaves)", () => {
    const original = process.env.CLINICAL_DATA_ENCRYPTION_KEY;
    try {
      delete process.env.CLINICAL_DATA_ENCRYPTION_KEY;
      // Cifra hoje, sem CLINICAL_DATA_ENCRYPTION_KEY definido: cai para
      // MFA_ENCRYPTION_KEY (elo mais antigo da cadeia "clinical").
      const legacyPayload = encryptValue("prontuario sensivel", "clinical");

      // Alguem define a chave dedicada depois — dado NOVO passa a usar essa
      // chave, mas o dado ANTIGO (legacyPayload) precisa continuar legivel
      // sem nenhuma migracao manual.
      process.env.CLINICAL_DATA_ENCRYPTION_KEY = "test-clinical-secret-with-at-least-thirty-two-chars";
      expect(decryptValue(legacyPayload, "clinical")).toBe("prontuario sensivel");

      // Dado cifrado DEPOIS usa a chave nova — e ambos continuam decifraveis.
      const freshPayload = encryptValue("prontuario novo", "clinical");
      expect(freshPayload).not.toBe(legacyPayload);
      expect(decryptValue(freshPayload, "clinical")).toBe("prontuario novo");
      expect(decryptValue(legacyPayload, "clinical")).toBe("prontuario sensivel");
    } finally {
      if (original === undefined) delete process.env.CLINICAL_DATA_ENCRYPTION_KEY;
      else process.env.CLINICAL_DATA_ENCRYPTION_KEY = original;
    }
  });

  it("hardening: purposes diferentes (clinical/mfa/backup) nao decifram payload um do outro", () => {
    process.env.CLINICAL_DATA_ENCRYPTION_KEY = "test-clinical-secret-with-at-least-thirty-two-chars";
    process.env.BACKUP_ENCRYPTION_KEY = "test-backup-secret-with-at-least-thirty-two-chars-x";
    const clinicalPayload = encryptValue("dado clinico", "clinical");
    expect(() => decryptValue(clinicalPayload, "backup")).toThrow();
    const backupPayload = encryptValue("dado de backup", "backup");
    expect(() => decryptValue(backupPayload, "clinical")).toThrow();
  });

  it("creates one-time recovery codes and deterministic hashes", () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(8);
    expect(codes.every((code) => /^[A-F0-9]{5}-[A-F0-9]{5}$/.test(code))).toBe(true);
    expect(hashRecoveryCode(codes[0])).toBe(hashRecoveryCode(codes[0].toLowerCase()));
  });

  it("validates a current TOTP code", () => {
    const secret = createMfaSecret();
    const token = createTotp(secret, "admin@brunanutri.com.br").generate();
    expect(verifyMfaCode(secret, "admin@brunanutri.com.br", token)).toBe(true);
    expect(verifyMfaCode(secret, "admin@brunanutri.com.br", "00000000")).toBe(false);
  });
});
