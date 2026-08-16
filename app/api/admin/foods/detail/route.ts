import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getFoodClinicalProfileByReference } from "@/lib/clinical/food-clinical-profile";
import { getFoodByReference, getFoodPortions, type RuntimeFoodCatalogSource } from "@/lib/nutrition/food-catalog";
import { getFoodNutrientsFromReference } from "@/lib/nutrition/nutrients";
import { NUTRIENT_DEFINITIONS } from "@/lib/nutrition/nutrient-vocabulary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_SOURCES: RuntimeFoodCatalogSource[] = ["TACO", "COMPLEMENTARY", "CUSTOM", "MANUFACTURER", "USDA"];

function nutrientsFromMacroReference(food: Parameters<typeof getFoodNutrientsFromReference>[0], source: RuntimeFoodCatalogSource) {
  const labelsByCode = Object.fromEntries(NUTRIENT_DEFINITIONS.map((definition) => [definition.code, definition.label]));
  return getFoodNutrientsFromReference(food, source).map((nutrient) => ({
    code: nutrient.code,
    label: labelsByCode[nutrient.code],
    unit: nutrient.unit,
    value: nutrient.value,
    basis: nutrient.basis,
  }));
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

  const ref = { source, sourceId };
  const food = await getFoodByReference(ref);
  if (!food) return NextResponse.json({ message: "Alimento nao encontrado." }, { status: 404 });

  const [portions, clinicalProfile] = await Promise.all([
    getFoodPortions(ref),
    getFoodClinicalProfileByReference(ref),
  ]);
  const editable = source === "CUSTOM" || source === "MANUFACTURER";
  return NextResponse.json({
    food: {
      ref: food.ref,
      name: food.name,
      brand: food.brand ?? null,
      group: food.group ?? null,
      sourceLabel: food.sourceLabel,
      nutrients: nutrientsFromMacroReference(food.macroReference, source),
    },
    portions,
    clinical: {
      profile: clinicalProfile,
      editable,
      message: source === "USDA" ? "Perfil clinico estruturado ainda nao disponivel para esta fonte." : null,
    },
  });
}
