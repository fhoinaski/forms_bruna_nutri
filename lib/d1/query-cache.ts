/**
 * FASE 4.5 (item 9) — cache TTL em memoria, so pra dados de referencia
 * nutricional (nunca dado clinico/paciente, nunca texto livre de query).
 * Escopo deliberadamente pequeno: chaves normalizadas e explicitas (nunca
 * a query do usuario crua), TTL curto e explicito por chamada.
 *
 * invalidateAll() existe pra uso manual/testes, mas NAO ha nenhum sinal
 * automatico de "acabou de reimportar" chegando ate aqui: o deploy roda
 * como processo CLI separado (scripts/canonical-nutrition-import/
 * deploy-to-d1.ts), sem acesso a memoria dos processos serverless da
 * aplicacao rodando na Vercel — nao existe canal pra avisa-los. A unica
 * garantia real de que um dado reimportado aparece e o TTL curto (5 min)
 * expirando sozinho; documentado explicitamente pra nao prometer
 * invalidacao que a arquitetura atual nao entrega.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export async function cachedQuery<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  const value = await fetcher();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

/** Chamado apos reimportar/redeployar dados canonicos (dados de referencia podem ter mudado). */
export function invalidateAll(): void {
  store.clear();
}
