import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isDestructiveStatement,
  isTransactionStatement,
  splitSqlStatements,
} from "./migration-utils.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0 || line.trimStart().startsWith("#")) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const migrationsDir = join(root, "db");
const files = readdirSync(migrationsDir)
  .filter((name) => /^\d{8}_\d{4}_.+\.sql$/.test(name))
  .sort();

function readMigration(file) {
  return readFileSync(join(migrationsDir, file), "utf8");
}

function validateMigrationFiles() {
  const ids = new Set();
  for (const file of files) {
    const id = file.slice(0, 13);
    if (ids.has(id)) throw new Error(`Identificador de migracao duplicado: ${id}`);
    ids.add(id);
    const sql = readMigration(file);
    const statements = splitSqlStatements(sql);
    if (!statements.length) throw new Error(`Migracao vazia: ${file}`);
    const destructive = statements.find(isDestructiveStatement);
    if (destructive && !sql.includes("migration:allow-destructive")) {
      throw new Error(`DDL destrutivo bloqueado em ${file}. Exige revisao e marcador migration:allow-destructive.`);
    }
  }
}

if (process.argv.includes("--check")) {
  validateMigrationFiles();
  console.log(`${files.length} migracao(oes) validada(s).`);
  process.exit(0);
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
const apiToken = process.env.CLOUDFLARE_D1_API_TOKEN;
if (!accountId || !databaseId || !apiToken) {
  throw new Error("Configure as credenciais do Cloudflare D1 antes de executar as migrações.");
}

async function request(body) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const data = await response.json();
  const failed = data.result?.find((item) => !item.success);
  if (!response.ok || !data.success || failed) {
    throw new Error(data.errors?.map((item) => item.message).join("; ") || "Falha ao consultar o D1.");
  }
  return data.result ?? [];
}

async function query(sql, params = []) {
  const results = await request(params.length ? { sql, params } : { sql });
  return results[0]?.results ?? [];
}

async function applyMigration(file, statements, checksum) {
  const executable = statements.filter((statement) => !isTransactionStatement(statement));
  try {
    await request({
      batch: [
        ...executable.map((sql) => ({ sql })),
        {
          sql: "INSERT INTO schema_migrations (id, checksum, applied_at) VALUES (?1, ?2, ?3)",
          params: [file, checksum, new Date().toISOString()],
        },
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Falha na migracao transacional ${file}: ${message}`);
  }
}

await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
)`);

const applied = new Map(
  (await query("SELECT id, checksum FROM schema_migrations")).map((row) => [row.id, row.checksum])
);
validateMigrationFiles();

function reportChecksumDrift(file) {
  console.error(`\nA migracao "${file}" ja foi aplicada, mas o checksum salvo em schema_migrations`);
  console.error("nao bate com o arquivo local atual (o conteudo do arquivo mudou depois de aplicado,");
  console.error("ou foi aplicado a partir de uma versao diferente da que esta commitada hoje).");
  console.error("Isso NAO significa necessariamente que o schema real esta errado — confirme comparando");
  console.error("`sqlite_master`/`pragma_table_info` no D1 com o DDL do arquivo antes de decidir o que fazer.");
}

if (process.argv.includes("--status")) {
  const pending = files.filter((file) => !applied.has(file));
  const drifted = [];
  for (const file of files) {
    if (!applied.has(file)) continue;
    const checksum = createHash("sha256").update(readMigration(file)).digest("hex");
    if (applied.get(file) !== checksum) drifted.push(file);
  }
  if (drifted.length) {
    for (const file of drifted) reportChecksumDrift(file);
    console.error(`\n${drifted.length} migracao(oes) com checksum divergente.`);
    process.exit(1);
  }
  if (pending.length) {
    console.error(`Banco desatualizado. Migrations pendentes: ${pending.join(", ")}`);
    process.exit(1);
  }
  console.log(`Banco atualizado: ${files.length} migration(oes) aplicadas e verificadas.`);
  process.exit(0);
}

let appliedCount = 0;
for (const file of files) {
  const sql = readMigration(file);
  const checksum = createHash("sha256").update(sql).digest("hex");
  if (applied.has(file)) {
    if (applied.get(file) !== checksum) {
      reportChecksumDrift(file);
      process.exit(1);
    }
    continue;
  }

  const statements = splitSqlStatements(sql);
  if (!statements.length) throw new Error(`Migracao vazia: ${file}`);
  await applyMigration(file, statements, checksum);
  appliedCount++;
  console.log(`Aplicada: ${file}`);
}

console.log(appliedCount ? `${appliedCount} migração(ões) aplicada(s).` : "Banco já está atualizado.");
