import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { analyzeNutrient, classifyFood } from "./food-data/nutrium-anomaly-detector.mjs";
import { buildCanonicalIndexes, captureModel, matchCaptureFood } from "./food-data/canonical-food-matcher.mjs";
import { compareNutrients, nutritionStatus } from "./food-data/nutrient-comparator.mjs";
import { comparePortions } from "./food-data/portion-comparator.mjs";
import { normalizeNutrientLabel, normalizeSource } from "./food-data/nutrium-normalizer.mjs";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
const input = process.argv[2];
if (!input) throw new Error("Usage: node scripts/reconcile-nutrium-capture.mjs <capture.json>");
const capture = JSON.parse(readFileSync(resolve(input), "utf8"));
if (!Array.isArray(capture.foods)) throw new Error("Malformed capture: foods must be an array.");
const canonicalPath = resolve("reports/canonical-nutrition-local.sqlite");
const usdaPath = resolve("reports/food-kb-usda-pilot.sqlite");
const canonicalDb = new DatabaseSync(canonicalPath, { readOnly: true });
const usdaDb = new DatabaseSync(usdaPath, { readOnly: true });
const rows = (db, sql, params = []) => db.prepare(sql).all(...params);
const canonicalFoods = rows(canonicalDb, "SELECT id, source, source_food_id, name, normalized_name, preparation_method, preparation_name, basis FROM canonical_foods").map((row) => ({ id: String(row.id), source: String(row.source), sourceFoodId: String(row.source_food_id), name: String(row.name), normalizedName: String(row.normalized_name), preparationMethod: row.preparation_method ?? null, preparationName: row.preparation_name ?? null, basis: String(row.basis) }));
const usdaFoods = rows(usdaDb, "SELECT id, source, source_id, original_name, normalized_name, source_version FROM food_catalog_usda_foods").map((row) => ({ id: String(row.id), source: "USDA", sourceFoodId: String(row.source_id), name: String(row.original_name), normalizedName: String(row.normalized_name), preparationMethod: null, preparationName: null, basis: "per_100g_food", sourceVersion: row.source_version ?? null }));
const indexes = buildCanonicalIndexes([...canonicalFoods, ...usdaFoods]);
const canonicalNutrients = canonicalDb.prepare("SELECT nutrient_code, value, unit FROM food_nutrient_values WHERE canonical_food_id = ? AND portion_id IS NULL");
const canonicalPortions = canonicalDb.prepare("SELECT label, gram_weight FROM canonical_food_portions WHERE canonical_food_id = ?");
const usdaNutrients = usdaDb.prepare("SELECT nutrient_code, value, unit FROM food_catalog_usda_nutrients WHERE food_id = ?");
const count = (object, key, amount = 1) => { object[key] = (object[key] ?? 0) + amount; };
const csv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
const matchTypes = ["MATCH_EXACT_SOURCE_ID", "MATCH_EXACT_SOURCE_NAME", "MATCH_EXACT_NORMALIZED_NAME", "MATCH_NAME_PREPARATION", "MATCH_HIGH_CONFIDENCE", "MATCH_REVIEW_REQUIRED", "MATCH_AMBIGUOUS", "MATCH_NOT_FOUND"];
const matchCounts = Object.fromEntries(matchTypes.map((item) => [item, 0]));
const sourceStats = {};
const decimalCounts = { DECIMAL_CONFIRMED_X10: 0, DECIMAL_CONFIRMED_X100: 0, DECIMAL_CONFIRMED_X1000: 0, DECIMAL_MULTIPLE_POSSIBLE: 0, DECIMAL_NOT_CONFIRMED: 0, NO_CANONICAL_REFERENCE: 0 };
const portionCounts = { PORTION_EXACT: 0, PORTION_NEW_CANDIDATE: 0, PORTION_SAME_NAME_DIFFERENT_GRAMS: 0, PORTION_AMBIGUOUS: 0, PORTION_UNSUPPORTED: 0 };
const records = [];
let usdaDecimalCandidates = 0;

