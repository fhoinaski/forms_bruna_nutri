import { beforeAll, describe, expect, it } from "vitest";
import { decryptValue, encryptValue, generateRecoveryCodes, hashRecoveryCode } from "../lib/security/crypto";
import { createMfaSecret, createTotp, verifyMfaCode } from "../lib/security/mfa";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-auth-secret-with-at-least-thirty-two-characters";
  process.env.MFA_ENCRYPTION_KEY = "test-mfa-secret-with-at-least-thirty-two-characters";
});

describe("security primitives", () => {
  it("encrypts secrets with a random authenticated payload", () => {
    const first = encryptValue("sensitive-value");
    const second = encryptValue("sensitive-value");
    expect(first).not.toBe(second);
    expect(decryptValue(first)).toBe("sensitive-value");
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
