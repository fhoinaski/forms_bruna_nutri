import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const input = process.argv[2];
if (!input) throw new Error("Usage: node scripts/audit-nutrium-capture.mjs <capture.json>");

const capture = JSON.parse(readFileSync(resolve(input), "utf8"));
const foods = Array.isArray(capture.foods) ? capture.foods : [];
const counts = (items) => Object.fromEntries([...items].sort(([a], [b]) => a.localeCompare(b)));
const sourceCounts = new Map();
const groupCounts = new Map();
const nutrientCounts = new Map();
const names = new Map();
const anomalies = [];
let portions = 0;
let withoutMeasures = 0;
let withoutMacros = 0;
let brandOrUnknown = 0;
let missingValues = 0;

for (const food of foods) {
  const source = food?.sourceInfo?.label?.trim() || "UNKNOWN";
  sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
  const group = food?.group?.trim() || "UNKNOWN";
  groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
  const normalizedName = String(food?.name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  names.set(normalizedName, (names.get(normalizedName) || 0) + 1);
  const measures = Array.isArray(food?.commonMeasures) ? food.commonMeasures : [];
  portions += measures.length;
  if (!measures.length) withoutMeasures++;
  if (source === "UNKNOWN" || food?.sourceInfo?.type === "unknown") brandOrUnknown++;
  const nutrients = food?.nutrients || {};
  const macroKeys = ["energyKcal", "proteinG", "carbohydrateG", "fatG"];
  if (macroKeys.every((key) => nutrients[key] == null)) withoutMacros++;
  for (const nutrient of Array.isArray(food?.allNutrients) ? food.allNutrients : []) {
    nutrientCounts.set(String(nutrient?.nutrientId ?? "UNKNOWN"), (nutrientCounts.get(String(nutrient?.nutrientId ?? "UNKNOWN")) || 0) + 1);
    if (nutrient?.value == null) missingValues++;
  }
  const gramMacros = ["proteinG", "carbohydrateG", "fatG", "fiberG"];
  const invalid = gramMacros.filter((key) => nutrients[key] != null && (!Number.isFinite(nutrients[key]) || nutrients[key] < 0 || nutrients[key] > 100));
  const fats = ["saturatedFatG", "monounsaturatedFatG", "polyunsaturatedFatG", "transFatG"];
  const fatConflict = Number.isFinite(nutrients.fatG) && fats.some((key) => Number.isFinite(nutrients[key]) && nutrients[key] > nutrients.fatG);
  const decimalLoss = fats.filter((key) => Number.isFinite(nutrients[key]) && nutrients[key] > 100 && nutrients[key] < 10000);
  const badPortion = measures.some((measure) => !Number.isFinite(measure?.grams) || measure.grams <= 0 || measure.grams > 2500);
  if (invalid.length || fatConflict || decimalLoss.length || badPortion) anomalies.push({ externalId: food?.externalId ?? null, name: food?.name ?? null, source, invalid, fatConflict, likelyDecimalLoss: decimalLoss, badPortion, classification: decimalLoss.length ? "LIKELY_DECIMAL_LOSS" : invalid.length || fatConflict || badPortion ? "INVALID" : "OK" });
}

const result = {
  auditOnly: true,
  ingestedFrom: "nutrium_capture",
  capture: { schemaVersion: capture.schemaVersion, source: capture.source, exportedAt: capture.exportedAt, declaredTotal: capture.total, failures: capture.failures?.length ?? null },
  totals: { foods: foods.length, portions, withoutMeasures, withoutMacros, brandOrUnknown, missingNutrientValues: missingValues, duplicateNormalizedNames: [...names.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0), suspiciousFoods: anomalies.length },
  declaredSources: counts(sourceCounts), groups: counts(groupCounts), nutrientIds: counts(nutrientCounts), anomalies: anomalies.slice(0, 500),
  policy: { import: "disabled", nutritionAuthority: "existing canonical source only", captureNutrition: "never overwrite", portions: "review/reconcile only", fuzzyMerge: "review required" },
};
mkdirSync("reports", { recursive: true });
writeFileSync("reports/food-database-nutrium-import-audit.json", `${JSON.stringify(result, null, 2)}\n`);
writeFileSync("reports/food-database-nutrium-import-audit.md", `# Nutrium Capture Audit\n\nStatus: audit-only; no database writes.\n\n- Foods: ${result.totals.foods}\n- Portions: ${portions}\n- Without measures: ${withoutMeasures}\n- Without macros: ${withoutMacros}\n- Brand/unknown provenance: ${brandOrUnknown}\n- Suspicious records: ${anomalies.length}\n- Capture failures declared: ${result.capture.failures}\n\n## Safety decision\n\nThe capture source is not a canonical nutrition authority. No records, nutrients, aliases, or portions were imported. Candidate portions and aliases require source reconciliation and review; fuzzy matches must not auto-merge.\n\n## Anomaly policy\n\nMacronutrients outside 0-100 g/100 g, fat subtypes above total fat, invalid portions, and possible decimal-loss values are reported only. Decimal normalization remains a suggestion until corroborated by an original canonical source.\n\nDetailed machine-readable findings: \`reports/food-database-nutrium-import-audit.json\`.\n`);
console.log(`Audit complete: ${foods.length} foods, ${anomalies.length} suspicious records. No DB writes.`);
