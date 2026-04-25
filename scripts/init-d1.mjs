/**
 * Script para inicializar o schema no Cloudflare D1.
 *
 * USO:
 *   npx wrangler d1 execute forms_bruna_nutri --file=./db/schema.sql --remote
 *
 * Ou via API (requer CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_D1_API_TOKEN):
 *   node scripts/init-d1.mjs
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, "..", "db", "schema.sql");

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
const apiToken = process.env.CLOUDFLARE_D1_API_TOKEN;

if (!accountId || !databaseId || !apiToken) {
  console.error(
    "Erro: defina CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID e CLOUDFLARE_D1_API_TOKEN"
  );
  process.exit(1);
}

const sql = readFileSync(schemaPath, "utf-8");

const statements = sql
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`Aplicando ${statements.length} statements no D1...`);

for (const statement of statements) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql: statement, params: [] }),
    }
  );
  const data = await res.json();
  if (!res.ok || !data.success) {
    console.error("Erro ao executar statement:", statement);
    console.error(data.errors);
    process.exit(1);
  }
  console.log("✓", statement.slice(0, 60));
}

console.log("\nSchema aplicado com sucesso!");
