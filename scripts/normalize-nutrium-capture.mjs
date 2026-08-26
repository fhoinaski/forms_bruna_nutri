import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeMeasure, analyzeNutrient, classifyFood, quantile } from "./food-data/nutrium-anomaly-detector.mjs";
import { normalizeMeasure, normalizeNutrientLabel, normalizeSource, parseFoodName } from "./food-data/nutrium-normalizer.mjs";

const input = process.argv[2];
if (!input) throw new Error("Usage: node scripts/normalize-nutrium-capture.mjs <capture.json>");
const capture = JSON.parse(readFileSync(resolve(input), "utf8"));
if (!Array.isArray(capture.foods)) throw new Error("Malformed capture: foods must be an array.");

const count = (map, key, increment = 1) => map.set(key, (map.get(key) ?? 0) + increment);
const sortedObject = (map) => Object.fromEntries([...map.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))));
const flags = ["MISSING", "REPORTED_ZERO", "INVALID_NEGATIVE", "INVALID_NON_FINITE", "PHYSICALLY_SUSPICIOUS", "COMPONENT_GT_TOTAL", "LIKELY_DECIMAL_LOSS", "POSSIBLE_DECIMAL_LOSS", "UNIT_CONFLICT", "UNKNOWN_ANOMALY"];
const classifications = ["CLEAN", "INCOMPLETE", "REVIEW_REQUIRED", "QUARANTINE"];
const classificationCounts = new Map(classifications.map((item) => [item, 0]));
const flagCounts = new Map(flags.map((item) => [item, 0]));
const sourceStats = new Map();
const nutrientStats = new Map();
const nutrientDictionary = new Map();
const names = new Map();
const sampleAnomalies = [];
const measures = [];

