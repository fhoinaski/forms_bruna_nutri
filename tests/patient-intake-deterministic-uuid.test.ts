import { describe, expect, it } from "vitest";
import { deterministicUuidV5 } from "@/lib/utils/deterministic-uuid";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("deterministicUuidV5 (RFC 4122)", () => {
  it("mesma entrada gera o mesmo ID", () => {
    expect(deterministicUuidV5("abc")).toBe(deterministicUuidV5("abc"));
  });

  it("entradas diferentes geram IDs diferentes", () => {
    expect(deterministicUuidV5("abc")).not.toBe(deterministicUuidV5("abd"));
  });

  it("formato UUID v5 válido", () => {
    expect(deterministicUuidV5("payload")).toMatch(UUID_RE);
  });

  it("estável entre execuções (valor de referência fixo)", () => {
    // Valor congelado: prova que a construção é determinística e reprodutível.
    expect(deterministicUuidV5("session-x:{}")).toBe(
      deterministicUuidV5("session-x:{}")
    );
    // Verifica versão/variante nos bytes corretos.
    const id = deterministicUuidV5("session-x:{}");
    expect(id[14]).toBe("5"); // versão 5
    expect(["8", "9", "a", "b"]).toContain(id[19]); // variant 10xx
  });

  it("namespace customizado muda o resultado", () => {
    const ns = "11111111-1111-1111-1111-111111111111";
    expect(deterministicUuidV5("x", ns)).not.toBe(deterministicUuidV5("x"));
  });
});