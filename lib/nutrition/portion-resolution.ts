import type { FoodReference } from "@/lib/nutrition/food-catalog";

export type PortionUnitKind =
  | "teaspoon"
  | "dessert_spoon"
  | "tablespoon"
  | "serving_spoon"
  | "ladle"
  | "skimmer"
  | "tongs"
  | "cup"
  | "glass"
  | "slice"
  | "unit"
  | "small_unit"
  | "medium_unit"
  | "large_unit"
  | "fillet"
  | "steak_cut"
  | "piece"
  | "leaf"
  | "sprig"
  | "portion"
  | "grams"
  | "milliliters"
  | "other";

export interface UnifiedFoodPortion {
  id: string;
  foodRef: FoodReference;
  label: string;
  quantity: number;
  unit: string;
  unitKind: PortionUnitKind;
  gramWeight?: number | null;
  mlWeight?: number | null;
  source: string;
  provenance?: string | null;
  confidence?: "high" | "medium" | "low";
  isDefault?: boolean;
}

export type PortionGramResolution =
  | {
      ok: true;
      grams: number;
      quantity: number;
      portion: UnifiedFoodPortion;
      source: string;
      provenance?: string | null;
    }
  | {
      ok: false;
      reason: "INVALID_QUANTITY" | "PORTION_NOT_FOUND" | "WRONG_FOOD" | "MISSING_GRAM_WEIGHT" | "INVALID_GRAM_WEIGHT";
    };

const UNIT_ALIASES: Array<{ kind: PortionUnitKind; patterns: string[] }> = [
  { kind: "teaspoon", patterns: ["colher de cha", "colher cha", "c cha", "c. cha", "cc"] },
  { kind: "dessert_spoon", patterns: ["colher de sobremesa", "colher sobremesa", "c sobremesa", "c. sobremesa"] },
  { kind: "tablespoon", patterns: ["colher de sopa", "colher sopa", "c sopa", "c. sopa", "cs"] },
  { kind: "serving_spoon", patterns: ["colher de servir", "colher servir"] },
  { kind: "ladle", patterns: ["concha", "concha media", "concha pequena", "concha grande"] },
  { kind: "skimmer", patterns: ["escumadeira"] },
  { kind: "tongs", patterns: ["pegador"] },
  { kind: "cup", patterns: ["xicara", "xicara de cha", "xícara"] },
  { kind: "glass", patterns: ["copo", "copo americano", "copo requeijao"] },
  { kind: "slice", patterns: ["fatia"] },
  { kind: "small_unit", patterns: ["unidade pequena", "un pequena", "unid pequena"] },
  { kind: "medium_unit", patterns: ["unidade media", "un media", "unid media"] },
  { kind: "large_unit", patterns: ["unidade grande", "un grande", "unid grande"] },
  { kind: "unit", patterns: ["unidade", "un", "unid"] },
  { kind: "fillet", patterns: ["file", "filé"] },
  { kind: "steak_cut", patterns: ["posta"] },
  { kind: "piece", patterns: ["pedaco", "pedaço"] },
  { kind: "leaf", patterns: ["folha"] },
  { kind: "sprig", patterns: ["ramo"] },
  { kind: "portion", patterns: ["porcao", "porção"] },
  { kind: "grams", patterns: ["g", "grama", "gramas"] },
  { kind: "milliliters", patterns: ["ml", "mililitro", "mililitros"] },
];

export function normalizePortionUnit(label: string): PortionUnitKind {
  const normalized = label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  for (const entry of UNIT_ALIASES) {
    if (entry.patterns.some((pattern) => normalized.includes(pattern.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()))) {
      return entry.kind;
    }
  }
  return "other";
}

export function sameFoodReference(a: FoodReference, b: FoodReference): boolean {
  return a.source === b.source && a.sourceId === b.sourceId;
}

export function resolvePortionToGrams(input: {
  foodRef: FoodReference;
  portionId: string;
  quantity: string | number | null | undefined;
  portions: UnifiedFoodPortion[];
}): PortionGramResolution {
  const quantity = typeof input.quantity === "number"
    ? input.quantity
    : Number(String(input.quantity ?? "").replace(",", ".").match(/[\d.]+/)?.[0] ?? "");
  if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, reason: "INVALID_QUANTITY" };

  const portion = input.portions.find((item) => item.id === input.portionId);
  if (!portion) return { ok: false, reason: "PORTION_NOT_FOUND" };
  if (!sameFoodReference(input.foodRef, portion.foodRef)) return { ok: false, reason: "WRONG_FOOD" };
  if (portion.gramWeight === null || portion.gramWeight === undefined) return { ok: false, reason: "MISSING_GRAM_WEIGHT" };
  if (!Number.isFinite(portion.gramWeight) || portion.gramWeight <= 0) return { ok: false, reason: "INVALID_GRAM_WEIGHT" };

  return {
    ok: true,
    grams: quantity * portion.gramWeight,
    quantity,
    portion,
    source: portion.source,
    provenance: portion.provenance ?? null,
  };
}