for (const food of capture.foods) {
  const source = normalizeSource(food?.sourceInfo?.label);
  const name = parseFoodName(food?.name);
  const rawNutrients = Array.isArray(food?.allNutrients) ? food.allNutrients : [];
  const totalFat = rawNutrients.find((item) => String(item?.nutrientId) === "2")?.value;
  const abnormalFatComponents = rawNutrients.filter((item) => ["90", "91", "118", "119"].includes(String(item?.nutrientId)) && Number(item?.value) > 100).length;
  const nutrients = rawNutrients.map((raw) => {
    const label = normalizeNutrientLabel(raw?.label);
    const item = { ...raw, ...label };
    const analysis = analyzeNutrient(item, { totalFat, multipleFatComponentsSameScale: abnormalFatComponents >= 2 });
    const key = String(raw?.nutrientId ?? "UNKNOWN");
    if (!nutrientDictionary.has(key)) nutrientDictionary.set(key, { nutrientId: key, rawLabels: new Set(), normalizedLabels: new Set(), units: new Set(), occurrences: 0, missing: 0, zero: 0 });
    const dictionary = nutrientDictionary.get(key);
    dictionary.rawLabels.add(label.rawLabel); dictionary.normalizedLabels.add(label.normalizedLabel); dictionary.units.add(analysis.unit); dictionary.occurrences++;
    if (analysis.flags.includes("MISSING")) dictionary.missing++;
    if (analysis.flags.includes("REPORTED_ZERO")) dictionary.zero++;
    if (!nutrientStats.has(key)) nutrientStats.set(key, { nutrientId: key, label: label.normalizedLabel, unit: analysis.unit, values: [], missing: 0, zero: 0, flags: new Map(flags.map((flag) => [flag, 0])) });
    const stats = nutrientStats.get(key);
    if (analysis.rawValue === null) stats.missing++; else if (typeof analysis.rawValue === "number" && Number.isFinite(analysis.rawValue)) stats.values.push(analysis.rawValue);
    if (analysis.flags.includes("REPORTED_ZERO")) stats.zero++;
    analysis.flags.forEach((flag) => { if (stats.flags.has(flag)) count(stats.flags, flag); count(flagCounts, flag); });
    return { nutrientId: key, rawLabel: label.rawLabel, normalizedLabel: label.normalizedLabel, ...analysis };
  });
  const normalizedMeasures = (Array.isArray(food?.commonMeasures) ? food.commonMeasures : []).map(normalizeMeasure).map(analyzeMeasure);
  const measuresByName = new Map();
  for (const measure of normalizedMeasures) {
    if (!measure.normalizedMeasure) continue;
    if (!measuresByName.has(measure.normalizedMeasure)) measuresByName.set(measure.normalizedMeasure, []);
    measuresByName.get(measure.normalizedMeasure).push(measure);
  }
  for (const equivalents of measuresByName.values()) {
    if (equivalents.length < 2) continue;
    const grams = new Set(equivalents.map((item) => item.grams).filter(Number.isFinite));
    const flag = grams.size > 1 ? "MEASURE_GRAMS_CONFLICT" : "MEASURE_DUPLICATE";
    equivalents.forEach((item) => item.flags.push(flag));
  }
  measures.push(...normalizedMeasures);
  const foodClass = classifyFood(nutrients, normalizedMeasures);
  count(classificationCounts, foodClass);
  if (!sourceStats.has(source.sourceFamily)) sourceStats.set(source.sourceFamily, { foods: 0, nutrientValues: 0, missing: 0, physicallySuspicious: 0, componentGtTotal: 0, likelyDecimalLoss: 0, possibleDecimalLoss: 0, measureIssues: 0, quarantineFoods: 0 });
  const sourceCount = sourceStats.get(source.sourceFamily); sourceCount.foods++; sourceCount.nutrientValues += nutrients.length;
  for (const nutrient of nutrients) for (const flag of nutrient.flags) {
    if (flag === "MISSING") sourceCount.missing++;
    if (flag === "PHYSICALLY_SUSPICIOUS") sourceCount.physicallySuspicious++;
    if (flag === "COMPONENT_GT_TOTAL") sourceCount.componentGtTotal++;
    if (flag === "LIKELY_DECIMAL_LOSS") sourceCount.likelyDecimalLoss++;
    if (flag === "POSSIBLE_DECIMAL_LOSS") sourceCount.possibleDecimalLoss++;
  }
  sourceCount.measureIssues += normalizedMeasures.filter((measure) => measure.flags.some((flag) => flag.startsWith("INVALID") || flag.startsWith("SUSPICIOUS") || flag.startsWith("MEASURE_"))).length;
  if (foodClass === "QUARANTINE") sourceCount.quarantineFoods++;
  if (!names.has(name.searchKey)) names.set(name.searchKey, []);
  names.get(name.searchKey).push({ externalId: food?.externalId ?? null, name: name.originalName, source: source.rawSourceLabel, preparation: name.preparation });
  const anomalies = nutrients.filter((item) => !item.flags.every((flag) => ["OK", "MISSING", "REPORTED_ZERO"].includes(flag)));
  if (anomalies.length && sampleAnomalies.length < 500) sampleAnomalies.push({ foodExternalId: food?.externalId ?? null, foodName: name.originalName, source, foodClassification: foodClass, nutrients: anomalies });
}