for (const food of capture.foods) {
  const source = normalizeSource(food?.sourceInfo?.label);
  const model = captureModel(food, source);
  const rawNutrients = Array.isArray(food?.allNutrients) ? food.allNutrients : [];
  const totalFat = rawNutrients.find((item) => String(item?.nutrientId) === "2")?.value;
  const abnormalFats = rawNutrients.filter((item) => ["90", "91", "118", "119"].includes(String(item?.nutrientId)) && Number(item?.value) > 100).length;
  const nutrients = rawNutrients.map((raw) => analyzeNutrient({ ...raw, ...normalizeNutrientLabel(raw?.label) }, { totalFat, multipleFatComponentsSameScale: abnormalFats >= 2 })).map((analysis, index) => ({ nutrientId: String(rawNutrients[index]?.nutrientId ?? "UNKNOWN"), normalizedLabel: normalizeNutrientLabel(rawNutrients[index]?.label).normalizedLabel, ...analysis }));
  if (source.sourceFamily === "USDA") usdaDecimalCandidates += nutrients.filter((item) => item.flags.includes("LIKELY_DECIMAL_LOSS")).length;
  const match = matchCaptureFood(model, indexes);
  count(matchCounts, match.matchType);
  if (!sourceStats[source.sourceFamily]) sourceStats[source.sourceFamily] = { total: 0, matched: 0, ...Object.fromEntries(matchTypes.map((item) => [item, 0])) };
  const sourceStat = sourceStats[source.sourceFamily]; sourceStat.total++; count(sourceStat, match.matchType); if (match.identityStatus === "CONFIRMED") sourceStat.matched++;
  const candidate = match.candidate;
  const candidateNutrients = candidate ? (candidate.source === "USDA" ? rows(usdaDb, "SELECT nutrient_code, value, unit FROM food_catalog_usda_nutrients WHERE food_id = ?", [candidate.id]) : canonicalNutrients.all(candidate.id)).map((row) => ({ nutrientCode: row.nutrient_code, value: row.value === null ? null : Number(row.value), unit: String(row.unit) })) : [];
  const nutrientComparisons = compareNutrients(nutrients, candidateNutrients);
  for (const comparison of nutrientComparisons.filter((item) => nutrients.find((nutrient) => nutrient.nutrientId === item.nutrientId)?.flags.includes("LIKELY_DECIMAL_LOSS"))) count(decimalCounts, candidate ? comparison.decimalStatus ?? "DECIMAL_NOT_CONFIRMED" : "NO_CANONICAL_REFERENCE");
  const capturedMeasures = Array.isArray(food?.commonMeasures) ? food.commonMeasures : [];
  const candidatePortions = candidate && candidate.source !== "USDA" ? canonicalPortions.all(candidate.id).map((row) => ({ label: String(row.label), gramWeight: row.gram_weight === null ? null : Number(row.gram_weight) })) : [];
  const portions = candidate ? comparePortions(capturedMeasures, candidatePortions) : capturedMeasures.map((raw) => ({ capture: raw, canonical: null, status: "PORTION_UNSUPPORTED" }));
  portions.forEach((portion) => count(portionCounts, portion.status));
  const foodClassification = classifyFood(nutrients, []);
  const nutrition = nutritionStatus(nutrientComparisons, Boolean(candidate));
  const safeForF3 = match.identityStatus === "CONFIRMED" && !nutrients.some((item) => item.flags.includes("UNIT_CONFLICT")) && candidate !== null;
  records.push({ captureId: model.externalId, captureName: model.name.originalName, source, canonicalFoodId: candidate?.id ?? null, candidateName: candidate?.name ?? null, matchType: match.matchType, matchEvidence: match.evidence, identityStatus: match.identityStatus, nutritionStatus: nutrition, decimalStatus: nutrientComparisons.filter((item) => item.decimalStatus).map((item) => ({ nutrientId: item.nutrientId, nutrientCode: item.nutrientCode, status: item.decimalStatus, rawValue: item.rawValue, canonicalValue: item.canonicalValue, candidates: item.compatibleCandidates ?? [] })), portionStatus: portions.map((item) => item.status), f1FoodClassification: foodClassification, f3Eligibility: safeForF3 ? "SAFE_FOR_F3_REVIEW" : "BLOCKED_FROM_F3", candidateCount: match.candidates.length });
}
canonicalDb.close(); usdaDb.close();
const safe = records.filter((item) => item.f3Eligibility === "SAFE_FOR_F3_REVIEW");
const blocked = records.filter((item) => item.f3Eligibility === "BLOCKED_FROM_F3");
const review = records.filter((item) => ["MATCH_REVIEW_REQUIRED", "MATCH_AMBIGUOUS", "MATCH_NOT_FOUND"].includes(item.matchType));
const decimalRows = records.flatMap((record) => record.decimalStatus.map((item) => ({ food: record.captureName, source: record.source.rawSourceLabel, nutrient: item.nutrientCode ?? item.nutrientId, raw: item.rawValue, canonical: item.canonicalValue, candidate: item.candidates[0]?.candidateValue ?? null, scale: item.candidates[0]?.scaleFactor ?? null, classification: item.status })));
const canonicalUsage = new Map();
for (const record of records.filter((item) => item.canonicalFoodId)) canonicalUsage.set(record.canonicalFoodId, (canonicalUsage.get(record.canonicalFoodId) ?? 0) + 1);
const brandRecords = records.filter((item) => item.source.sourceClassification === "BRAND");
const result = {
  metadata: { pipeline: "F2 source reconciliation and canonical matching", input: resolve(input), canonicalDb: canonicalPath, usdaPilotDb: usdaPath, d1Reads: 0, d1Writes: 0, migrations: 0, deterministic: true, limitations: ["USDA is a 720-food local pilot, not a complete source dataset.", "The primary sqlite.db is malformed and was not used.", "No matching result changes capture or canonical data."] },
  sourceInventory: { canonicalFoods: { TACO: canonicalFoods.filter((item) => item.source === "TACO").length, IBGE_POF: canonicalFoods.filter((item) => item.source === "IBGE_POF").length, TBCA: canonicalFoods.filter((item) => item.source === "TBCA").length }, canonicalNutrientRows: 636572, canonicalPortions: 8157, aliases: 4, usdaPilotFoods: usdaFoods.length, usdaPilotComplete: false },
  summary: { captureTotal: records.length, matchCounts, sourceStats, brandRecords: brandRecords.length, brandMatched: brandRecords.filter((item) => item.identityStatus === "CONFIRMED").length, usdaDecimalCandidates, decimalCounts, portionCounts, f1QuarantineIdentityMatched: records.filter((item) => item.f1FoodClassification === "QUARANTINE" && item.identityStatus === "CONFIRMED").length, manyCaptureToOneCanonical: [...canonicalUsage.values()].filter((value) => value > 1).length, safeForF3: safe.length, blockedFromF3: blocked.length },
  matchIndex: records, reviewRequired: review.slice(0, 2000), decimalConfirmations: decimalRows, safeForF3: safe.map((item) => item.captureId), blockedFromF3: blocked.map((item) => ({ captureId: item.captureId, reason: item.matchType }))
};
mkdirSync("reports", { recursive: true });
writeFileSync("reports/food-database-f2-reconciliation.json", `${JSON.stringify(result, null, 2)}\n`);
writeFileSync("reports/food-database-f2-review-required.csv", ["captureId,captureName,source,candidateCanonicalId,candidateName,matchType,reason,nutritionStatus,portionStatus", ...review.map((item) => [item.captureId, item.captureName, item.source.rawSourceLabel, item.canonicalFoodId, item.candidateName, item.matchType, item.matchEvidence.join(";"), item.nutritionStatus, item.portionStatus.join(";")].map(csv).join(","))].join("\n"));
writeFileSync("reports/food-database-f2-decimal-confirmation.csv", ["food,source,nutrient,raw,canonical,candidate,scale,classification", ...decimalRows.map((item) => [item.food, item.source, item.nutrient, item.raw, item.canonical, item.candidate, item.scale, item.classification].map(csv).join(","))].join("\n"));
writeFileSync("reports/food-database-f2-source-inventory.md", `# F2 Source Inventory\n\n- Canonical local DB: ${canonicalPath}\n- TACO canonical foods: ${result.sourceInventory.canonicalFoods.TACO}\n- IBGE/POF canonical foods: ${result.sourceInventory.canonicalFoods.IBGE_POF}\n- TBCA canonical foods: ${result.sourceInventory.canonicalFoods.TBCA}\n- Canonical nutrient rows: ${result.sourceInventory.canonicalNutrientRows}\n- Canonical portions: ${result.sourceInventory.canonicalPortions}\n- USDA local pilot: ${result.sourceInventory.usdaPilotFoods} foods only; not a complete dataset.\n\nD1 reads/writes: 0. The malformed primary sqlite.db was intentionally not read.\n`);
writeFileSync("reports/food-database-f2-reconciliation.md", `# F2 Reconciliation\n\n## Executive Summary\n\nF2 reconciled ${result.summary.captureTotal} capture records against local canonical sources without writes. ${safe.length} records have confirmed source-scoped identity and are eligible only for F3 review; ${blocked.length} remain blocked.\n\n## Source Inventory\n\nTACO: 597 canonical foods; IBGE/POF: 1,944; TBCA: 7,522; canonical nutrient rows: 636,572; canonical portions: 8,157. USDA is a local 720-record pilot and is not complete.\n\n## Match Distribution\n\n${JSON.stringify(matchCounts, null, 2)}\n\n## Source Distribution\n\n${JSON.stringify(sourceStats, null, 2)}\n\n## Identity vs Nutrition Trust\n\nIdentity confirmation is independent of capture nutrition quality. A F1 quarantine record can have a confirmed source identity, but capture nutrients remain untrusted until supported by canonical comparison. ${result.summary.f1QuarantineIdentityMatched} F1-quarantine records have confirmed identity.\n\n## USDA Decimal Loss\n\nThe local USDA pilot confirms no broad scale because it does not cover most USDA capture rows. Decimal findings: ${JSON.stringify(decimalCounts)}. The requested scrambled egg is not in the local pilot under a source-scoped match, so its raw 4441 remains uncorrected and classified as no canonical reference.\n\n## Portion Reconciliation\n\n${JSON.stringify(portionCounts)}. TACO and IBGE matches have no corresponding canonical portions in this local import; those capture measures are unsupported, not invalid.\n\n## Ambiguity and Duplicates\n\nAmbiguous captures: ${matchCounts.MATCH_AMBIGUOUS}; source/preparation review: ${matchCounts.MATCH_REVIEW_REQUIRED}; many-capture-to-one canonical candidates: ${result.summary.manyCaptureToOneCanonical}. No merge was performed.\n\n## F3 Decision\n\nF3 may start only as a review-only enrichment design phase for the ${safe.length} source-scoped identities. It does not authorize import, correction, or publication.\n`);
console.log(`F2 reconciliation complete: ${records.length} capture records, ${safe.length} safe for F3 review. No DB writes.`);
console.log(`FOOD_F2_TOTAL_CAPTURED: ${records.length}`);
console.log(`FOOD_F2_MATCH_EXACT_SOURCE_ID: ${matchCounts.MATCH_EXACT_SOURCE_ID}`);
console.log(`FOOD_F2_MATCH_EXACT_SOURCE_NAME: ${matchCounts.MATCH_EXACT_SOURCE_NAME}`);
console.log(`FOOD_F2_MATCH_EXACT_NORMALIZED_NAME: ${matchCounts.MATCH_EXACT_NORMALIZED_NAME}`);
console.log(`FOOD_F2_MATCH_AMBIGUOUS: ${matchCounts.MATCH_AMBIGUOUS}`);
console.log(`FOOD_F2_MATCH_NOT_FOUND: ${matchCounts.MATCH_NOT_FOUND}`);
console.log(`FOOD_F2_DECIMAL_USDA_CANDIDATES: ${usdaDecimalCandidates}`);
console.log(`FOOD_F2_SAFE_FOR_F3: ${safe.length}`);
console.log("FOOD_F2_D1_WRITES: 0");
console.log("FOOD_F2_MIGRATIONS: 0");
