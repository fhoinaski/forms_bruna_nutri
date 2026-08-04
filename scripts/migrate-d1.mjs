import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isAlterAddColumnStatement,
  isDuplicateColumnError,
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
  for (const file of files) {
    const statements = splitSqlStatements(readMigration(file));
    if (!statements.length) throw new Error(`Migracao vazia: ${file}`);
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

async function query(sql, params = []) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql, params }),
    }
  );
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.errors?.map((item) => item.message).join("; ") || "Falha ao consultar o D1.");
  }
  return data.result?.[0]?.results ?? [];
}

async function executeMigrationStatement(statement, file, statementIndex) {
  if (isTransactionStatement(statement)) {
    console.log(`Ignorado comando transacional em ${file} #${statementIndex}.`);
    return;
  }

  try {
    await query(statement);
  } catch (error) {
    if (isAlterAddColumnStatement(statement) && isDuplicateColumnError(error)) {
      console.log(`Coluna ja existente em ${file} #${statementIndex}; seguindo.`);
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Falha em ${file} #${statementIndex}: ${message}`);
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

let appliedCount = 0;
for (const file of files) {
  const sql = readMigration(file);
  const checksum = createHash("sha256").update(sql).digest("hex");
  if (applied.has(file)) {
    if (applied.get(file) !== checksum) throw new Error(`A migração já aplicada foi alterada: ${file}`);
    continue;
  }

  const statements = splitSqlStatements(sql);
  if (!statements.length) throw new Error(`Migracao vazia: ${file}`);
  for (const [index, statement] of statements.entries()) {
    await executeMigrationStatement(statement, file, index + 1);
  }
  await query(
    "INSERT INTO schema_migrations (id, checksum, applied_at) VALUES (?1, ?2, ?3)",
    [file, checksum, new Date().toISOString()]
  );
  appliedCount++;
  console.log(`Aplicada: ${file}`);
}

console.log(appliedCount ? `${appliedCount} migração(ões) aplicada(s).` : "Banco já está atualizado.");
