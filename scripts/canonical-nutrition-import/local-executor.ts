import type { CanonicalDbExecutor } from "@/lib/nutrition/canonical-food-search";
import { openLocalCanonicalDb, type LocalDb } from "./local-db";

/**
 * Adapta o SQLite local (node:sqlite, sincrono) ao mesmo contrato assincrono
 * de d1Query — usado por benchmarks/testes/shadow-compare desta fase, nunca
 * por codigo de producao (que usa d1Query real via canonicalFoodSearch()).
 */
export function localCanonicalExecutor(dbPath: string): { db: LocalDb; executor: CanonicalDbExecutor } {
  const db = openLocalCanonicalDb(dbPath);
  const executor: CanonicalDbExecutor = async (sql, params) => db.prepare(sql).all(...params);
  return { db, executor };
}
