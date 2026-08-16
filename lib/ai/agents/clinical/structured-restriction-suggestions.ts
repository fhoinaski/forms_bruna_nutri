import { normalizeClinicalMarkerCode, type ClinicalMarkerCode, type ClinicalMarkerType, CLINICAL_MARKER_CODE_LABELS } from "@/lib/clinical/structured-markers";
import { normalize } from "@/lib/nutrition/normalize";

export interface StructuredRestrictionSuggestion {
  type: ClinicalMarkerType;
  normalizedCode: ClinicalMarkerCode;
  label: string;
  status: "SUSPECTED";
  severity: "unknown";
  evidenceText: string;
  confidence: "low" | "medium";
}

const CODE_PATTERNS: Array<{ code: ClinicalMarkerCode; patterns: string[] }> = [
  { code: "MILK", patterns: ["leite", "iogurte", "queijo", "laticinio", "lacteo"] },
  { code: "LACTOSE", patterns: ["lactose"] },
  { code: "EGG", patterns: ["ovo"] },
  { code: "PEANUT", patterns: ["amendoim"] },
  { code: "TREE_NUTS", patterns: ["castanha", "nozes", "amendoa", "avela"] },
  { code: "SOY", patterns: ["soja"] },
  { code: "WHEAT", patterns: ["trigo"] },
  { code: "GLUTEN", patterns: ["gluten"] },
  { code: "FISH", patterns: ["peixe", "atum", "sardinha", "salmao"] },
  { code: "SHELLFISH", patterns: ["camarao", "crustaceo", "siri", "caranguejo"] },
];

function inferType(text: string): ClinicalMarkerType {
  if (text.includes("alerg")) return "ALLERGY";
  if (text.includes("intoler") || text.includes("desconfort") || text.includes("dor") || text.includes("diarre")) return "INTOLERANCE";
  if (text.includes("sem ") || text.includes("restri")) return "DIETARY_RESTRICTION";
  return "FOOD_AVOIDANCE";
}

export function suggestStructuredRestrictionsFromText(text: string): StructuredRestrictionSuggestion[] {
  const normalized = normalize(text);
  if (!normalized) return [];
  const suggestions = new Map<string, StructuredRestrictionSuggestion>();
  for (const rule of CODE_PATTERNS) {
    if (!rule.patterns.some((pattern) => normalized.includes(normalize(pattern)))) continue;
    const code = normalizeClinicalMarkerCode(rule.code);
    if (!code) continue;
    const type = inferType(normalized);
    const key = `${type}:${code}`;
    suggestions.set(key, {
      type,
      normalizedCode: code,
      label: CLINICAL_MARKER_CODE_LABELS[code],
      status: "SUSPECTED",
      severity: "unknown",
      evidenceText: text.slice(0, 500),
      confidence: normalized.includes("alerg") || normalized.includes("intoler") ? "medium" : "low",
    });
  }
  return Array.from(suggestions.values());
}
