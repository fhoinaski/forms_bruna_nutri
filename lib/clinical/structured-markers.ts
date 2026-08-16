export const CLINICAL_MARKER_TYPES = [
  "ALLERGY",
  "INTOLERANCE",
  "DIETARY_RESTRICTION",
  "FOOD_AVOIDANCE",
  "CLINICAL_FLAG",
  "PREGNANCY",
  "BARIATRIC",
] as const;

export const CLINICAL_MARKER_STATUSES = ["ACTIVE", "SUSPECTED", "RESOLVED"] as const;
export const CLINICAL_MARKER_SEVERITIES = ["unknown", "mild", "moderate", "severe"] as const;
export const CLINICAL_MARKER_SOURCES = ["manual", "ai_suggestion_confirmed", "import", "system"] as const;

export type ClinicalMarkerType = typeof CLINICAL_MARKER_TYPES[number];
export type ClinicalMarkerStatus = typeof CLINICAL_MARKER_STATUSES[number];
export type ClinicalMarkerSeverity = typeof CLINICAL_MARKER_SEVERITIES[number];
export type ClinicalMarkerSource = typeof CLINICAL_MARKER_SOURCES[number];

export const FOOD_RESTRICTION_CODES = [
  "MILK",
  "LACTOSE",
  "EGG",
  "PEANUT",
  "TREE_NUTS",
  "SOY",
  "WHEAT",
  "GLUTEN",
  "FISH",
  "SHELLFISH",
] as const;

export const CLINICAL_FLAG_CODES = [
  "PREGNANCY",
  "BREASTFEEDING",
  "BARIATRIC_SURGERY",
  "RENAL",
  "ONCOLOGIC",
] as const;

export type FoodRestrictionCode = typeof FOOD_RESTRICTION_CODES[number];
export type ClinicalFlagCode = typeof CLINICAL_FLAG_CODES[number];
export type ClinicalMarkerCode = FoodRestrictionCode | ClinicalFlagCode;

export const CLINICAL_MARKER_CODE_LABELS: Record<ClinicalMarkerCode, string> = {
  MILK: "Leite",
  LACTOSE: "Lactose",
  EGG: "Ovo",
  PEANUT: "Amendoim",
  TREE_NUTS: "Castanhas/nozes",
  SOY: "Soja",
  WHEAT: "Trigo",
  GLUTEN: "Gluten",
  FISH: "Peixe",
  SHELLFISH: "Crustaceos",
  PREGNANCY: "Gestacao",
  BREASTFEEDING: "Amamentacao",
  BARIATRIC_SURGERY: "Cirurgia bariatrica",
  RENAL: "Condicao renal",
  ONCOLOGIC: "Condicao oncologica",
};

const CODES = new Set<string>([...FOOD_RESTRICTION_CODES, ...CLINICAL_FLAG_CODES]);

export function normalizeClinicalMarkerCode(value: string): ClinicalMarkerCode | null {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return CODES.has(normalized) ? normalized as ClinicalMarkerCode : null;
}
