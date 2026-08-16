import { FOOD_RESTRICTION_CODES, type FoodRestrictionCode } from "@/lib/clinical/structured-markers";
import type { MacroReferenceFood } from "@/lib/nutrition/macros";

export const FOOD_CLINICAL_TRAIT_CODES = FOOD_RESTRICTION_CODES;
export const FOOD_CLINICAL_TRAIT_RELATIONS = ["contains", "may_contain", "free_from"] as const;
export const FOOD_CLINICAL_TRAIT_PROVENANCES = [
  "SYSTEM_CURATED",
  "PROFESSIONAL",
  "MANUFACTURER_LABEL",
  "AI_SUGGESTED_CONFIRMED",
] as const;
export const FOOD_CLINICAL_PROFILE_SOURCES = ["TACO", "CUSTOM", "MANUFACTURER", "RECIPE"] as const;

export type FoodClinicalTraitCode = FoodRestrictionCode;
export type FoodClinicalTraitRelation = typeof FOOD_CLINICAL_TRAIT_RELATIONS[number];
export type FoodClinicalTraitProvenance = typeof FOOD_CLINICAL_TRAIT_PROVENANCES[number];
export type FoodClinicalProfileSource = typeof FOOD_CLINICAL_PROFILE_SOURCES[number];
export type PersistedFoodClinicalProfileSource = Exclude<FoodClinicalProfileSource, "RECIPE">;
export type FoodClinicalProfileCompleteness = "complete" | "partial" | "unknown";

export interface FoodClinicalTrait {
  code: FoodClinicalTraitCode;
  relation: FoodClinicalTraitRelation;
  provenance: FoodClinicalTraitProvenance;
  evidenceText?: string | null;
}

export interface FoodClinicalProfile {
  foodSource: FoodClinicalProfileSource;
  foodId: string;
  traits: FoodClinicalTrait[];
  completeness: FoodClinicalProfileCompleteness;
  reasons: string[];
}

export const FOOD_CLINICAL_TRAIT_LABELS: Record<FoodClinicalTraitCode, string> = {
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
};

const ALL_CODES = [...FOOD_CLINICAL_TRAIT_CODES];
const NON_FISH_CODES = ALL_CODES.filter((code) => code !== "FISH");
const NON_SHELLFISH_CODES = ALL_CODES.filter((code) => code !== "SHELLFISH");

function profileTraits(
  contains: FoodClinicalTraitCode[],
  freeFrom: FoodClinicalTraitCode[],
  evidenceText: string
): FoodClinicalTrait[] {
  return [
    ...contains.map((code) => ({ code, relation: "contains" as const, provenance: "SYSTEM_CURATED" as const, evidenceText })),
    ...freeFrom
      .filter((code) => !contains.includes(code))
      .map((code) => ({ code, relation: "free_from" as const, provenance: "SYSTEM_CURATED" as const, evidenceText })),
  ];
}

function plantSimple(evidenceText: string): FoodClinicalTrait[] {
  return profileTraits([], ALL_CODES, evidenceText);
}

function eggSimple(evidenceText: string): FoodClinicalTrait[] {
  return profileTraits(["EGG"], ALL_CODES, evidenceText);
}

function milkSimple(evidenceText: string): FoodClinicalTrait[] {
  return profileTraits(["MILK", "LACTOSE"], ALL_CODES, evidenceText);
}

function soySimple(evidenceText: string): FoodClinicalTrait[] {
  return profileTraits(["SOY"], ALL_CODES, evidenceText);
}

function peanutSimple(evidenceText: string): FoodClinicalTrait[] {
  return profileTraits(["PEANUT"], ALL_CODES, evidenceText);
}

function treeNutSimple(evidenceText: string): FoodClinicalTrait[] {
  return profileTraits(["TREE_NUTS"], ALL_CODES, evidenceText);
}

function fishSimple(evidenceText: string): FoodClinicalTrait[] {
  return profileTraits(["FISH"], NON_FISH_CODES, evidenceText);
}

