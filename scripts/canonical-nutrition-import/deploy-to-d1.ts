#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// lib/d1/client.ts le process.env no momento da chamada (nao no import) —
// carregar .env.local ANTES do import dinamico abaixo, mesmo padrao ja
// usado em scripts/migrate-d1.mjs (tsx/scripts standalone nunca tem o
// carregamento automatico de .env que o Next.js faz em dev/build).
const envPath = resolve(".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0 || line.trimStart().startsWith("#")) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

type D1ClientModule = typeof import("@/lib/d1/client");
type LocalDbModule = typeof import("./local-db");
type LocalDb = ReturnType<LocalDbModule["openLocalCanonicalDb"]>;

/**
 * FASE 4 (item 4/5) — deploy dos dados canonicos ja validados localmente
 * (reports/canonical-nutrition-local.sqlite) para o D1 real configurado em
 * .env.local. NUNCA le tbca_completa.json aqui — so o SQLite local, ja
 * auditado pelas Fases 1-3.5 (10.063 foods, 636.572 nutrient values, 8.157
 * portions, 252.212 statistics, 4 aliases).
 *
 * Autorizacao explicita do usuario (sessao atual) para tratar o banco D1
 * configurado como ambiente de teste/staging, apesar de a API do Cloudflare
 * reportar version="production" — exige --confirm-forms-bruna-nutri-d1 pra
 * rodar, pra nunca disparar goto por engano numa sessao futura.
 *
 * Idempotente: todo INSERT usa OR IGNORE sobre as MESMAS chaves naturais/
 * IDs deterministicos ja usados no importador local — rodar de novo nunca
 * duplica.
 */

const REQUIRED_FLAG = "--confirm-forms-bruna-nutri-d1";
const BATCH_SIZE = Number(process.env.D1_DEPLOY_BATCH_SIZE ?? 300);

async function verifyTarget(): Promise<void> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const apiToken = process.env.CLOUDFLARE_D1_API_TOKEN;
  if (!accountId || !databaseId || !apiToken) throw new Error("Credenciais Cloudflare D1 ausentes em .env.local.");
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  const data = (await response.json()) as { result?: { name: string; version: string; uuid: string } };
  if (!response.ok || !data.result) throw new Error("Nao foi possivel verificar o banco D1 alvo.");
  console.log(`Banco D1 alvo confirmado: name=${data.result.name} version=${data.result.version} uuid=${data.result.uuid}`);
  console.log("Autorizacao: usuario confirmou explicitamente nesta sessao que este banco pode receber a carga canonica de teste.");
}

interface TableSpec {
  name: string;
  columns: string[];
  sourceSql: string;
}

const TABLES: TableSpec[] = [
  { name: "food_sources", columns: ["id", "name", "version", "license_name", "license_url", "redistribution_restricted", "source_url", "accessed_at"], sourceSql: "SELECT * FROM food_sources" },
  // import_batches PRIMEIRO — canonical_foods/food_nutrient_values/etc.
  // tem FK pra ca; sem isso, o INSERT delas falha com FOREIGN KEY
  // constraint (achado real ao tentar rodar contra o D1 de verdade).
  {
    name: "import_batches",
    columns: ["id", "source", "status", "dataset_version", "planned_foods", "created_foods", "created_nutrients", "noop_foods", "failures", "created_at", "updated_at", "metadata_json"],
    sourceSql: "SELECT * FROM import_batches",
  },
  {
    name: "canonical_foods",
    columns: [
      "id", "source", "source_version", "source_food_id", "source_collection", "name", "scientific_name", "normalized_name",
      "basis", "classification_group", "classification_food_type", "preparation_method", "preparation_code",
      "preparation_name", "source_detail_url", "import_batch_id", "created_at",
    ],
    sourceSql: "SELECT * FROM canonical_foods ORDER BY id",
  },
  {
    name: "canonical_food_portions",
    columns: [
      "id", "canonical_food_id", "source", "source_food_id", "source_portion_id", "label", "source_measure_quantity",
      "source_measure_unit", "source_measure_raw", "parsed_label_grams", "gram_weight", "ml_weight", "weight_source",
      "confidence", "import_batch_id", "created_at",
    ],
    sourceSql: "SELECT * FROM canonical_food_portions ORDER BY id",
  },
  {
    name: "food_nutrient_values",
    columns: [
      "id", "canonical_food_id", "nutrient_code", "source_nutrient_id", "source", "source_food_id", "source_record_id",
      "value", "unit", "raw_unit", "basis", "status", "raw_value", "portion_id", "import_batch_id", "created_at",
    ],
    sourceSql: "SELECT * FROM food_nutrient_values ORDER BY id",
  },
  {
    name: "nutrient_statistics",
    columns: [
      "id", "canonical_food_id", "nutrient_code", "source_nutrient_id", "source_tagname", "source", "source_food_id",
      "mean_value", "mean_status", "standard_deviation", "minimum", "maximum", "number_of_observations", "data_type",
      "references_text", "import_batch_id", "created_at",
    ],
    sourceSql: "SELECT * FROM nutrient_statistics ORDER BY id",
  },
  {
    name: "food_aliases",
    columns: ["id", "canonical_food_id", "alias", "normalized_alias", "alias_type", "source", "confidence", "reason", "created_at"],
    sourceSql: "SELECT * FROM food_aliases",
  },
];

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/** Retry simples com backoff pra falha transitoria de rede (achado real: ConnectTimeoutError no meio de food_nutrient_values) — nunca engole erro persistente, so tenta de novo alguns segundos depois. */
async function withRetry<T>(fn: () => Promise<T>, label: string, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.error(`  [retry ${attempt}/${attempts}] ${label}: ${error instanceof Error ? error.message : String(error)}`);
      if (attempt < attempts) await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  throw lastError;
}

