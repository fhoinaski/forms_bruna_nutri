const MACRO_LABELS = new Set(["gordura", "carboidratos", "proteina", "fibra alimentar", "gorduras saturadas", "gorduras monoinsaturadas", "gorduras poliinsaturadas", "gorduras trans"]);
const FAT_COMPONENT_IDS = new Set(["90", "91", "118", "119"]);

export function nutrientSemantic(nutrient) {
  const label = String(nutrient.normalizedLabel ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (String(nutrient.nutrientId) === "2" || label === "gordura") return "TOTAL_FAT";
  if (FAT_COMPONENT_IDS.has(String(nutrient.nutrientId))) return "FAT_COMPONENT";
  if (MACRO_LABELS.has(label)) return "MACRO_MASS";
  return "OTHER";
}

function decimalCandidates(value, totalFat, flags) {
  if (!Number.isFinite(value) || value <= 100) return [];
  return [10, 100, 1000].map((scaleFactor) => {
    const candidateValue = value / scaleFactor;
    const evidence = ["ORIGINAL_IMPOSSIBLE_FOR_UNIT"];
    if (candidateValue <= 100) evidence.push("CANDIDATE_WITHIN_PHYSICAL_RANGE");
    if (Number.isFinite(totalFat) && candidateValue <= totalFat + 0.05) evidence.push("CANDIDATE_LE_TOTAL_FAT");
    if (flags.multipleFatComponentsSameScale) evidence.push("MULTIPLE_NUTRIENTS_SHARE_SCALE_PATTERN");
    return { candidateValue, scaleFactor, evidence, score: evidence.length };
  });
}

export function analyzeNutrient(nutrient, context = {}) {
  const rawValue = nutrient?.value ?? null;
  const unit = String(nutrient?.unit ?? "").toLowerCase();
  const semantic = nutrientSemantic(nutrient ?? {});
  const flags = [];
  if (rawValue === null) flags.push("MISSING");
  else if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) flags.push("INVALID_NON_FINITE");
  else if (rawValue < 0) flags.push("INVALID_NEGATIVE");
  else if (rawValue === 0) flags.push("REPORTED_ZERO");
  else if ((semantic === "MACRO_MASS" || semantic === "TOTAL_FAT" || semantic === "FAT_COMPONENT") && unit === "g" && rawValue > 100) flags.push("PHYSICALLY_SUSPICIOUS");

  if (semantic === "FAT_COMPONENT" && Number.isFinite(rawValue) && Number.isFinite(context.totalFat) && rawValue > context.totalFat + 0.05) flags.push("COMPONENT_GT_TOTAL");
  const candidateCorrections = (semantic === "MACRO_MASS" || semantic === "TOTAL_FAT" || semantic === "FAT_COMPONENT") && unit === "g"
    ? decimalCandidates(rawValue, context.totalFat, context)
    : [];
  const strongestCandidate = candidateCorrections.reduce((best, item) => !best || item.score > best.score ? item : best, null);
  if (strongestCandidate?.score >= 4) flags.push("LIKELY_DECIMAL_LOSS");
  else if (strongestCandidate?.score >= 3) flags.push("POSSIBLE_DECIMAL_LOSS");
  if (!flags.length) flags.push("OK");
  return { rawValue, normalizedValueCandidate: rawValue, unit, semantic, flags, candidateCorrections };
}

export function analyzeMeasure(measure) {
  const flags = [];
  if (measure.grams === null) flags.push("MISSING_GRAMS");
  else if (typeof measure.grams !== "number" || !Number.isFinite(measure.grams) || measure.grams <= 0) flags.push("INVALID_GRAMS");
  if (measure.ediblePortionPercentage === null) flags.push("MISSING_EDIBLE_PORTION");
  else if (typeof measure.ediblePortionPercentage !== "number" || !Number.isFinite(measure.ediblePortionPercentage) || measure.ediblePortionPercentage < 0) flags.push("INVALID_EDIBLE_PORTION");
  else if (measure.ediblePortionPercentage > 100) flags.push("SUSPICIOUS_EDIBLE_PORTION");
  if (!flags.length) flags.push("VALID");
  return { ...measure, flags };
}

export function classifyFood(nutrients, measures) {
  const flags = nutrients.flatMap((item) => item.flags);
  const measureFlags = measures.flatMap((item) => item.flags);
  if (flags.some((flag) => ["INVALID_NEGATIVE", "INVALID_NON_FINITE", "PHYSICALLY_SUSPICIOUS"].includes(flag))) return "QUARANTINE";
  if (flags.some((flag) => ["COMPONENT_GT_TOTAL", "LIKELY_DECIMAL_LOSS", "POSSIBLE_DECIMAL_LOSS", "UNIT_CONFLICT"].includes(flag)) || measureFlags.some((flag) => flag.startsWith("INVALID") || flag.startsWith("SUSPICIOUS") || flag.startsWith("MEASURE_"))) return "REVIEW_REQUIRED";
  if (flags.includes("MISSING") || measureFlags.includes("MISSING_GRAMS")) return "INCOMPLETE";
  return "CLEAN";
}

export function quantile(values, percentile) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(percentile * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}
