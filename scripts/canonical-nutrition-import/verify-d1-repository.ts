#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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

/**
 * FASE 4 (item 12: "D1 repository works") — smoke real contra o D1
 * configurado, provando que lib/repositories/canonical-foods.ts e
 * lib/nutrition/canonical-food-search.ts funcionam contra D1 de verdade
 * (nao so contra o SQLite local dos testes automatizados).
 */
async function main() {
  const { search, getById, getPortions, getNutrients } = await import("@/lib/repositories/canonical-foods");

  console.log("=== search() via D1 real ===");
  const results = await search({ query: "Arroz, integral, cozido", limit: 3 });
  for (const r of results) console.log(r.source, r.sourceFoodId, r.name, r.score, r.matchMethod);
  if (!results.length) throw new Error("search() nao retornou nada do D1 — deploy incompleto?");

  const foodId = results[0].foodId;
  console.log("\n=== getById() via D1 real ===");
  const detail = await getById(foodId);
  console.log(detail);
  if (!detail) throw new Error("getById() nao encontrou o alimento recem retornado pela busca.");

  console.log("\n=== getPortions() via D1 real ===");
  const portions = await getPortions(foodId);
  console.log(`${portions.length} porcoes`);

  console.log("\n=== getNutrients() via D1 real ===");
  const nutrients = await getNutrients(foodId);
  console.log(`${nutrients.length} nutrientes, exemplo:`, nutrients[0]);

  console.log("\nOK: repository funciona contra D1 real.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
