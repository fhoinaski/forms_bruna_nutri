import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
const databasePath = process.argv[2] ?? "reports/food-database-f3-3-ibge-test.sqlite";
const db = new DatabaseSync(databasePath, { readOnly: true });

function rows(sql) {
  return db.prepare(sql).all();
}

function count(sql) {
  return Number(db.prepare(sql).get().count);
}

const audit = {
  databasePath,
  foodsBySource: rows("SELECT source, COUNT(*) AS count FROM canonical_foods GROUP BY source ORDER BY source"),
  nutrientsBySource: rows("SELECT source, COUNT(*) AS count, COUNT(DISTINCT canonical_food_id) AS foods FROM food_nutrient_values GROUP BY source ORDER BY source"),
  portionsBySource: rows("SELECT source, COUNT(*) AS count, COUNT(DISTINCT canonical_food_id) AS foods FROM canonical_food_portions GROUP BY source ORDER BY source"),
  orphanPortions: count("SELECT COUNT(*) AS count FROM canonical_food_portions p LEFT JOIN canonical_foods f ON f.id = p.canonical_food_id WHERE f.id IS NULL"),
  duplicateSourcePortions: count("SELECT COUNT(*) AS count FROM (SELECT canonical_food_id, source, source_portion_id FROM canonical_food_portions GROUP BY canonical_food_id, source, source_portion_id HAVING COUNT(*) > 1)"),
  invalidPortionWeights: count("SELECT COUNT(*) AS count FROM canonical_food_portions WHERE gram_weight IS NOT NULL AND gram_weight <= 0"),
  sourceIdentityConflicts: count("SELECT COUNT(*) AS count FROM (SELECT source, source_food_id FROM canonical_foods GROUP BY source, source_food_id HAVING COUNT(*) > 1)"),
  ibgePortionSourceMismatch: count("SELECT COUNT(*) AS count FROM canonical_food_portions p JOIN canonical_foods f ON f.id = p.canonical_food_id WHERE p.source = 'IBGE_POF' AND (f.source != 'IBGE_POF' OR p.source_food_id != f.source_food_id)"),
  tbcaPortionSourceMismatch: count("SELECT COUNT(*) AS count FROM canonical_food_portions p JOIN canonical_foods f ON f.id = p.canonical_food_id WHERE p.source = 'TBCA' AND (f.source != 'TBCA' OR p.source_food_id != f.source_food_id)"),
  ibgePreparation: rows("SELECT f.preparation_name, f.preparation_code, COUNT(DISTINCT f.id) AS foods, COUNT(p.id) AS portions FROM canonical_foods f LEFT JOIN canonical_food_portions p ON p.canonical_food_id = f.id AND p.source = 'IBGE_POF' WHERE f.source = 'IBGE_POF' GROUP BY f.preparation_name, f.preparation_code ORDER BY portions DESC, foods DESC"),
};

db.close();
console.log(JSON.stringify(audit, null, 2));
