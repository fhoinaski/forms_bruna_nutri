import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regressao: proxy.ts (Edge) e as rotas de API admin (Node.js runtime) sao
 * isolados entre si — cada um tem sua PROPRIA instancia do modulo
 * lib/auth/session.ts, logo NAO compartilham o cache em memoria de
 * session_version. Antes desta correcao, hasCurrentSessionVersion() confiava
 * cegamente num veredito NEGATIVO do cache (versao desatualizada), o que
 * derrubava um admin de volta para /login por ate SESSION_VERSION_CACHE_TTL_MS
 * apos trocar a senha ou mudar o MFA — mesmo com um token novo e valido —
 * sempre que o proxy Edge ja tinha cacheado a sessao antes da mudanca
 * (achado real ao rodar o E2E de "troca obrigatoria de senha").
 */

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-thirty-two-characters");
});

afterEach(() => {
  vi.doUnmock("@/lib/d1/client");
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

function baseAdmin(overrides: Partial<{ id: string; session_version: number }> = {}) {
  return {
    id: overrides.id ?? "admin-1",
    email: "admin@example.com",
    name: "Admin",
    must_change_password: 0 as const,
    session_version: overrides.session_version ?? 1,
  };
}

describe("verifySessionToken — cache de session_version nunca confia cegamente num veredito negativo", () => {
  it("cache com versao desatualizada (menor que a do token) reconsulta o banco e aceita quando o banco confirma a versao nova", async () => {
    const d1Query = vi.fn().mockResolvedValue([{ session_version: 2 }]);
    vi.doMock("@/lib/d1/client", () => ({ d1Query }));
    const { createSessionToken, verifySessionToken, primeSessionVersionCache } = await import("../lib/auth/session");

    // Simula o cache do runtime Edge (proxy.ts) ainda com a versao antiga,
    // presa dentro da janela do TTL, enquanto o banco (e o token novo) ja
    // refletem a versao pos-troca-de-senha.
    primeSessionVersionCache("admin-1", 1);
    const token = await createSessionToken(baseAdmin({ session_version: 2 }));

    const session = await verifySessionToken(token);

    expect(session).not.toBeNull();
    expect(session?.sessionVersion).toBe(2);
    expect(d1Query).toHaveBeenCalled();
  });

  it("cache com a MESMA versao do token e aceito sem consultar o banco (caminho comum, rapido)", async () => {
    const d1Query = vi.fn();
    vi.doMock("@/lib/d1/client", () => ({ d1Query }));
    const { createSessionToken, verifySessionToken, primeSessionVersionCache } = await import("../lib/auth/session");

    primeSessionVersionCache("admin-2", 1);
    const token = await createSessionToken(baseAdmin({ id: "admin-2", session_version: 1 }));

    const session = await verifySessionToken(token);

    expect(session).not.toBeNull();
    expect(d1Query).not.toHaveBeenCalled();
  });

  it("sessao genuinamente revogada (banco confirma versao diferente da do token) continua invalida", async () => {
    const d1Query = vi.fn().mockResolvedValue([{ session_version: 5 }]);
    vi.doMock("@/lib/d1/client", () => ({ d1Query }));
    const { createSessionToken, verifySessionToken } = await import("../lib/auth/session");

    const token = await createSessionToken(baseAdmin({ id: "admin-3", session_version: 1 }));
    const session = await verifySessionToken(token);

    expect(session).toBeNull();
  });

  it("usuario removido do banco (sem linha) invalida a sessao, mesmo com token bem assinado", async () => {
    const d1Query = vi.fn().mockResolvedValue([]);
    vi.doMock("@/lib/d1/client", () => ({ d1Query }));
    const { createSessionToken, verifySessionToken } = await import("../lib/auth/session");

    const token = await createSessionToken(baseAdmin({ id: "admin-4", session_version: 1 }));
    const session = await verifySessionToken(token);

    expect(session).toBeNull();
  });
});
