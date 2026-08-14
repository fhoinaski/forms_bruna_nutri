import { describe, expect, it } from "vitest";
// Módulo .mjs (runtime Node, sem declarações) — usa `any` para evitar checagem.
import * as core from "../scripts/lib/migrate-encrypted-core.mjs";
const { PREFIX, deriveKey, encryptFieldValue, decryptPayload, classifyValue, validateKeyConfig, summarize, isEncryptedValue, verifyBackupManifest, guardApply, applyConditionalUpdate, buildRollbackPlan } = core as any;

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

describe("migrate-encrypted-core — backup / apply / rollback (puros)", () => {
  const entry = (over: Record<string, unknown> = {}) => ({ table: "t", field: "f", id: "1", oldValue: "OLD_CIPHER", newValue: "NEW_CIPHER", ...over });

  it("apply sem backup → aborta (guardApply)", () => {
    const plan = [1, 2, 3];
    expect(guardApply({ plan, backup: null }).ok).toBe(false);
    expect(guardApply({ plan, backup: { count: 2, entries: [entry(), entry()] } }).ok).toBe(false);
    expect(guardApply({ plan, backup: { count: 3, entries: [entry(), entry(), entry()] } }).ok).toBe(true);
  });

  it("verifyBackupManifest valida estrutura (sem secret/plaintext)", () => {
    expect(verifyBackupManifest({ count: 1, entries: [entry()] }, 1)).toEqual({ ok: true });
    expect(verifyBackupManifest(null, 1).ok).toBe(false);
    expect(verifyBackupManifest({ count: 1, entries: [{ table: "t", field: "f", id: "1", oldValue: "x" }] }, 1).ok).toBe(false); // sem newValue
    expect(verifyBackupManifest({ count: 1, entries: [{ ...entry(), oldValue: "" }] }, 1).ok).toBe(false); // oldValue vazio
  });

  it("conflito de UPDATE não sobrescreve", () => {
    expect(applyConditionalUpdate({ currentValue: "CHANGED", oldValue: "OLD", newValue: "NEW" })).toEqual({ status: "conflict", value: "CHANGED", conflict: true });
    expect(applyConditionalUpdate({ currentValue: "OLD", oldValue: "OLD", newValue: "NEW" })).toEqual({ status: "migrated", value: "NEW", conflict: false });
  });

  it("rollback restaura ciphertext anterior condicionalmente (sem plaintext)", () => {
    const backup = { count: 1, entries: [entry()] };
    const plan = buildRollbackPlan(backup);
    expect(plan.ok).toBe(true);
    expect(plan.statements[0]).toEqual({ table: "t", field: "f", id: "1", setTo: "OLD_CIPHER", whereValue: "NEW_CIPHER" });
    expect(buildRollbackPlan(null).ok).toBe(false);
  });
});
