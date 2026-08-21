/**
 * Provider determinístico de teste para E2E (V3 do fechamento de gaps,
 * FASE 11) — centralizado na fronteira do AI gateway
 * (lib/ai/gateway/ai-gateway.ts#generateStructuredResult), nunca espalhado
 * como `if (process.env.E2E_TEST_MODE)` pelos agentes. Em produção este
 * módulo nunca é consultado de um jeito que muda o resultado: o gateway só
 * olha pra cá quando `E2E_TEST_MODE=1` (setado só pelo
 * e2e/helpers/webserver-entrypoint.mjs), então o caminho real
 * (generateText contra o provider configurado) é o único que roda fora de
 * E2E.
 *
 * Escopo por (agent, key) — key é normalmente o clientId do teste, pra dois
 * workers do Playwright rodando em paralelo contra o MESMO processo
 * `next start` nunca pisarem na fixture um do outro. Uma fixture é
 * consumida uma única vez (one-shot) — a próxima chamada pro mesmo par
 * agent+key sem uma nova fixture registrada cai no comportamento real
 * (útil pra testar "provider ainda não respondeu"/timeout sem precisar de
 * um mecanismo separado).
 */

const fixtures = new Map<string, unknown>();

function fixtureKey(agent: string, key: string): string {
  return `${agent}::${key}`;
}

export function isE2EGatewayTestModeEnabled(): boolean {
  return process.env.E2E_TEST_MODE === "1";
}

/** Chamado só pelas rotas /api/admin/e2e/* (que já retornam 404 fora de E2E_TEST_MODE). */
export function setE2EStructuredFixture(agent: string, key: string, data: unknown): void {
  fixtures.set(fixtureKey(agent, key), data);
}

/** Chamado só por generateStructuredResult — consome (remove) a fixture ao ler. */
export function takeE2EStructuredFixture(agent: string, key: string | undefined): unknown | undefined {
  if (!key) return undefined;
  const k = fixtureKey(agent, key);
  const value = fixtures.get(k);
  if (value !== undefined) fixtures.delete(k);
  return value;
}
