import { describe, expect, it, beforeAll } from "vitest";
import { encryptJsonValue, decryptJsonValue } from "@/lib/security/encrypted-fields";
import { encryptValue, decryptValue } from "@/lib/security/crypto";

// A chave é lida em tempo de chamada; define antes de qualquer cifragem.
beforeAll(() => {
  process.env.CLINICAL_DATA_ENCRYPTION_KEY = "test-clinical-key-with-more-than-32-bytes-0000";
});

describe("criptografia de state_json (AES-256-GCM)", () => {
  it("roundtrip: encrypt(state) -> decrypt() == original", () => {
    const state = {
      id: "s1",
      status: "active",
      answers: { nome: "Maria", medicacao: "losartana" },
      completedFields: ["nome"],
    };
    const encrypted = encryptJsonValue(state);
    // Cifrado nunca é igual ao original (não vaza em claro).
    expect(encrypted).not.toContain("Maria");
    expect(decryptJsonValue(encrypted, null)).toEqual(state);
  });

  it("invólucro clinical (encryptValue) usa GCM e tag", () => {
    const encrypted = encryptValue("segredo", "clinical");
    const parts = encrypted.split(".");
    expect(parts).toHaveLength(3); // iv . tag . ciphertext
    expect(decryptValue(encrypted, "clinical")).toBe("segredo");
  });

  it("alterar ciphertext faz decrypt autenticado falhar (fail-closed)", () => {
    // Assert na primitiva autenticada (encryptValue/decryptValue), que é a
    // camada GCM a validar a tag. decryptJsonValue engole a falha e devolve
    // fallback por design (defesa em profundidade, nunca dado adulterado).
    const encrypted = encryptValue("segredo", "clinical");
    const [iv, tag, cipher] = encrypted.split(".");
    const corrupted = [iv, tag, "AAAA" + cipher].join(".");
    expect(() => decryptValue(corrupted, "clinical")).toThrow();
    // E a camada JSON NÃO devolve o dado adulterado: devolve o fallback.
    expect(decryptJsonValue(corrupted, null)).toBeNull();
  });

  it("alterar a auth tag faz decrypt autenticado falhar", () => {
    const encrypted = encryptValue("segredo", "clinical");
    const [iv, tag, cipher] = encrypted.split(".");
    const corrupted = [iv, tag + "AAAA", cipher].join(".");
    expect(() => decryptValue(corrupted, "clinical")).toThrow();
  });
});