function shellfishSimple(evidenceText: string): FoodClinicalTrait[] {
  return profileTraits(["SHELLFISH"], NON_SHELLFISH_CODES, evidenceText);
}

const CURATED_TACO_TRAITS: Record<string, FoodClinicalTrait[]> = {
  "1": plantSimple("TACO: arroz integral cozido, alimento simples curado."),
  "2": plantSimple("TACO: arroz integral cru, alimento simples curado."),
  "3": plantSimple("TACO: arroz tipo 1 cozido, alimento simples curado."),
  "4": plantSimple("TACO: arroz tipo 1 cru, alimento simples curado."),
  "5": plantSimple("TACO: arroz tipo 2 cozido, alimento simples curado."),
  "6": plantSimple("TACO: arroz tipo 2 cru, alimento simples curado."),
  "86": plantSimple("TACO: batata baroa cozida, alimento simples curado."),
  "87": plantSimple("TACO: batata baroa crua, alimento simples curado."),
  "88": plantSimple("TACO: batata doce cozida, alimento simples curado."),
  "89": plantSimple("TACO: batata doce crua, alimento simples curado."),
  "91": plantSimple("TACO: batata inglesa cozida, alimento simples curado."),
  "92": plantSimple("TACO: batata inglesa crua, alimento simples curado."),
  "175": plantSimple("TACO: banana da terra crua, alimento simples curado."),
  "177": plantSimple("TACO: banana figo crua, alimento simples curado."),
  "178": plantSimple("TACO: banana maca crua, alimento simples curado."),
  "179": plantSimple("TACO: banana nanica crua, alimento simples curado."),
  "180": plantSimple("TACO: banana ouro crua, alimento simples curado."),
  "181": plantSimple("TACO: banana pacova crua, alimento simples curado."),
  "182": plantSimple("TACO: banana prata crua, alimento simples curado."),
  "259": plantSimple("TACO: azeite de dende, alimento simples curado."),
  "260": plantSimple("TACO: azeite de oliva extra virgem, alimento simples curado."),
  "485": eggSimple("TACO: ovo de codorna inteiro cru, alimento simples curado."),
  "486": eggSimple("TACO: ovo de galinha clara cozida, alimento simples curado."),
  "487": eggSimple("TACO: ovo de galinha gema cozida, alimento simples curado."),
  "488": eggSimple("TACO: ovo de galinha inteiro cozido, alimento simples curado."),
  "489": eggSimple("TACO: ovo de galinha inteiro cru, alimento simples curado."),
  "490": eggSimple("TACO: ovo de galinha inteiro frito, alimento simples curado."),
  "454": milkSimple("TACO: leite de cabra, alimento simples curado."),
  "456": milkSimple("TACO: leite de vaca desnatado em po, alimento simples curado."),
  "457": milkSimple("TACO: leite de vaca desnatado UHT, alimento simples curado."),
  "458": milkSimple("TACO: leite de vaca integral, alimento simples curado."),
  "459": milkSimple("TACO: leite de vaca integral em po, alimento simples curado."),
  "460": milkSimple("TACO: leite fermentado, alimento simples curado."),
  "581": soySimple("TACO: soja farinha, alimento simples curado."),
  "582": soySimple("TACO: extrato soluvel de soja natural fluido, alimento simples curado."),
  "583": soySimple("TACO: extrato soluvel de soja em po, alimento simples curado."),
  "584": soySimple("TACO: tofu/queijo de soja, alimento simples curado."),
  "557": peanutSimple("TACO: amendoim grao cru, alimento simples curado."),
  "558": peanutSimple("TACO: amendoim torrado salgado, alimento simples curado."),
  "588": treeNutSimple("TACO: castanha-de-caju torrada salgada, alimento simples curado."),
  "589": treeNutSimple("TACO: castanha-do-Brasil crua, alimento simples curado."),
  "273": fishSimple("TACO: abadejo file congelado assado, alimento simples curado."),
  "274": fishSimple("TACO: abadejo file congelado cozido, alimento simples curado."),
  "275": fishSimple("TACO: abadejo file congelado cru, alimento simples curado."),
  "276": fishSimple("TACO: abadejo file congelado grelhado, alimento simples curado."),
  "278": fishSimple("TACO: atum fresco cru, alimento simples curado."),
  "282": fishSimple("TACO: cacao posta cozida, alimento simples curado."),
  "283": fishSimple("TACO: cacao posta crua, alimento simples curado."),
  "288": fishSimple("TACO: corimba cru, alimento simples curado."),
  "289": fishSimple("TACO: corimbata assado, alimento simples curado."),
  "290": fishSimple("TACO: corimbata cozido, alimento simples curado."),
  "291": fishSimple("TACO: corvina de agua doce crua, alimento simples curado."),
  "292": fishSimple("TACO: corvina do mar crua, alimento simples curado."),
  "293": fishSimple("TACO: corvina grande assada, alimento simples curado."),
  "294": fishSimple("TACO: corvina grande cozida, alimento simples curado."),
  "295": fishSimple("TACO: dourada de agua doce fresca, alimento simples curado."),
  "301": fishSimple("TACO: merluza file assado, alimento simples curado."),
  "302": fishSimple("TACO: merluza file cru, alimento simples curado."),
  "304": fishSimple("TACO: pescada branca crua, alimento simples curado."),
  "307": fishSimple("TACO: pescada file cru, alimento simples curado."),
  "310": fishSimple("TACO: pescadinha crua, alimento simples curado."),
  "311": fishSimple("TACO: pintado assado, alimento simples curado."),
  "312": fishSimple("TACO: pintado cru, alimento simples curado."),
  "313": fishSimple("TACO: pintado grelhado, alimento simples curado."),
  "315": fishSimple("TACO: salmao file com pele fresco grelhado, alimento simples curado."),
  "316": fishSimple("TACO: salmao sem pele fresco cru, alimento simples curado."),
  "317": fishSimple("TACO: salmao sem pele fresco grelhado, alimento simples curado."),
  "318": fishSimple("TACO: sardinha assada, alimento simples curado."),
  "321": fishSimple("TACO: sardinha inteira crua, alimento simples curado."),
  "322": fishSimple("TACO: tucunare file congelado cru, alimento simples curado."),
  "284": shellfishSimple("TACO: camarao Rio Grande grande cozido, alimento simples curado."),
  "285": shellfishSimple("TACO: camarao Rio Grande grande cru, alimento simples curado."),
  "287": shellfishSimple("TACO: caranguejo cozido, alimento simples curado."),
};

export const CURATED_TACO_FOOD_COUNT = Object.keys(CURATED_TACO_TRAITS).length;

export function getCuratedTacoClinicalTraits(foodId: string | number): FoodClinicalTrait[] {
  return CURATED_TACO_TRAITS[String(foodId)] ?? [];
}

export function buildCuratedTacoClinicalProfile(food: MacroReferenceFood): FoodClinicalProfile {
  const foodId = food.numero === undefined ? "" : String(food.numero);
  const traits = foodId ? getCuratedTacoClinicalTraits(foodId) : [];
  if (!traits.length) {
    return {
      foodSource: "TACO",
      foodId,
      traits: [],
      completeness: "unknown",
      reasons: ["taco_food_not_curated"],
    };
  }
  const hasAllCodes = ALL_CODES.every((code) => traits.some((trait) => trait.code === code));
  return {
    foodSource: "TACO",
    foodId,
    traits,
    completeness: hasAllCodes ? "complete" : "partial",
    reasons: [],
  };
}

export function normalizeFoodClinicalTraitCode(value: string): FoodClinicalTraitCode | null {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return (FOOD_CLINICAL_TRAIT_CODES as readonly string[]).includes(normalized) ? normalized as FoodClinicalTraitCode : null;
}
