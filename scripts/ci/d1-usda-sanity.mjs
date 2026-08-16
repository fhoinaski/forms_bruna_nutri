#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0 || line.trimStart().startsWith("#")) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const {
  CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_D1_API_TOKEN,
  CLOUDFLARE_D1_DATABASE_ID,
  EXPECTED_D1_DATABASE_NAME,
  EXPECTED_D1_DATABASE_ID,
  EXPECTED_USDA_FOODS,
  EXPECTED_USDA_NUTRIENTS,
  EXPECTED_USDA_FTS,
  REQUIRE_USDA_BATCH,
} = process.env;

if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_D1_API_TOKEN || !CLOUDFLARE_D1_DATABASE_ID) {
  throw new Error("Missing Cloudflare D1 credentials.");
}

async function cloudflare(path, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_D1_API_TOKEN}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.errors?.map((item) => item.message).join("; ") || "Cloudflare request failed.");
  return data.result;
}

async function query(sql, params = []) {
  const result = await cloudflare(`/d1/database/${CLOUDFLARE_D1_DATABASE_ID}/query`, {
    method: "POST",
    body: JSON.stringify(params.length ? { sql, params } : { sql }),
  });
  return result[0]?.results ?? [];
}

function assertEqual(label, actual, expected) {
  if (expected === undefined || expected === "") return;
  const numericExpected = Number(expected);
  if (Number(actual) !== numericExpected) throw new Error(`${label}: expected ${numericExpected}, got ${actual}`);
}

const db = await cloudflare(`/d1/database/${CLOUDFLARE_D1_DATABASE_ID}`);
if (EXPECTED_D1_DATABASE_NAME && db.name !== EXPECTED_D1_DATABASE_NAME) {
  throw new Error(`Database name mismatch: expected ${EXPECTED_D1_DATABASE_NAME}, got ${db.name}`);
}
if (EXPECTED_D1_DATABASE_ID && db.uuid !== EXPECTED_D1_DATABASE_ID) {
  throw new Error(`Database id mismatch: expected ${EXPECTED_D1_DATABASE_ID}, got ${db.uuid}`);
}

const rows = await query(`SELECT
  (SELECT COUNT(*) FROM schema_migrations) AS migrations,
  (SELECT COUNT(*) FROM food_catalog_usda_foods) AS foods,
  (SELECT COUNT(*) FROM food_catalog_usda_nutrients) AS nutrients,
  (SELECT COUNT(*) FROM food_catalog_usda_foods_fts) AS fts,
  (SELECT COUNT(*) FROM food_catalog_usda_nutrients n LEFT JOIN food_catalog_usda_foods f ON f.id = n.food_id WHERE f.id IS NULL) AS orphan_nutrients,
  (SELECT COUNT(*) FROM food_catalog_usda_foods_fts x LEFT JOIN food_catalog_usda_foods f ON f.id = x.food_id WHERE f.id IS NULL) AS orphan_fts,
  (SELECT COUNT(*) FROM import_batches WHERE id = 'USDA_ALLOWLIST_V1' AND status = 'COMPLETED' AND failures = 0) AS completed_batch`);

const counts = rows[0] ?? {};
if (Number(counts.orphan_nutrients) !== 0) throw new Error(`orphan nutrients: ${counts.orphan_nutrients}`);
if (Number(counts.orphan_fts) !== 0) throw new Error(`orphan FTS: ${counts.orphan_fts}`);
if (REQUIRE_USDA_BATCH === "true" && Number(counts.completed_batch) !== 1) {
  throw new Error("USDA_ALLOWLIST_V1 batch is not completed.");
}
assertEqual("USDA foods", counts.foods, EXPECTED_USDA_FOODS);
assertEqual("USDA nutrients", counts.nutrients, EXPECTED_USDA_NUTRIENTS);
assertEqual("USDA FTS", counts.fts, EXPECTED_USDA_FTS);

console.log(JSON.stringify({ database: { name: db.name, uuid: db.uuid, file_size: db.file_size }, counts }, null, 2));
