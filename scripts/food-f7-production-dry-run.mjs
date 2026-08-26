import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decryptBackupPayload, checksumOf } from "./lib/backup-crypto.mjs";
import {
  IBGE_ARTIFACT_PATH,
  assertArtifact,
  buildImportPlan,
  readIbgePortions,
} from "./food-data/ibge-portion-import.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const envPath = resolve(root, ".env.local");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0 || line.trimStart().startsWith("#")) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
const apiToken = process.env.CLOUDFLARE_D1_API_TOKEN;
const backupSecret = process.env.BACKUP_ENCRYPTION_KEY;
const backupArgument = process.argv.indexOf("--backup");
const backupPath = backupArgument >= 0 ? resolve(process.argv[backupArgument + 1] ?? "") : null;
if (!accountId || !databaseId || !apiToken || !backupSecret || !backupPath) {
  throw new Error("Usage: node scripts/food-f7-production-dry-run.mjs --backup <encrypted-backup-path>");
}

const blockedStatements = /\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|VACUUM|ATTACH|DETACH|PRAGMA\s+(?!table_info))/i;
function assertReadOnly(sql) {
  if (blockedStatements.test(sql)) throw new Error(`F7 only accepts read-only statements: ${sql}`);
}

async function cloudflare(path, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.errors?.map((item) => item.message).join("; ") || "Cloudflare request failed.");
  return data.result;
}

async function query(sql, params = []) {
  assertReadOnly(sql);
  const result = await cloudflare(`/d1/database/${databaseId}/query`, {
    method: "POST",
    body: JSON.stringify(params.length ? { sql, params } : { sql }),
  });
  const statement = result[0];
  if (!statement?.success) throw new Error("Cloudflare D1 read-only query failed.");
  return statement.results ?? [];
}

async function allRows(sql) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const page = await query(`${sql} LIMIT 500 OFFSET ?1`, [offset]);
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

