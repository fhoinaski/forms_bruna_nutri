import * as OTPAuth from "otpauth";

export function createMfaSecret() {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function createTotp(secret: string, email: string) {
  return new OTPAuth.TOTP({
    issuer: "Bruna Flores Nutri",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

export function verifyMfaCode(secret: string, email: string, code: string) {
  const normalized = code.replace(/\s/g, "");
  return createTotp(secret, email).validate({ token: normalized, window: 1 }) !== null;
}
