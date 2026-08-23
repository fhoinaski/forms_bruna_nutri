import { normalizeMealContext, type MealContext } from "@/lib/nutrition/food-exchange-hierarchy";
import type { PersistedMealFoodSource } from "@/lib/nutrition/food-catalog";

export type TemplateClinicalRole =
  | "BREAKFAST_CARB"
  | "FRUIT"
  | "MAIN_STARCH"
  | "LEGUME"
  | "MAIN_PROTEIN"
  | "VEGETABLE"
  | "DAIRY"
  | "FAT"
  | "OTHER";

export type TemplateFoodIdentity = {
  food_source: PersistedMealFoodSource;
  food_ref_id: string;
  canonical_food_id: string | null;
};

export type SystemTemplateFoodContract = TemplateFoodIdentity & {
  food_group: string;
  food_subgroup: string;
  clinical_role: TemplateClinicalRole;
  exchange_list_id: string | null;
  exchange_eligible: boolean;
};

export const VALID_TEMPLATE_UNITS = new Set(["g", "kg", "ml", "l", "grama", "gramas"]);

export const CLINICAL_ROLE_LABELS: Record<TemplateClinicalRole, string> = {
  BREAKFAST_CARB: "Carboidrato",
  FRUIT: "Fruta",
  MAIN_STARCH: "Carboidrato",
  LEGUME: "Leguminosa",
  MAIN_PROTEIN: "Proteína",
  VEGETABLE: "Vegetal",
  DAIRY: "Laticínio",
  FAT: "Gordura",
  OTHER: "Outro",
};

export function mealContextForTemplateMeal(name: string): MealContext {
  return normalizeMealContext(name);
}

export function isValidTemplateQuantity(quantity: string | null | undefined): boolean {
  const parsed = Number(String(quantity ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0;
}

export function isValidTemplateUnit(unit: string | null | undefined): boolean {
  return VALID_TEMPLATE_UNITS.has(String(unit ?? "").trim().toLowerCase());
}

export const SYSTEM_TEMPLATE_FOOD_CONTRACTS: Record<string, SystemTemplateFoodContract> = {
  "Pao de forma integral": {
    food_source: "TACO",
    food_ref_id: "52",
    canonical_food_id: null,
    food_group: "CARBOHYDRATE",
    food_subgroup: "GRAIN",
    clinical_role: "BREAKFAST_CARB",
    exchange_list_id: "exl-system-breakfast-carbs",
    exchange_eligible: true,
  },
  "Ovo de galinha inteiro cozido": {
    food_source: "TACO",
    food_ref_id: "488",
    canonical_food_id: null,
    food_group: "PROTEIN",
    food_subgroup: "EGG",
    clinical_role: "MAIN_PROTEIN",
    exchange_list_id: null,
    exchange_eligible: false,
  },
  "Banana prata": {
    food_source: "TACO",
    food_ref_id: "182",
    canonical_food_id: null,
    food_group: "FRUIT",
    food_subgroup: "GENERIC_FRUIT",
    clinical_role: "FRUIT",
    exchange_list_id: "exl-system-fruit-portions",
    exchange_eligible: true,
  },
  "Arroz integral cozido": {
    food_source: "TACO",
    food_ref_id: "1",
    canonical_food_id: null,
    food_group: "CARBOHYDRATE",
    food_subgroup: "GRAIN",
    clinical_role: "MAIN_STARCH",
    exchange_list_id: "exl-system-main-meal-starches",
    exchange_eligible: true,
  },
  "Feijao carioca cozido": {
    food_source: "TACO",
    food_ref_id: "561",
    canonical_food_id: null,
    food_group: "PROTEIN",
    food_subgroup: "LEGUME",
    clinical_role: "LEGUME",
    exchange_list_id: "exl-system-legume-options",
    exchange_eligible: true,
  },
  "Peito de frango grelhado": {
    food_source: "TACO",
    food_ref_id: "410",
    canonical_food_id: null,
    food_group: "PROTEIN",
    food_subgroup: "POULTRY",
    clinical_role: "MAIN_PROTEIN",
    exchange_list_id: "exl-system-lean-main-proteins",
    exchange_eligible: true,
  },
  "Brocolis cozido": {
    food_source: "TACO",
    food_ref_id: "100",
    canonical_food_id: null,
    food_group: "VEGETABLE",
    food_subgroup: "GENERIC_VEGETABLE",
    clinical_role: "VEGETABLE",
    exchange_list_id: "exl-system-vegetable-sides",
    exchange_eligible: true,
  },
  "Batata doce cozida": {
    food_source: "TACO",
    food_ref_id: "88",
    canonical_food_id: null,
    food_group: "CARBOHYDRATE",
    food_subgroup: "TUBER_ROOT",
    clinical_role: "MAIN_STARCH",
    exchange_list_id: "exl-system-main-meal-starches",
    exchange_eligible: true,
  },
  "Pintado grelhado": {
    food_source: "TACO",
    food_ref_id: "313",
    canonical_food_id: null,
    food_group: "PROTEIN",
    food_subgroup: "FISH",
    clinical_role: "MAIN_PROTEIN",
    exchange_list_id: "exl-system-lean-main-proteins",
    exchange_eligible: true,
  },
  "Abobrinha cozida": {
    food_source: "TACO",
    food_ref_id: "70",
    canonical_food_id: null,
    food_group: "VEGETABLE",
    food_subgroup: "GENERIC_VEGETABLE",
    clinical_role: "VEGETABLE",
    exchange_list_id: "exl-system-vegetable-sides",
    exchange_eligible: true,
  },
};
