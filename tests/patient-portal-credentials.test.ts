import { describe, expect, it } from "vitest";

describe("patient portal credential primitives", () => {
  it("never derives a reversible value for a password and verifies it through bcrypt", async () => {
    process.env.AUTH_SECRET = "r8-3-test-secret";
    const { hashPatientPortalPassword, verifyPatientPortalPassword } = await import("@/lib/auth/patient-portal-credentials");
    const hash = await hashPatientPortalPassword("uma senha longa e segura");
    expect(hash).not.toContain("uma senha longa e segura");
    await expect(verifyPatientPortalPassword("uma senha longa e segura", hash)).resolves.toBe(true);
    await expect(verifyPatientPortalPassword("outra senha longa e segura", hash)).resolves.toBe(false);
  });

  it("generates opaque, hashable one-time token material without retaining its raw value", async () => {
    process.env.AUTH_SECRET = "r8-3-test-secret";
    const { generatePatientPortalToken, hashPatientPortalToken, secureHashEquals } = await import("@/lib/auth/patient-portal-credentials");
    const token = generatePatientPortalToken();
    const hash = hashPatientPortalToken(token);
    expect(token).toHaveLength(43);
    expect(hash).not.toContain(token);
    expect(secureHashEquals(hashPatientPortalToken(token), hash)).toBe(true);
    expect(secureHashEquals(hashPatientPortalToken(generatePatientPortalToken()), hash)).toBe(false);
  });

  it("generates a strong temporary password without a plaintext persistence primitive", async () => {
    const { generateTemporaryPatientPortalPassword, validatePatientPortalPassword } = await import("@/lib/auth/patient-portal-credentials");
    const password = generateTemporaryPatientPortalPassword();
    expect(password).toMatch(/^BF-[A-Za-z0-9_-]{24}$/);
    expect(validatePatientPortalPassword(password)).toBeNull();
  });
});
