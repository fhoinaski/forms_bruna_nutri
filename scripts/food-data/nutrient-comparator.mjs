const CAPTURE_TO_CANONICAL = {
  "1": "PROTEIN", "2": "TOTAL_FAT", "3": "CARBOHYDRATE", "5": "ENERGY_KCAL", "20": "FIBER", "21": "CALCIUM", "22": "IRON", "23": "MAGNESIUM", "24": "PHOSPHORUS", "25": "POTASSIUM", "26": "SODIUM", "27": "ZINC", "28": "COPPER", "30": "MANGANESE", "31": "SELENIUM", "34": "VITAMIN_A", "37": "VITAMIN_E", "41": "VITAMIN_D", "52": "VITAMIN_C", "53": "THIAMIN", "54": "RIBOFLAVIN", "55": "NIACIN", "56": "PANTOTHENIC_ACID", "57": "VITAMIN_B6", "58": "FOLATE", "59": "VITAMIN_B12", "63": "VITAMIN_K", "89": "CHOLESTEROL", "90": "TRANS_FAT", "91": "SATURATED_FAT", "118": "MONOUNSATURATED_FAT", "119": "POLYUNSATURATED_FAT",
};

export function compareNutrients(captureNutrients, canonicalNutrients) {
  const canonicalByCode = new Map(canonicalNutrients.map((item) => [item.nutrientCode, item]));
  const comparisons = [];
  for (const nutrient of captureNutrients) {
    const nutrientCode = CAPTURE_TO_CANONICAL[nutrient.nutrientId] ?? null;
    const canonical = nutrientCode ? canonicalByCode.get(nutrientCode) : null;
    if (!canonical || nutrient.rawValue === null || canonical.value === null || nutrient.unit !== canonical.unit) {
      comparisons.push({ nutrientId: nutrient.nutrientId, nutrientCode, rawValue: nutrient.rawValue, canonicalValue: canonical?.value ?? null, unit: nutrient.unit, status: canonical ? "NOT_COMPARABLE" : "NO_CANONICAL_VALUE" });
      continue;
    }
    const absoluteDifference = Math.abs(nutrient.rawValue - canonical.value);
    const relativeDifference = Math.abs(canonical.value) < 0.000001 ? null : absoluteDifference / Math.abs(canonical.value);
    const decimalCandidates = nutrient.candidateCorrections ?? [];
    const compatible = decimalCandidates.filter((candidate) => Math.abs(candidate.candidateValue - canonical.value) <= Math.max(0.05, Math.abs(canonical.value) * 0.1));
    let decimalStatus = "DECIMAL_NOT_CONFIRMED";
    if (compatible.length === 1) decimalStatus = `DECIMAL_CONFIRMED_X${compatible[0].scaleFactor}`;
    else if (compatible.length > 1) decimalStatus = "DECIMAL_MULTIPLE_POSSIBLE";
    comparisons.push({ nutrientId: nutrient.nutrientId, nutrientCode, rawValue: nutrient.rawValue, canonicalValue: canonical.value, unit: nutrient.unit, absoluteDifference, relativeDifference, decimalStatus, compatibleCandidates: compatible, status: "COMPARABLE" });
  }
  return comparisons;
}

export function nutritionStatus(comparisons, hasCandidate) {
  if (!hasCandidate) return "NO_CANONICAL_REFERENCE";
  if (comparisons.some((item) => item.decimalStatus?.startsWith("DECIMAL_CONFIRMED"))) return "CAPTURE_CORRUPTED_CANONICAL_AVAILABLE";
  return "CANONICAL_AVAILABLE_UNCONFIRMED";
}
