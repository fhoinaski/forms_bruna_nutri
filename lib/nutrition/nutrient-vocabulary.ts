export type NutrientUnit = "g" | "mg" | "mcg" | "kcal" | "kJ";

export type NutrientCode =
  | "ENERGY_KCAL"
  | "ENERGY_KJ"
  | "PROTEIN"
  | "CARBOHYDRATE"
  | "SUGARS"
  | "TOTAL_FAT"
  | "SATURATED_FAT"
  | "MONOUNSATURATED_FAT"
  | "POLYUNSATURATED_FAT"
  | "TRANS_FAT"
  | "FIBER"
  | "SODIUM"
  | "CALCIUM"
  | "IRON"
  | "MAGNESIUM"
  | "PHOSPHORUS"
  | "POTASSIUM"
  | "ZINC"
  | "COPPER"
  | "MANGANESE"
  | "SELENIUM"
  | "VITAMIN_A"
  | "VITAMIN_C"
  | "VITAMIN_D"
  | "VITAMIN_E"
  | "VITAMIN_K"
  | "THIAMIN"
  | "RIBOFLAVIN"
  | "NIACIN"
  | "PANTOTHENIC_ACID"
  | "VITAMIN_B6"
  | "FOLATE"
  | "VITAMIN_B12"
  | "CHOLESTEROL";

export interface NutrientDefinition {
  code: NutrientCode;
  label: string;
  unit: NutrientUnit;
  legacyKey?: string;
  v3Column?: string;
}

export const NUTRIENT_DEFINITIONS: readonly NutrientDefinition[] = [
  { code: "ENERGY_KCAL", label: "Energia", unit: "kcal", legacyKey: "energyKcal", v3Column: "energy_kcal" },
  { code: "ENERGY_KJ", label: "Energia", unit: "kJ", v3Column: "energy_kj" },
  { code: "PROTEIN", label: "Proteína", unit: "g", legacyKey: "proteinG", v3Column: "protein_g" },
  { code: "CARBOHYDRATE", label: "Carboidrato", unit: "g", legacyKey: "carbohydrateG", v3Column: "carbohydrate_g" },
  { code: "SUGARS", label: "Açúcares", unit: "g", v3Column: "sugars_g" },
  { code: "TOTAL_FAT", label: "Gorduras totais", unit: "g", legacyKey: "fatG", v3Column: "fat_g" },
  { code: "SATURATED_FAT", label: "Gordura saturada", unit: "g", v3Column: "saturated_fat_g" },
  { code: "MONOUNSATURATED_FAT", label: "Gordura monoinsaturada", unit: "g", v3Column: "monounsaturated_fat_g" },
  { code: "POLYUNSATURATED_FAT", label: "Gordura poli-insaturada", unit: "g", v3Column: "polyunsaturated_fat_g" },
  { code: "TRANS_FAT", label: "Gordura trans", unit: "g", v3Column: "trans_fat_g" },
  { code: "FIBER", label: "Fibras", unit: "g", legacyKey: "fiberG", v3Column: "fiber_g" },
  { code: "SODIUM", label: "Sódio", unit: "mg", legacyKey: "sodiumMg", v3Column: "sodium_mg" },
  { code: "CALCIUM", label: "Cálcio", unit: "mg", legacyKey: "calciumMg", v3Column: "calcium_mg" },
  { code: "IRON", label: "Ferro", unit: "mg", legacyKey: "ironMg", v3Column: "iron_mg" },
  { code: "MAGNESIUM", label: "Magnésio", unit: "mg", v3Column: "magnesium_mg" },
  { code: "PHOSPHORUS", label: "Fósforo", unit: "mg", v3Column: "phosphorus_mg" },
  { code: "POTASSIUM", label: "Potássio", unit: "mg", legacyKey: "potassiumMg", v3Column: "potassium_mg" },
  { code: "ZINC", label: "Zinco", unit: "mg", v3Column: "zinc_mg" },
  { code: "COPPER", label: "Cobre", unit: "mg", v3Column: "copper_mg" },
  { code: "MANGANESE", label: "Manganês", unit: "mg", v3Column: "manganese_mg" },
  { code: "SELENIUM", label: "Selênio", unit: "mcg", v3Column: "selenium_mcg" },
  { code: "VITAMIN_A", label: "Vitamina A", unit: "mcg", v3Column: "vitamin_a_mcg" },
  { code: "VITAMIN_C", label: "Vitamina C", unit: "mg", legacyKey: "vitaminCMg", v3Column: "vitamin_c_mg" },
  { code: "VITAMIN_D", label: "Vitamina D", unit: "mcg", v3Column: "vitamin_d_mcg" },
  { code: "VITAMIN_E", label: "Vitamina E", unit: "mg", v3Column: "vitamin_e_mg" },
  { code: "VITAMIN_K", label: "Vitamina K", unit: "mcg" },
  { code: "THIAMIN", label: "Tiamina (B1)", unit: "mg", v3Column: "vitamin_b1_mg" },
  { code: "RIBOFLAVIN", label: "Riboflavina (B2)", unit: "mg", v3Column: "vitamin_b2_mg" },
  { code: "NIACIN", label: "Niacina (B3)", unit: "mg", v3Column: "vitamin_b3_mg" },
  { code: "PANTOTHENIC_ACID", label: "Ácido pantotênico (B5)", unit: "mg" },
  { code: "VITAMIN_B6", label: "Vitamina B6", unit: "mg", v3Column: "vitamin_b6_mg" },
  { code: "FOLATE", label: "Folato", unit: "mcg", v3Column: "folate_mcg" },
  { code: "VITAMIN_B12", label: "Vitamina B12", unit: "mcg", v3Column: "vitamin_b12_mcg" },
  { code: "CHOLESTEROL", label: "Colesterol", unit: "mg", v3Column: "cholesterol_mg" },
] as const;

export const NUTRIENT_BY_CODE = Object.fromEntries(NUTRIENT_DEFINITIONS.map((item) => [item.code, item])) as Record<NutrientCode, NutrientDefinition>;
export const NUTRIENT_BY_V3_COLUMN = Object.fromEntries(NUTRIENT_DEFINITIONS.filter((item) => item.v3Column).map((item) => [item.v3Column!, item])) as Record<string, NutrientDefinition>;
export const NUTRIENT_BY_LEGACY_KEY = Object.fromEntries(NUTRIENT_DEFINITIONS.filter((item) => item.legacyKey).map((item) => [item.legacyKey!, item])) as Record<string, NutrientDefinition>;

export const LEGACY_NUTRIENT_KEYS = NUTRIENT_DEFINITIONS
  .map((definition) => definition.legacyKey)
  .filter((key): key is string => Boolean(key));

export const USDA_V3_NUTRIENT_COLUMNS = NUTRIENT_DEFINITIONS
  .map((definition) => definition.v3Column)
  .filter((column): column is string => Boolean(column));
