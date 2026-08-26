import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeMeasure } from "./food-data/nutrium-anomaly-detector.mjs";
import { aliasProposal, portionProposal, preparationCandidate, proposalId, safeDisplayName } from "./food-data/enrichment-review.mjs";
import { preparationKey } from "./food-data/canonical-food-matcher.mjs";
import { normalizeMeasure, parseFoodName } from "./food-data/nutrium-normalizer.mjs";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
const input = process.argv[2];
if (!input) throw new Error("Usage: node scripts/review-nutrium-enrichment.mjs <capture.json>");
const capture = JSON.parse(readFileSync(resolve(input), "utf8"));
const f2 = JSON.parse(readFileSync(resolve("reports/food-database-f2-reconciliation.json"), "utf8"));
if (!Array.isArray(capture.foods) || !Array.isArray(f2.matchIndex)) throw new Error("F3 requires a valid capture and F2 reconciliation report.");
const db = new DatabaseSync(resolve("reports/canonical-nutrition-local.sqlite"), { readOnly: true });
const getFood = db.prepare("SELECT id, name, preparation_method, preparation_name FROM canonical_foods WHERE id = ?");
const getPortions = db.prepare("SELECT label, gram_weight FROM canonical_food_portions WHERE canonical_food_id = ?");
const getAliases = db.prepare("SELECT alias FROM food_aliases WHERE canonical_food_id = ?");
const byCaptureId = new Map(capture.foods.map((food) => [String(food.externalId), food]));
const safe = f2.matchIndex.filter((record) => record.f3Eligibility === "SAFE_FOR_F3_REVIEW");
const proposals = [];
const add = (proposal) => proposals.push({ proposalId: proposalId(proposal), ...proposal });
for (const record of safe) {
  const food = byCaptureId.get(String(record.captureId));
  const canonical = getFood.get(record.canonicalFoodId);
  if (!food || !canonical || !record.source || !record.identityStatus || !record.nutritionStatus) {
    add({ canonicalFoodId: record.canonicalFoodId ?? "UNKNOWN", captureId: record.captureId, type: "NO_ENRICHMENT", currentValue: null, proposedValue: null, source: record.source?.rawSourceLabel ?? "UNKNOWN", capturedVia: "NUTRIUM_CAPTURE", evidence: ["F3_IDENTITY_REVIEW_REQUIRED"], status: "REVIEW_REQUIRED" });
    continue;
  }
  const existingPortions = getPortions.all(canonical.id).map((row) => ({ label: String(row.label), gramWeight: row.gram_weight === null ? null : Number(row.gram_weight) }));
  const measures = Array.isArray(food.commonMeasures) ? food.commonMeasures : [];
  for (const raw of measures) {
    const suspicious = analyzeMeasure(normalizeMeasure(raw)).flags.some((flag) => flag.startsWith("INVALID") || flag.startsWith("SUSPICIOUS"));
    add(portionProposal({ canonicalFoodId: canonical.id, captureId: record.captureId, source: record.source, raw, existingPortions, suspicious }));
  }
  const parsed = parseFoodName(food.name);
  const canonicalPreparation = canonical.preparation_method ?? canonical.preparation_name;
  const preparationMatches = !parsed.preparation || !canonicalPreparation || preparationKey(parsed.preparation) === preparationKey(canonicalPreparation);
  add(aliasProposal({ canonicalFoodId: canonical.id, captureId: record.captureId, captureName: food.name, canonicalName: canonical.name, source: record.source, preparationMatches, existingAliases: getAliases.all(canonical.id) }));
  const preparation = preparationCandidate(parsed.preparation, canonicalPreparation);
  if (preparation.status !== "NO_CHANGE") add({ canonicalFoodId: canonical.id, captureId: record.captureId, type: "PREPARATION_METADATA", currentValue: canonicalPreparation ?? null, proposedValue: preparation.value, source: record.source.rawSourceLabel, capturedVia: "NUTRIUM_CAPTURE", evidence: ["TEXTUAL_PREPARATION_CANDIDATE"], status: preparation.status });
  const display = safeDisplayName(canonical.name);
  if (display.changed) add({ canonicalFoodId: canonical.id, captureId: record.captureId, type: "DISPLAY_NAME", currentValue: canonical.name, proposedValue: display.value, source: record.source.rawSourceLabel, capturedVia: "NUTRIUM_CAPTURE", evidence: ["PUNCTUATION_ONLY_NORMALIZATION"], status: "SAFE_CANDIDATE" });
}
db.close();
const count = (type, status) => proposals.filter((proposal) => proposal.type === type && proposal.status === status).length;
const summary = { safeFoodsAnalyzed: safe.length, usefulEnrichmentFoods: new Set(proposals.filter((proposal) => proposal.status === "SAFE_CANDIDATE").map((proposal) => proposal.captureId)).size, portionsAnalyzed: proposals.filter((proposal) => proposal.type === "PORTION").length, portionsExistingExact: count("PORTION", "PORTION_EXISTING_EXACT"), portionsExistingEquivalent: count("PORTION", "PORTION_EXISTING_EQUIVALENT"), portionsNewSafe: count("PORTION", "PORTION_NEW_SAFE_CANDIDATE"), portionsReviewRequired: count("PORTION", "PORTION_REVIEW_REQUIRED"), portionsConflict: count("PORTION", "PORTION_CONFLICT"), portionsRejected: count("PORTION", "PORTION_REJECTED"), aliasesExisting: count("ALIAS", "NO_CHANGE"), aliasesNewSafe: count("ALIAS", "SAFE_CANDIDATE"), aliasesReviewRequired: count("ALIAS", "REVIEW_REQUIRED"), displayNameCandidates: count("DISPLAY_NAME", "SAFE_CANDIDATE"), preparationMetadataCandidates: count("PREPARATION_METADATA", "REVIEW_REQUIRED"), brandRecordsConfirmed: f2.summary.brandRecords ?? 0 };
const result = { metadata: { pipeline: "F3 portion and alias enrichment review", input: resolve(input), sourceReport: "reports/food-database-f2-reconciliation.json", d1Writes: 0, migrations: 0, nutrientImports: 0, deterministic: true, brandClassifierFix: "F2_CLASSIFIER_FIX: exact capture source labels are now classified BRAND; they remain excluded from generic enrichment." }, summary, proposals, blockedRecords: f2.summary.blockedFromF3 };
const csv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
const review = proposals.filter((proposal) => ["REVIEW_REQUIRED", "CONFLICT", "REJECTED", "PORTION_REVIEW_REQUIRED", "PORTION_CONFLICT", "PORTION_REJECTED"].includes(proposal.status));
mkdirSync("reports", { recursive: true });
writeFileSync("reports/food-database-f3-enrichment-proposals.json", `${JSON.stringify(result, null, 2)}\n`);
writeFileSync("reports/food-database-f3-review-required.csv", ["proposalId,canonicalFoodId,captureId,type,source,status,evidence", ...review.map((proposal) => [proposal.proposalId, proposal.canonicalFoodId, proposal.captureId, proposal.type, proposal.source, proposal.status, proposal.evidence.join(";")].map(csv).join(","))].join("\n"));
writeFileSync("reports/food-database-f3-safe-portions.csv", ["proposalId,canonicalFoodId,captureId,measure,grams,status", ...proposals.filter((proposal) => proposal.type === "PORTION" && proposal.status === "PORTION_NEW_SAFE_CANDIDATE").map((proposal) => [proposal.proposalId, proposal.canonicalFoodId, proposal.captureId, proposal.proposedValue.singular, proposal.proposedValue.grams, proposal.status].map(csv).join(","))].join("\n"));
writeFileSync("reports/food-database-f3-safe-aliases.csv", ["proposalId,canonicalFoodId,captureId,alias,status", ...proposals.filter((proposal) => proposal.type === "ALIAS" && proposal.status === "SAFE_CANDIDATE").map((proposal) => [proposal.proposalId, proposal.canonicalFoodId, proposal.captureId, proposal.proposedValue, proposal.status].map(csv).join(","))].join("\n"));
writeFileSync("reports/food-database-f3-enrichment-review.md", `# F3 Enrichment Review\n\n## Scope\n\nOnly ${summary.safeFoodsAnalyzed} F2 SAFE_FOR_F3 records were analyzed. Capture nutrient values are prohibited from import or recalculation. D1_WRITES = 0; MIGRATIONS = 0.\n\n## Brand Discrepancy\n\n${summary.brandRecordsConfirmed} records are now explicitly classified BRAND from the capture's exact source labels (Liv Up, Mundo Verde Seleção, Atilatte, Eat Clean, Elixir, Dux Nutrition, Vitafor). They remain blocked from generic matching and enrichment.\n\n## Portions\n\n${JSON.stringify({ analyzed: summary.portionsAnalyzed, exact: summary.portionsExistingExact, newSafe: summary.portionsNewSafe, review: summary.portionsReviewRequired, conflict: summary.portionsConflict, rejected: summary.portionsRejected })}\n\nCaptured measures without source-specific canonical portion provenance remain review-required, not safe. Missing edible percentage alone is retained as metadata and does not invalidate grams.\n\n## Aliases and Display Names\n\n${JSON.stringify({ aliasesExisting: summary.aliasesExisting, aliasesNewSafe: summary.aliasesNewSafe, aliasesReview: summary.aliasesReviewRequired, displayNames: summary.displayNameCandidates, preparationMetadata: summary.preparationMetadataCandidates })}\n\nPreparation is never collapsed into an alias. Brand names never become aliases for generic foods.\n\n## F4 Decision\n\nNo F4 import is authorized. F4 may start only as a local/test review if there is an audit-ready safe proposal set; this run reports the actual set without persistence.\n`);
console.log(`F3 enrichment review complete: ${safe.length} safe foods, ${proposals.length} proposals. No DB writes.`);
console.log(`FOOD_F3_SAFE_FOODS_ANALYZED: ${summary.safeFoodsAnalyzed}`);
console.log(`FOOD_F3_PORTIONS_ANALYZED: ${summary.portionsAnalyzed}`);
console.log(`FOOD_F3_PORTIONS_NEW_SAFE: ${summary.portionsNewSafe}`);
console.log(`FOOD_F3_PORTIONS_REVIEW_REQUIRED: ${summary.portionsReviewRequired}`);
console.log(`FOOD_F3_ALIASES_NEW_SAFE: ${summary.aliasesNewSafe}`);
console.log(`FOOD_F3_BRAND_RECORDS_CONFIRMED: ${summary.brandRecordsConfirmed}`);
console.log("FOOD_F3_NUTRIENT_IMPORTS: 0");
console.log("FOOD_F3_D1_WRITES: 0");
console.log("FOOD_F3_MIGRATIONS: 0");
