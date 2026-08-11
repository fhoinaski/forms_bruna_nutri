import { describe, expect, it } from "vitest";
import { checksumOf, decryptBackupPayload, encryptBackupPayload } from "../scripts/lib/backup-crypto.mjs";

/**
 * Round-trip de backup/restore (FASE 0.4 do hardening) — antes desta rodada
 * nao havia NENHUM teste para o mecanismo de criptografia usado por
 * scripts/backup-d1.mjs/restore-d1.mjs. Testa a logica isoladamente (sem
 * credenciais reais do Cloudflare D1) — o formato "BFN1"+iv+tag+ciphertext e
 * a integridade GCM.
 */

const SECRET_A = "test-backup-secret-with-at-least-thirty-two-chars-a";
const SECRET_B = "test-backup-secret-with-at-least-thirty-two-chars-b";

describe("backup-crypto — round-trip", () => {
  it("decripta exatamente o mesmo payload que foi cifrado", () => {
    const payload = {
      format: 1,
      createdAt: "2026-08-11T00:00:00.000Z",
      schema: [{ type: "table", name: "clients", tbl_name: "clients", sql: "CREATE TABLE clients (...)" }],
      data: { clients: [{ id: "c1", name: "Maria" }, { id: "c2", name: "Ana" }] },
    };
    const encrypted = encryptBackupPayload(payload, SECRET_A);
    const decrypted = decryptBackupPayload(encrypted, SECRET_A);
    expect(decrypted).toEqual(payload);
  });

  it("o blob comeca com o magic 'BFN1' e nunca contem o payload em texto plano", () => {
    const payload = { format: 1, createdAt: "x", schema: [], data: { clients: [{ id: "c1", name: "Segredo Clinico Unico" }] } };
    const encrypted = encryptBackupPayload(payload, SECRET_A);
    expect(encrypted.subarray(0, 4).toString()).toBe("BFN1");
    expect(encrypted.toString("latin1")).not.toContain("Segredo Clinico Unico");
  });

  it("duas criptografias do mesmo payload produzem blobs diferentes (IV aleatorio)", () => {
    const payload = { format: 1, createdAt: "x", schema: [], data: {} };
    const first = encryptBackupPayload(payload, SECRET_A);
    const second = encryptBackupPayload(payload, SECRET_A);
    expect(first.equals(second)).toBe(false);
  });

  it("chave errada nunca decripta — nunca retorna dado corrompido silenciosamente", () => {
    const payload = { format: 1, createdAt: "x", schema: [], data: {} };
    const encrypted = encryptBackupPayload(payload, SECRET_A);
    expect(() => decryptBackupPayload(encrypted, SECRET_B)).toThrow();
  });

  it("blob adulterado (1 byte alterado no ciphertext) e detectado pela tag GCM, nunca decripta silenciosamente", () => {
    const payload = { format: 1, createdAt: "x", schema: [], data: { clients: [{ id: "c1" }] } };
    const encrypted = encryptBackupPayload(payload, SECRET_A);
    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 0xff; // flip o ultimo byte do ciphertext
    expect(() => decryptBackupPayload(tampered, SECRET_A)).toThrow();
  });

  it("magic invalido (arquivo que nao e um backup) e rejeitado antes de tentar decifrar", () => {
    const notABackup = Buffer.from("NAO_E_UM_BACKUP_VALIDO");
    expect(() => decryptBackupPayload(notABackup, SECRET_A)).toThrow("Formato de backup inválido.");
  });

  it("checksumOf e deterministico para o mesmo blob", () => {
    const payload = { format: 1, createdAt: "x", schema: [], data: {} };
    const encrypted = encryptBackupPayload(payload, SECRET_A);
    expect(checksumOf(encrypted)).toBe(checksumOf(encrypted));
    expect(checksumOf(encrypted)).toHaveLength(64); // sha256 hex
  });
});
