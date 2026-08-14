import { describe, expect, it } from "vitest";
// Módulo .mjs (runtime Node, sem declarações) — usa `any` para evitar checagem.
import * as core from "../scripts/lib/migrate-encrypted-core.mjs";
const { PREFIX, deriveKey, encryptFieldValue, decryptPayload, classifyValue, validateKeyConfig, summarize, isEncryptedValue } = core as any;

const CURRENT = "chave-clinica-atual";
const CURRENT_MFA = "chave-mfa-atual";
const LEGACY = "chave-clinica-legada-antiga";
const LEGACY_MFA = "chave-mfa-legada-antiga";
const AUTH = "auth-secret";

function chains() {
  return {
    currentChain: [deriveKey(CURRENT), deriveKey(CURRENT_MFA), deriveKey(AUTH)],
    legacyChain: [deriveKey(LEGACY), deriveKey(LEGACY_MFA), deriveKey(AUTH)],
    currentPrimaryKey: deriveKey(CURRENT),
  };
}

describe("migrate-encrypted-core — classificação", () => {
  it("valor cifrado com a chave atual → already_current (não reencrypta)", () => {
    const value = encryptFieldValue("dado clinico", deriveKey(CURRENT));
    const c = classifyValue(value, chains());
    expect(c.status).toBe("already_current");
    expect(c.newValue).toBeUndefined();
  });

  it("valor cifrado com a chave legada → legacy_recoverable com novo ciphertext", () => {
    const value = encryptFieldValue("dado clinico", deriveKey(LEGACY));
    const c = classifyValue(value, chains());
    expect(c.status).toBe("legacy_recoverable");
    expect(c.newValue).toBeTruthy();
    expect(c.newValue.startsWith(PREFIX)).toBe(true);
  });

  it("legacy → reencrypt com chave atual → decrypt OK (prova de migrabilidade)", () => {
    const value = encryptFieldValue("dado clinico", deriveKey(LEGACY));
    const c = classifyValue(value, chains());
    expect(c.status).toBe("legacy_recoverable");
    const dec = decryptPayload(c.newValue!.slice(PREFIX.length), [deriveKey(CURRENT)]);
    expect(dec.ok).toBe(true);
    expect(dec.plaintext).toBe("dado clinico");
  });

  it("reexecução é idempotente: o novo valor já classifica como already_current", () => {
    const value = encryptFieldValue("dado clinico", deriveKey(LEGACY));
    const migrated = classifyValue(value, chains()).newValue!;
    expect(classifyValue(migrated, chains()).status).toBe("already_current");
  });

  it("ciphertext corrompido → failed (nunca devolve dado adulterado)", () => {
    const value = encryptFieldValue("dado clinico", deriveKey(LEGACY));
    const [iv, tag, cipher] = value.slice(PREFIX.length).split(".");
    const corrupted = `${PREFIX}${[iv, tag, "AAAA" + cipher].join(".")}`;
    expect(classifyValue(corrupted, chains()).status).toBe("failed");
  });

  it("payload malformado → invalid_format", () => {
    expect(classifyValue(`${PREFIX}nao-e-valido`, chains()).status).toBe("invalid_format");
  });

  it("plaintext sem prefixo → plaintext_legacy (não toca)", () => {
    expect(classifyValue("texto em claro antigo", chains()).status).toBe("plaintext_legacy");
  });

  it("vazio → empty (não toca)", () => {
    expect(classifyValue(null, chains()).status).toBe("empty");
    expect(classifyValue("", chains()).status).toBe("empty");
  });
});

describe("migrate-encrypted-core — helpers", () => {
  it("isEncryptedValue detecta prefixo", () => {
    expect(isEncryptedValue("enc:v1:abc")).toBe(true);
    expect(isEncryptedValue("texto")).toBe(false);
  });

  it("validateKeyConfig rejeita chave ausente e legacy == current", () => {
    expect(validateKeyConfig({ currentClinical: "a", currentMfa: "b", authSecret: "c", legacyClinical: "d", legacyMfa: "e" })).toEqual([]);
    expect(validateKeyConfig({ currentClinical: "", currentMfa: "b", authSecret: "c", legacyClinical: "d", legacyMfa: "e" })).toContain("currentClinical ausente");
    expect(validateKeyConfig({ currentClinical: "a", currentMfa: "b", authSecret: "c", legacyClinical: "", legacyMfa: "e" })).toContain("legacyClinical ausente");
    expect(validateKeyConfig({ currentClinical: "a", currentMfa: "b", authSecret: "c", legacyClinical: "a", legacyMfa: "e" })).toContain("legacyClinical == currentClinical");
  });

  it("summarize agrega status", () => {
    const s = summarize([
      { status: "already_current" },
      { status: "legacy_recoverable" },
      { status: "legacy_recoverable" },
      { status: "failed" },
    ]);
    expect(s).toEqual(expect.objectContaining({ already_current: 1, legacy_recoverable: 2, failed: 1 }));
  });
});
