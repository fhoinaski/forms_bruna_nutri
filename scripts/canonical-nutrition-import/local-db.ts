import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { splitSqlStatements } from "../migration-utils.mjs";

// node:sqlite (DatabaseSync) e experimental mas ja usado pelo projeto em
// scripts/usda-pilot-import.mjs e tests/food-portions.test.ts — mesmo
// padrao aqui, via createRequire porque o pacote nao tem types "@types/node"
// completos para esta API em todas as versoes do TS instaladas.
const sqlite = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => LocalDb;
};

export interface LocalDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  };
  close(): void;
}

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CANONICAL_MIGRATION = join(ROOT_DIR, "db", "20260822_0055_canonical_nutrition_foundation.sql");
const CANONICAL_INDEX_FIX_MIGRATION = join(ROOT_DIR, "db", "20260822_0056_canonical_nutrition_drop_redundant_index.sql");

/**
 * import_batches replicado aqui a partir de db/20260816_0050_import_batches.sql
 * (colunas identicas) — a tabela em si nao muda nesta fase, so precisamos
 * dela localmente porque canonical_foods/food_nutrient_values/etc. tem FK
 * para ela. Nao reaplicamos as 54 migrations anteriores inteiras no banco
 * local: mesmo padrao ja usado em scripts/usda-pilot-import.mjs (schema
 * local minimo e proposital, focado no que este importador precisa).
 */
const IMPORT_BATCHES_STUB = `
CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  dataset_version TEXT NULL,
  planned_foods INTEGER NOT NULL DEFAULT 0,
  created_foods INTEGER NOT NULL DEFAULT 0,
  created_nutrients INTEGER NOT NULL DEFAULT 0,
  noop_foods INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata_json TEXT NULL
);
`;

/** So os CREATE TABLE/INDEX/VIRTUAL TABLE — nenhum INSERT (food_sources seed roda a parte, tambem via este arquivo, sem duplicar SQL). */
function readCanonicalSchemaStatements(): string[] {
  const sql = readFileSync(CANONICAL_MIGRATION, "utf8");
  const indexFixSql = readFileSync(CANONICAL_INDEX_FIX_MIGRATION, "utf8");
  return [...splitSqlStatements(sql), ...splitSqlStatements(indexFixSql)];
}

export function openLocalCanonicalDb(path: string): LocalDb {
  const db = new sqlite.DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(IMPORT_BATCHES_STUB);
  for (const statement of readCanonicalSchemaStatements()) {
    db.exec(statement.endsWith(";") ? statement : `${statement};`);
  }
  return db;
}
