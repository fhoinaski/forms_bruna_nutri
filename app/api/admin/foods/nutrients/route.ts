import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getFoodByReference, getFoodPortions, type RuntimeFoodCatalogSource } from "@/lib/nutrition/food-catalog";
import { calculateItemNutrients, type NutrientKey, type NutrientValues } from "@/lib/nutrition/nutrients";
import { NUTRIENT_DEFINITIONS, type NutrientCode } from "@/lib/nutrition/nutrient-vocabulary";
import type { HouseholdMeasureOption } from "@/lib/nutrition/quantity-resolution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_SOURCES: RuntimeFoodCatalogSource[] = ["TACO", "COMPLEMENTARY", "CUSTOM", "MANUFACTURER", "USDA"];

const NUTRIENT_KEY_BY_CODE: Record<NutrientCode, NutrientKey> = {
  ENERGY_KCAL: "energyKcal",
  ENERGY_KJ: "energyKj",
  PROTEIN: "proteinG",
  CARBOHYDRATE: "carbohydrateG",
  SUGARS: "sugarsG",
  TOTAL_FAT: "fatG",
  SATURATED_FAT: "saturatedFatG",
  MONOUNSATURATED_FAT: "monounsaturatedFatG",
  POLYUNSATURATED_FAT: "polyunsaturatedFatG",
  TRANS_FAT: "transFatG",
  FIBER: "fiberG",
  SODIUM: "sodiumMg",
  CALCIUM: "calciumMg",
  IRON: "ironMg",
  MAGNESIUM: "magnesiumMg",
  PHOSPHORUS: "phosphorusMg",
  POTASSIUM: "potassiumMg",
  ZINC: "zincMg",
  COPPER: "copperMg",
  MANGANESE: "manganeseMg",
  SELENIUM: "seleniumMcg",
  VITAMIN_A: "vitaminAMcg",
  VITAMIN_C: "vitaminCMg",
  VITAMIN_D: "vitaminDMcg",
  VITAMIN_E: "vitaminEMg",
  VITAMIN_K: "vitaminKMcg",
  THIAMIN: "thiaminMg",
  RIBOFLAVIN: "riboflavinMg",
  NIACIN: "niacinMg",
  PANTOTHENIC_ACID: "pantothenicAcidMg",
  VITAMIN_B6: "vitaminB6Mg",
  FOLATE: "folateMcg",
  VITAMIN_B12: "vitaminB12Mcg",
  CHOLESTEROL: "cholesterolMg",
  // Fase 2 da Canonical Nutrition Data Layer — shim exaustivo obrigatorio
  // pelo TypeScript (Record<NutrientCode, NutrientKey>); nenhuma fonte
  // popula estes campos hoje, entao a resposta desta rota nunca muda para
  // nenhum alimento existente.
  ADDED_SUGAR: "addedSugarG",
  ADDED_SALT: "addedSaltG",
  ADDED_FAT: "addedFatG",
  PLANT_PROTEIN: "plantProteinG",
  ANIMAL_PROTEIN: "animalProteinG",
  LINOLEIC_ACID: "linoleicAcidG",
  ALPHA_LINOLENIC_ACID: "alphaLinolenicAcidG",
  EPA: "epaG",
  DHA: "dhaG",
};

function nutrientList(values: NutrientValues, grams: number) {
  return NUTRIENT_DEFINITIONS.map((definition) => ({
    code: definition.code,
    label: definition.label,
    unit: definition.unit,
    value: values[NUTRIENT_KEY_BY_CODE[definition.code]] ?? null,
    basis: { amount: grams, unit: "g" as const },
  }));
}

function parseQuantity(value: string | null): string {
  const trimmed = value?.trim();
  return trimmed || "100";
}

export async function GET(request: NextRequest) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ message: "Nao autenticado." }, { status: 401 });

  const sourceParam = request.nextUrl.searchParams.get("source");
  const source = VALID_SOURCES.find((item) => item === sourceParam);
  const sourceId = request.nextUrl.searchParams.get("sourceId")?.trim();
  if (!source || !sourceId) {
    return NextResponse.json({ message: "Informe source e sourceId validos." }, { status: 400 });
  }

  const quantity = parseQuantity(request.nextUrl.searchParams.get("quantity"));
  const unit = request.nextUrl.searchParams.get("unit")?.trim() || "g";
  const portionId = request.nextUrl.searchParams.get("portionId")?.trim() || null;
  const ref = { source, sourceId };
  const food = await getFoodByReference(ref);
  if (!food) return NextResponse.json({ message: "Alimento nao encontrado." }, { status: 404 });

  const portions = portionId ? await getFoodPortions(ref) : [];
  const portion = portionId ? portions.find((item) => item.id === portionId) ?? null : null;
  if (portionId && !portion) {
    return NextResponse.json({ message: "Medida caseira nao encontrada para este alimento." }, { status: 404 });
  }
  if (portion && (typeof portion.gramWeight !== "number" || !Number.isFinite(portion.gramWeight) || portion.gramWeight <= 0)) {
    return NextResponse.json({ message: "Medida caseira sem gramagem valida." }, { status: 422 });
  }
  const portionGramWeight = portion?.gramWeight;

  const householdMeasure: HouseholdMeasureOption | null = portion && typeof portionGramWeight === "number"
    ? {
        id: portion.id,
        description: portion.label,
        gramEquivalent: portionGramWeight,
        source: portion.source,
        confidence: portion.confidence ?? "medium",
      }
    : null;
  const calculated = calculateItemNutrients(quantity, householdMeasure ? null : unit, food.macroReference, householdMeasure);

  return NextResponse.json({
    food: {
      ref: food.ref,
      name: food.name,
      brand: food.brand ?? null,
      group: food.group ?? null,
      sourceLabel: food.sourceLabel,
    },
    quantity,
    unit: householdMeasure ? portion?.label ?? unit : unit,
    portionId,
    grams: calculated.grams,
    resolution: calculated.resolution,
    nutrients: nutrientList(calculated.values, calculated.grams),
  });
}
