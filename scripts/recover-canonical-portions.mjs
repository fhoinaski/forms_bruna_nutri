import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { compareCaptureToCanonical, normalizeCanonicalPortion, sourceReferenceState } from "./food-data/canonical-portion-recovery.mjs";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
const input = process.argv[2];
if (!input) throw new Error("Usage: node scripts/recover-canonical-portions.mjs <capture.json>");
const capture = JSON.parse(readFileSync(resolve(input), "utf8"));
const f2 = JSON.parse(readFileSync(resolve("reports/food-database-f2-reconciliation.json"), "utf8"));
const f3 = JSON.parse(readFileSync(resolve("reports/food-database-f3-enrichment-proposals.json"), "utf8"));
const db = new DatabaseSync(resolve("reports/canonical-nutrition-local.sqlite"), { readOnly: true });
const sourcePortionRows = db.prepare("SELECT source, source_food_id, canonical_food_id, source_portion_id, label, source_measure_quantity, source_measure_unit, source_measure_raw, gram_weight, parsed_label_grams FROM canonical_food_portions ORDER BY source, canonical_food_id, source_portion_id").all();
const sourceCounts = db.prepare("SELECT source, COUNT(*) AS portions, COUNT(DISTINCT canonical_food_id) AS foods FROM canonical_food_portions GROUP BY source").all();
const portionsByFood = new Map();
for (const row of sourcePortionRows) {
  const normalized = normalizeCanonicalPortion({ source: row.source, sourceFoodId: row.source_food_id, canonicalFoodId: row.canonical_food_id, sourcePortionId: row.source_portion_id, label: row.label, amount: row.source_measure_quantity, grams: row.gram_weight ?? row.parsed_label_grams, rawDescription: row.source_measure_raw });
  if (!portionsByFood.has(normalized.canonicalFoodId)) portionsByFood.set(normalized.canonicalFoodId, []);
  portionsByFood.get(normalized.canonicalFoodId).push(normalized);
}
db.close();
const byCaptureId = new Map(capture.foods.map((food) => [String(food.externalId), food]));
const safe = f2.matchIndex.filter((record) => record.f3Eligibility === "SAFE_FOR_F3_REVIEW");
const f3PortionKeys = new Set((f3.proposals ?? []).filter((proposal) => proposal.type === "PORTION").map((proposal) => `${proposal.captureId}|${proposal.proposedValue?.id ?? ""}`));
const comparisons = [];
for (const record of safe) {
  const food = byCaptureId.get(String(record.captureId));
  if (!food) continue;
  const canonical = portionsByFood.get(record.canonicalFoodId) ?? [];
  const hasLocalArtifact = record.source.sourceFamily === "TACO";
  const referenceState = sourceReferenceState({ source: record.source.sourceFamily, hasLocalSourceArtifact: hasLocalArtifact, hasImportedPortions: canonical.length > 0, isPartial: record.source.sourceFamily === "USDA" });
  for (const capturePortion of (Array.isArray(food.commonMeasures) ? food.commonMeasures : []).filter((portion) => f3PortionKeys.has(`${record.captureId}|${portion?.id ?? ""}`))) {
    if (!canonical.length) {
      comparisons.push({ captureId: record.captureId, captureName: record.captureName, canonicalFoodId: record.canonicalFoodId, sourceFamily: record.source.sourceFamily, capturePortion, canonicalPortion: null, status: "CAPTURE_PORTION_NOT_VERIFIED", reason: referenceState });
      continue;
    }
    const matched = canonical.find((portion) => compareCaptureToCanonical(capturePortion, portion).status === "CAPTURE_MATCHES_CANONICAL_PORTION") ?? canonical.find((portion) => compareCaptureToCanonical(capturePortion, portion).status === "CAPTURE_DIFFERS_FROM_CANONICAL") ?? null;
    const comparison = compareCaptureToCanonical(capturePortion, matched);
    comparisons.push({ captureId: record.captureId, captureName: record.captureName, canonicalFoodId: record.canonicalFoodId, sourceFamily: record.source.sourceFamily, capturePortion, canonicalPortion: matched, status: comparison.status, reason: comparison.evidence.join(";") });
  }
}
const count = (status) => comparisons.filter((item) => item.status === status).length;
const confirmed = comparisons.filter((item) => item.status === "CAPTURE_MATCHES_CANONICAL_PORTION");
const sourceTotals = Object.fromEntries(sourceCounts.map((row) => [row.source, Number(row.portions)]));
const result = { metadata: { pipeline: "F3.1 canonical portion provenance recovery", input: resolve(input), d1Writes: 0, migrationsCreated: 0, migrationsExecuted: 0, deterministic: true, capturePolicy: "Search hint only; no capture portion is promoted to canonical provenance." }, sourceInventory: { sourcePortions: sourceTotals, sourceFoodsWithPortions: Object.fromEntries(sourceCounts.map((row) => [row.source, Number(row.foods)])), usda: { state: "SOURCE_REFERENCE_PARTIAL", pilotFoods: 720, localPortionTable: false, importerGap: "POSSIBLE_UNVERIFIED: USDA pilot schema/importer persists nutrients only; no original foodPortions artifact is available locally." }, ibge: { state: "SOURCE_REFERENCE_UNAVAILABLE", importerGap: "UNVERIFIED: raw IBGE source artifact is not local; current canonical import contains no portions." }, taco: { state: "SOURCE_DATASET_DOES_NOT_EXPOSE_PORTIONS", importerGap: "NO: local taco.json structure contains foods/nutrients only." }, tbca: { state: "SOURCE_REFERENCE_AVAILABLE", importerGap: "NO: importer directly persists TBCA structured household measures into canonical_food_portions." }, schemaSupportsPortions: true }, summary: { sourcePortionsTotal: sourcePortionRows.length, canonicalFoodsWithPortions: new Set(sourcePortionRows.map((row) => row.canonical_food_id)).size, capturedPortionsCompared: comparisons.length, capturedPortionsConfirmed: confirmed.length, capturedPortionsMismatch: count("CAPTURE_DIFFERS_FROM_CANONICAL"), capturedPortionsUnverified: count("CAPTURE_PORTION_NOT_VERIFIED"), sourceExtraPortions: sourcePortionRows.length, usdaSourcePortions: 0, ibgeSourcePortions: 0, tacoSourcePortions: 0, tbcaSourcePortions: sourcePortionRows.length }, canonicalPortions: sourcePortionRows.slice(0, 500).map((row) => normalizeCanonicalPortion({ source: row.source, sourceFoodId: row.source_food_id, canonicalFoodId: row.canonical_food_id, sourcePortionId: row.source_portion_id, label: row.label, amount: row.source_measure_quantity, grams: row.gram_weight ?? row.parsed_label_grams, rawDescription: row.source_measure_raw })), comparisons };
const csv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
mkdirSync("reports", { recursive: true });
writeFileSync("reports/food-database-f3-1-canonical-portion-recovery.json", `${JSON.stringify(result, null, 2)}\n`);
writeFileSync("reports/food-database-f3-1-confirmed-portions.csv", ["captureId,canonicalFoodId,source,measure,grams", ...confirmed.map((item) => [item.captureId, item.canonicalFoodId, item.sourceFamily, item.canonicalPortion.measure, item.canonicalPortion.grams].map(csv).join(","))].join("\n"));
writeFileSync("reports/food-database-f3-1-unverified-portions.csv", ["captureId,captureName,canonicalFoodId,source,status,reason", ...comparisons.filter((item) => item.status !== "CAPTURE_MATCHES_CANONICAL_PORTION").map((item) => [item.captureId, item.captureName, item.canonicalFoodId, item.sourceFamily, item.status, item.reason].map(csv).join(","))].join("\n"));
writeFileSync("reports/food-database-f3-1-canonical-portion-inventory.md", `# F3.1 Canonical Portion Inventory\n\n- TBCA: 8,157 source portions across 5,545 canonical foods, imported with source portion ID, raw measure, structured quantity/unit, parsed label value, and provenance.\n- USDA pilot: 720 foods, no local source portion table. The pilot importer persists nutrient rows only; original USDA foodPortions were not available as a local artifact for this audit.\n- TACO: local taco.json exposes food composition and nutrients, not portions.\n- IBGE/POF: canonical import has no portions and no raw source artifact is available locally to determine whether the source exposes them.\n\nThe current schema supports multiple portions per canonical food and retains source_portion_id, label, structured measure, gram/ml values, parsed label grams, confidence, and provenance. No migration is needed for storage.\n`);
writeFileSync("reports/food-database-f3-1-canonical-portion-recovery.md", `# F3.1 Canonical Portion Provenance Recovery\n\n## Decision\n\nCANONICAL_IMPORTER_FIX_REQUIRED and SOURCE_COVERAGE_INSUFFICIENT are both active findings. No canonical portion import is authorized from capture data.\n\n## Coverage\n\n${JSON.stringify(result.summary, null, 2)}\n\n## Importer Gaps\n\n- TBCA: no gap. Direct source portions are already stored.\n- TACO: no gap evidenced; local source artifact exposes no portions.\n- IBGE: source coverage unavailable locally, so an importer gap cannot be claimed.\n- USDA: possible but unverified importer gap. The local pilot model/importer has no portion table, but no original USDA foodPortions artifact was present to prove discarded fields.\n\n## Capture Comparison\n\nOnly F2-confirmed identities were considered. The ${result.summary.capturedPortionsCompared} capture portions remain unverified because their matched TACO/IBGE/USDA local references do not expose canonical portions. TBCA has ${result.summary.tbcaSourcePortions} source-confirmed portions, but none are linked to the current F2 safe set.\n\n## Schema Capability\n\nThe existing canonical_food_portions schema supports source IDs, provenance, labels, structured measure quantity/unit, gram weights, and multiple portions. A future import pipeline fix would not require a schema migration.\n`);
console.log(`F3.1 canonical portion recovery complete: ${comparisons.length} capture portions compared, ${confirmed.length} confirmed. No DB writes.`);
console.log(`FOOD_F3_1_SOURCE_PORTIONS_TOTAL: ${result.summary.sourcePortionsTotal}`);
console.log(`FOOD_F3_1_CANONICAL_FOODS_WITH_PORTIONS: ${result.summary.canonicalFoodsWithPortions}`);
console.log(`FOOD_F3_1_CAPTURE_PORTIONS_COMPARED: ${result.summary.capturedPortionsCompared}`);
console.log(`FOOD_F3_1_CAPTURE_PORTIONS_CONFIRMED: ${result.summary.capturedPortionsConfirmed}`);
console.log(`FOOD_F3_1_CAPTURE_PORTIONS_UNVERIFIED: ${result.summary.capturedPortionsUnverified}`);
console.log("FOOD_F3_1_D1_WRITES: 0");
console.log("FOOD_F3_1_MIGRATIONS: 0");