/**
 * ACHADO REAL (nao teorico): uma primeira tentativa de "retomada por
 * posicao" (pular os N primeiros ja confirmados em D1, contando so
 * COUNT(*)) causou uma divergencia real de 158.070 linhas de TBCA — porque
 * a ordem de leitura de UM run pra outro nao era garantidamente a mesma
 * (uma falha de rede no meio interrompeu um run que ainda nao usava
 * `ORDER BY id`; o run seguinte usou, e "pular os primeiros N" de uma
 * ordenacao DIFERENTE da que gerou os N ja inseridos pulou linhas erradas).
 * Corrigido removendo qualquer otimizacao de posicao: cada deploy sempre
 * envia TODAS as linhas, em ORDER BY id estavel, e confia 100% em
 * INSERT OR IGNORE (idempotente pelos IDs deterministicos) pra tornar
 * reruns seguros — mais lento que um resume real, mas comprovadamente
 * correto (ver validacao de totais no relatorio final).
 */
async function deployTable(d1: D1ClientModule, db: LocalDb, spec: TableSpec): Promise<{ table: string; sourceRows: number; batches: number }> {
  const rows = db.prepare(spec.sourceSql).all() as Record<string, unknown>[];
  const placeholders = spec.columns.map((_, i) => `?${i + 1}`).join(", ");
  const insertSql = `INSERT OR IGNORE INTO ${spec.name} (${spec.columns.join(", ")}) VALUES (${placeholders})`;

  const batches = chunk(rows, BATCH_SIZE);
  let done = 0;
  for (const batch of batches) {
    const statements = batch.map((row) => ({ sql: insertSql, params: spec.columns.map((col) => row[col] ?? null) }));
    await withRetry(() => d1.d1Batch(statements), `${spec.name} batch`);
    done += batch.length;
    if (batches.length > 5 && (done % (BATCH_SIZE * 10) === 0 || done === rows.length)) {
      console.log(`  ${spec.name}: ${done}/${rows.length}`);
    }
  }
  return { table: spec.name, sourceRows: rows.length, batches: batches.length };
}

async function deployFts(d1: D1ClientModule, db: LocalDb): Promise<number> {
  const rows = db.prepare("SELECT food_id, name, normalized_name, scientific_name, classification, preparation, source_food_id FROM canonical_foods_fts").all() as Record<string, unknown>[];
  const insertSql = `INSERT INTO canonical_foods_fts (food_id, name, normalized_name, scientific_name, classification, preparation, source_food_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`;
  // FTS5 nao suporta ON CONFLICT/OR IGNORE — checa o que ja existe primeiro pra continuar idempotente entre reruns.
  const existing = new Set((await d1.d1Query<{ food_id: string }>("SELECT food_id FROM canonical_foods_fts")).map((r) => r.food_id));
  const toInsert = rows.filter((r) => !existing.has(r.food_id as string));
  const batches = chunk(toInsert, BATCH_SIZE);
  let done = 0;
  for (const batch of batches) {
    const statements = batch.map((row) => ({
      sql: insertSql,
      params: [row.food_id, row.name, row.normalized_name, row.scientific_name, row.classification, row.preparation, row.source_food_id],
    }));
    await withRetry(() => d1.d1Batch(statements), "canonical_foods_fts batch");
    done += batch.length;
    if (batches.length > 5) console.log(`  canonical_foods_fts: ${done}/${toInsert.length}`);
  }
  return toInsert.length;
}

async function main() {
  if (!process.argv.includes(REQUIRED_FLAG)) {
    throw new Error(`Confirmação obrigatória ausente. Rode com ${REQUIRED_FLAG} para confirmar que este é o banco D1 correto.`);
  }
  const d1: D1ClientModule = await import("@/lib/d1/client");
  const { openLocalCanonicalDb }: LocalDbModule = await import("./local-db");

  await verifyTarget();

  const dbPath = resolve(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "reports/canonical-nutrition-local.sqlite");
  const db = openLocalCanonicalDb(dbPath);
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const only = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",")) : null;
  const tablesToRun = only ? TABLES.filter((t) => only.has(t.name)) : TABLES;

  const start = Date.now();
  const results = [];
  for (const spec of tablesToRun) {
    console.log(`Deploy ${spec.name}...`);
    results.push(await deployTable(d1, db, spec));
  }
  let ftsInserted = 0;
  if (!only || only.has("canonical_foods_fts")) {
    console.log("Deploy canonical_foods_fts...");
    ftsInserted = await deployFts(d1, db);
  }

  db.close();
  const elapsedSec = (Date.now() - start) / 1000;

  const counts: Record<string, number> = {};
  for (const spec of TABLES) {
    const row = await d1.d1Query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${spec.name}`);
    counts[spec.name] = row[0]?.n ?? 0;
  }
  const ftsCount = (await d1.d1Query<{ n: number }>("SELECT COUNT(*) AS n FROM canonical_foods_fts"))[0]?.n ?? 0;

  const report = { generatedAt: new Date().toISOString(), elapsedSec, batchSize: BATCH_SIZE, tables: results, ftsInsertedThisRun: ftsInserted, finalCountsInD1: { ...counts, canonical_foods_fts: ftsCount } };
  mkdirSync(resolve("reports"), { recursive: true });
  writeFileSync(resolve("reports/d1-deploy-summary.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
