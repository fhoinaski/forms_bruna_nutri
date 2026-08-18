import { describe, expect, it } from "vitest";
import { createRawSessionToken, hashSessionToken, isSessionExpired, SESSION_TIMEOUT_MS } from "@/lib/analytics/session";

describe("session tokens", () => {
  it("createRawSessionToken gera valores diferentes a cada chamada", () => {
    const a = createRawSessionToken();
    const b = createRawSessionToken();
    expect(a).not.toBe(b);
  });

  it("hashSessionToken e deterministico para o mesmo token", () => {
    const token = createRawSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it("hashSessionToken nunca retorna o token cru (nao e reversivel)", () => {
    const token = createRawSessionToken();
    const hash = hashSessionToken(token);
    expect(hash).not.toBe(token);
    expect(hash).not.toContain(token);
  });

  it("hashes de tokens diferentes sao diferentes", () => {
    const a = hashSessionToken(createRawSessionToken());
    const b = hashSessionToken(createRawSessionToken());
    expect(a).not.toBe(b);
  });
});

describe("isSessionExpired — regra de 30 minutos", () => {
  const now = new Date("2026-08-18T12:00:00.000Z");

  it("nao expira dentro da janela de 30 minutos", () => {
    const lastSeen = new Date(now.getTime() - (SESSION_TIMEOUT_MS - 1000)).toISOString();
    expect(isSessionExpired(lastSeen, now)).toBe(false);
  });

  it("expira exatamente apos passar de 30 minutos", () => {
    const lastSeen = new Date(now.getTime() - (SESSION_TIMEOUT_MS + 1000)).toISOString();
    expect(isSessionExpired(lastSeen, now)).toBe(true);
  });

  it("trata timestamp invalido como expirado (fail-safe)", () => {
    expect(isSessionExpired("not-a-date", now)).toBe(true);
  });
});