const dictionary = [...nutrientDictionary.values()].map((item) => ({ ...item, rawLabels: [...item.rawLabels].sort(), normalizedLabels: [...item.normalizedLabels].sort(), units: [...item.units].sort(), unitConflict: item.units.size > 1, labelConflict: item.normalizedLabels.size > 1 })).sort((a, b) => a.nutrientId.localeCompare(b.nutrientId));
for (const item of dictionary.filter((item) => item.unitConflict)) count(flagCounts, "UNIT_CONFLICT");
const compactNutrientStats = [...nutrientStats.values()].map((item) => ({ nutrientId: item.nutrientId, label: item.label, unit: item.unit, count: item.values.length + item.missing, missing: item.missing, zero: item.zero, min: item.values.length ? Math.min(...item.values) : null, median: quantile(item.values, .5), p95: quantile(item.values, .95), p99: quantile(item.values, .99), max: item.values.length ? Math.max(...item.values) : null, classificationCounts: sortedObject(item.flags) })).sort((a, b) => a.nutrientId.localeCompare(b.nutrientId));
const measureFlagCount = (flag) => measures.filter((item) => item.flags.includes(flag)).length;
const validMeasures = measures.filter((item) => !item.flags.some((flag) => flag.startsWith("INVALID") || flag.startsWith("SUSPICIOUS") || flag.startsWith("MEASURE_"))).length;
const duplicateGroups = [...names.entries()].filter(([, items]) => items.length > 1).map(([searchKey, items]) => ({ searchKey, count: items.length, classification: new Set(items.map((item) => item.source)).size > 1 ? "SAME_FOOD_DIFFERENT_SOURCE" : "EXACT_DUPLICATE_CANDIDATE", samples: items.slice(0, 10) }));
const egg = sampleAnomalies.find((item) => item.foodName === "Ovo, galinha, inteiro, cozido, mexido") ?? null;
const result = {
  metadata: { pipeline: "F1 normalization and anomaly analysis", input: resolve(input), captureSchemaVersion: capture.schemaVersion ?? null, captureDeclaredTotal: capture.total ?? null, deterministic: true, d1Writes: 0, migrationsCreated: 0, migrationsExecuted: 0, parserDiagnostic: "No capture-generation script was identified under scripts by the F1 static scan; F1 makes no root-cause claim about the exporter." },
  summary: { totalFoods: capture.foods.length, totalNutrientValues: [...nutrientStats.values()].reduce((total, item) => total + item.values.length + item.missing, 0), totalMeasures: measures.length, validMeasures, missingMeasureGrams: measureFlagCount("MISSING_GRAMS"), invalidMeasures: measureFlagCount("INVALID_GRAMS") + measureFlagCount("INVALID_EDIBLE_PORTION"), suspiciousMeasures: measureFlagCount("SUSPICIOUS_EDIBLE_PORTION") + measureFlagCount("MEASURE_GRAMS_CONFLICT") + measureFlagCount("MEASURE_DUPLICATE") },
  classificationCounts: sortedObject(classificationCounts), anomalyCounts: sortedObject(flagCounts), sourceStats: sortedObject(sourceStats), nutrientDictionary: dictionary, nutrientStats: compactNutrientStats, measureStats: { total: measures.length, valid: validMeasures, missingGrams: measureFlagCount("MISSING_GRAMS"), invalid: measureFlagCount("INVALID_GRAMS") + measureFlagCount("INVALID_EDIBLE_PORTION"), suspicious: measureFlagCount("SUSPICIOUS_EDIBLE_PORTION"), grams: { p95: quantile(measures.filter((item) => Number.isFinite(item.grams) && item.grams > 0).map((item) => item.grams), .95), p99: quantile(measures.filter((item) => Number.isFinite(item.grams) && item.grams > 0).map((item) => item.grams), .99), max: Math.max(...measures.filter((item) => Number.isFinite(item.grams) && item.grams > 0).map((item) => item.grams), 0) } },
  duplicateStats: { groups: duplicateGroups.length, samples: duplicateGroups.slice(0, 200) },
  decimalLossStats: { likely: flagCounts.get("LIKELY_DECIMAL_LOSS"), possible: flagCounts.get("POSSIBLE_DECIMAL_LOSS"), policy: "Candidates divide raw values by 10, 100, and 1000; raw values are never rewritten. Likely requires physical range, total-fat consistency, and multiple fat components with the same scale signal." },
  quarantineSummary: { foods: classificationCounts.get("QUARANTINE"), policy: "F1-only classification; no DB persistence or import." }, sampleAnomalies, eggCase: egg,
  limitations: ["No source reconciliation, canonical matching, data correction, database writes, or migration is performed.", "Source labels not recognized as public databases remain UNKNOWN; F1 does not infer brands or manufacturers."]
};
mkdirSync("reports", { recursive: true });
writeFileSync("reports/food-database-nutrium-normalization-analysis.json", `${JSON.stringify(result, null, 2)}\n`);
writeFileSync("reports/food-database-nutrium-normalization-analysis.md", `# Nutrium Capture F1: Normalization and Anomaly Analysis\n\n## 1. Executive summary\n\nOffline, read-only analysis: ${result.summary.totalFoods} foods, ${result.summary.totalNutrientValues} nutrient values, and ${result.summary.totalMeasures} measures. D1_WRITES = 0; MIGRATIONS_CREATED = 0; MIGRATIONS_EXECUTED = 0.\n\n## 2. F0 baseline\n\nF0 remains a separate conservative audit. F1 neither edits F0 nor imports its findings.\n\n## 3. F1 architecture\n\nText/source/label/measure normalization is separated from unit-sensitive anomaly detection and food-level classification.\n\n## 4. Text normalization\n\nRaw names and labels are retained. Normalized text uses NFKC, trimmed/collapsed whitespace, and an accent-free search key. Only explicit UI icon prefixes are removed.\n\n## 5. Source normalization\n\nUSDA, TACO, IBGE, and TCNA/IBGE are recognized public datasets. Other labels remain UNKNOWN; F1 does not infer brands or manufacturers.\n\n## 6. Nutrient dictionary\n\nThe JSON artifact contains raw/normalized labels, units, occurrence, missing, zero, label conflicts, and unit conflicts by nutrient ID.\n\n## 7. Unit analysis\n\nThe >100 physical rule is applied only to gram-based macro/fat semantics, never to mg, ug, or kcal values.\n\n## 8. Missing vs zero\n\nMissing: ${result.anomalyCounts.MISSING}; reported zero: ${result.anomalyCounts.REPORTED_ZERO}. Null is not converted to zero.\n\n## 9. Physical sanity\n\nPhysically suspicious gram-macro values: ${result.anomalyCounts.PHYSICALLY_SUSPICIOUS}. Negative values: ${result.anomalyCounts.INVALID_NEGATIVE}.\n\n## 10. Fat component analysis\n\nComponents above total fat: ${result.anomalyCounts.COMPONENT_GT_TOTAL}. Component totals are a signal only and are not required to sum exactly.\n\n## 11. Decimal-loss detector\n\nCandidates divide raw values by 10, 100, and 1000. Likely requires physical plausibility, total-fat compatibility, and multiple same-scale fat components. Raw values are never rewritten.\n\n## 12. Source distribution\n\n${JSON.stringify(result.sourceStats, null, 2)}\n\n## 13. Nutrient distribution\n\nPer-nutrient count, missing, zero, min, median, p95, p99, max, and anomaly counts are in the JSON report. Percentiles are signals, not invalidation rules.\n\n## 14. Common measures\n\nValid measures: ${result.summary.validMeasures}; missing grams: ${result.summary.missingMeasureGrams}; invalid: ${result.summary.invalidMeasures}; suspicious/conflicting: ${result.summary.suspiciousMeasures}.\n\n## 15. Duplicate groups\n\n${result.duplicateStats.groups} normalized-name duplicate groups were detected without merging any records.\n\n## 16. Quarantine\n\n${result.quarantineSummary.foods} foods are F1-only quarantine candidates. This state is not persisted.\n\n## 17. Egg case\n\n${egg ? "The requested egg record was found. eggCase in the JSON retains its raw fat values, classifications, and decimal candidates." : "The requested egg record was not found."}\n\n## 18. Tests\n\nUnit tests cover null, zero, micronutrient units, physical macro limits, fat components, decimal candidates, labels, sources, and measures.\n\n## 19. Limitations\n\nNo source reconciliation, canonical matching, correction, database write, migration, or import occurs. ${result.metadata.parserDiagnostic}\n\n## 20. F2 readiness\n\nThis report supports future reconciliation review only after all gates pass; it does not authorize import.\n`);
console.log(`F1 normalization complete: ${result.summary.totalFoods} foods, ${result.classificationCounts.QUARANTINE} quarantine. No DB writes.`);
console.log(`FOOD_F1_TOTAL_FOODS: ${result.summary.totalFoods}`);
console.log(`FOOD_F1_TOTAL_NUTRIENT_VALUES: ${result.summary.totalNutrientValues}`);
console.log(`FOOD_F1_MISSING_VALUES: ${result.anomalyCounts.MISSING}`);
console.log(`FOOD_F1_REPORTED_ZERO_VALUES: ${result.anomalyCounts.REPORTED_ZERO}`);
console.log(`FOOD_F1_PHYSICALLY_SUSPICIOUS_VALUES: ${result.anomalyCounts.PHYSICALLY_SUSPICIOUS}`);
console.log(`FOOD_F1_D1_WRITES: 0`);