function mask(value) {
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function localMigrationChecksums() {
  return readdirSync(resolve(root, "db"))
    .filter((name) => /^\d{8}_\d{4}_.+\.sql$/.test(name))
    .sort()
    .map((name) => ({ id: name, checksum: createHash("sha256").update(readFileSync(resolve(root, "db", name))).digest("hex") }));
}

const artifact = assertArtifact(IBGE_ARTIFACT_PATH);
const sourcePortions = readIbgePortions();
const database = await cloudflare(`/d1/database/${databaseId}`);
if (database.uuid !== databaseId || database.name !== "forms_bruna_nutri") {
  throw new Error("Configured D1 target does not match the approved production identity.");
}

const requiredColumns = {
  canonical_foods: ["id", "source", "source_food_id"],
  canonical_food_portions: ["canonical_food_id", "source", "source_portion_id", "label", "gram_weight"],
  food_nutrient_values: ["canonical_food_id", "source", "value"],
  schema_migrations: ["id", "checksum", "applied_at"],
};
const schema = {};
for (const [table, columns] of Object.entries(requiredColumns)) {
  const actual = await query(`PRAGMA table_info(${table})`);
  schema[table] = columns.every((column) => actual.some((entry) => entry.name === column));
}
const schemaPass = Object.values(schema).every(Boolean);

const localMigrations = localMigrationChecksums();
const appliedMigrations = await allRows("SELECT id, checksum FROM schema_migrations ORDER BY id");
const appliedById = new Map(appliedMigrations.map((row) => [row.id, row.checksum]));
const migrationDrift = localMigrations.filter((migration) => appliedById.get(migration.id) !== migration.checksum).map((migration) => migration.id);
const unexpectedMigrations = appliedMigrations.filter((migration) => !localMigrations.some((local) => local.id === migration.id)).map((migration) => migration.id);
const migrationPass = migrationDrift.length === 0 && unexpectedMigrations.length === 0 && appliedMigrations.length === localMigrations.length;

const canonicalRows = await allRows("SELECT id, source_food_id FROM canonical_foods WHERE source = 'IBGE_POF' ORDER BY id");
const existingRows = await allRows("SELECT canonical_food_id, source, source_portion_id, label, gram_weight FROM canonical_food_portions ORDER BY id");
const { counts, plan } = buildImportPlan(sourcePortions, canonicalRows, existingRows);
const baselines = (await query(`SELECT
  (SELECT COUNT(*) FROM canonical_food_portions WHERE source = 'TBCA') AS tbca_portions,
  (SELECT COUNT(*) FROM food_nutrient_values) AS nutrient_values,
  (SELECT COUNT(*) FROM canonical_food_portions WHERE source = 'IBGE_POF') AS ibge_portions,
  (SELECT COUNT(*) FROM canonical_foods WHERE source = 'IBGE_POF') AS ibge_foods`))[0];

if (!existsSync(backupPath)) throw new Error(`Backup not found: ${backupPath}`);
const backupBuffer = readFileSync(backupPath);
const backupChecksum = checksumOf(backupBuffer);
const backupPayload = decryptBackupPayload(backupBuffer, backupSecret);
const backupValid = Array.isArray(backupPayload.schema) && backupPayload.data && typeof backupPayload.data === "object";
const dryRunPass = counts.SOURCE_TOTAL === 11800 && counts.CONFLICTS === 0 && counts.INVALID === 0;
const result = {
  generatedAt: new Date().toISOString(),
  mode: "production-read-only-dry-run",
  productionD1Writes: 0,
  target: { name: database.name, databaseId: mask(databaseId), accountId: mask(accountId), fileSize: database.file_size },
  artifact,
  productionSchema: { pass: schemaPass, tables: schema },
  migrationState: { pass: migrationPass, localCount: localMigrations.length, appliedCount: appliedMigrations.length, drift: migrationDrift, unexpected: unexpectedMigrations },
  backup: { filename: basename(backupPath), checksum: backupChecksum, bytes: statSync(backupPath).size, createdAt: backupPayload.createdAt, tableCount: backupPayload.schema.filter((entry) => entry.type === "table").length, valid: backupValid },
  sourceRows: sourcePortions.length,
  canonicalIbgeFoods: canonicalRows.length,
  counts,
  baselines: { tbcaPortions: Number(baselines.tbca_portions), nutrientValues: Number(baselines.nutrient_values), ibgePortions: Number(baselines.ibge_portions), ibgeFoods: Number(baselines.ibge_foods) },
  dryRunPass,
  approvalRequired: true,
  importExecuted: false,
  importPlanSample: plan.filter((row) => row.status === "NEW_PORTION").slice(0, 20).map((row) => ({ sourcePortionId: row.sourcePortionId, canonicalFoodId: row.canonicalFoodId, label: row.label, grams: row.grams })),
};

const reports = resolve(root, "reports");
writeFileSync(resolve(reports, "food-database-f7-production-dry-run.json"), `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(resolve(reports, "food-database-f7-production-dry-run.md"), `# F7 Production IBGE Portion Dry Run\n\n- Generated: ${result.generatedAt}\n- Target: ${database.name} (${mask(databaseId)})\n- Artifact SHA-256: ${artifact.sha256}\n- Backup: ${result.backup.filename}, SHA-256 ${backupChecksum}, validated: ${backupValid ? "PASS" : "FAIL"}\n- Schema: ${schemaPass ? "PASS" : "FAIL"}; migrations: ${migrationPass ? "PASS" : "FAIL"}\n- Source rows: ${counts.SOURCE_TOTAL}\n- Mapped: ${counts.MAPPED_TO_CANONICAL}\n- Blocked no canonical: ${counts.BLOCKED_NO_CANONICAL}\n- Blocked ambiguous: ${counts.BLOCKED_AMBIGUOUS}\n- Already exact: ${counts.ALREADY_EXISTS_EXACT}\n- Already equivalent: ${counts.ALREADY_EXISTS_EQUIVALENT}\n- New portions: ${counts.NEW_PORTIONS}\n- Conflicts: ${counts.CONFLICTS}\n- Invalid: ${counts.INVALID}\n- TBCA baseline: ${result.baselines.tbcaPortions}\n- Nutrient baseline: ${result.baselines.nutrientValues}\n- Production D1 food writes: 0\n- Import executed: no\n`);
console.log(JSON.stringify(result, null, 2));
