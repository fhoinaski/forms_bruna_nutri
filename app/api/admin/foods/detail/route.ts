import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getFoodClinicalProfileByReference } from "@/lib/clinical/food-clinical-profile";
import { getFoodByReference, getFoodPortions, type RuntimeFoodCatalogSource } from "@/lib/nutrition/food-catalog";
import { NUTRIENT_DEFINITIONS } from "@/lib/nutrition/nutrient-vocabulary";
import type { MacroReferenceFood } from "@/lib/nutrition/macros";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_SOURCES: RuntimeFoodCatalogSource[] = ["TACO", "COMPLEMENTARY", "CUSTOM", "MANUFACTURER", "USDA"];

const NUTRIENT_FIELD_BY_CODE: Partial<Record<(typeof NUTRIENT_DEFINITIONS)[number]["code"], keyof MacroReferenceFood>> = {
  ENERGY_KCAL: "energia_kcal",
  ENERGY_KJ: "energy_kj",
  PROTEIN: "proteina_g",
  CARBOHYDRATE: "carboidrato_g",
  SUGARS: "sugars_g",
  TOTAL_FAT: "lipidios_g",
  SATURATED_FAT: "saturated_fat_g",
  MONOUNSATURATED_FAT: "monounsaturated_fat_g",
  POLYUNSATURATED_FAT: "polyunsaturated_fat_g",
  TRANS_FAT: "trans_fat_g",
  FIBER: "fibra_g",
  SODIUM: "sodio_mg",
  CALCIUM: "calcio_mg",
  IRON: "ferro_mg",
  MAGNESIUM: "magnesium_mg",
  PHOSPHORUS: "phosphorus_mg",
  POTASSIUM: "potassio_mg",
  ZINC: "zinc_mg",
  COPPER: "copper_mg",
  MANGANESE: "manganese_mg",
  SELENIUM: "selenium_mcg",
  VITAMIN_A: "vitamin_a_mcg",
  VITAMIN_C: "vitamina_c_mg",
  VITAMIN_D: "vitamin_d_mcg",
  VITAMIN_E: "vitamin_e_mg",
  VITAMIN_K: "vitamin_k_mcg",
  THIAMIN: "vitamin_b1_mg",
  RIBOFLAVIN: "vitamin_b2_mg",
  NIACIN: "vitamin_b3_mg",
  PANTOTHENIC_ACID: "pantothenic_acid_mg",
  VITAMIN_B6: "vitamin_b6_mg",
  FOLATE: "folate_mcg",
  VITAMIN_B12: "vitamin_b12_mcg",
  CHOLESTEROL: "cholesterol_mg",
};

function nutrientsFromMacroReference(food: MacroReferenceFood) {
  return NUTRIENT_DEFINITIONS.map((definition) => {
    const field = NUTRIENT_FIELD_BY_CODE[definition.code];
    const raw = field ? food[field] : null;
    const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    return {
      code: definition.code,
      label: definition.label,
      unit: definition.unit,
      value,
    };
  });
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
      nutrients: nutrientsFromMacroReference(food.macroReference),
    },
    portions,
    clinical: {
      profile: clinicalProfile,
      editable,
      message: source === "USDA" ? "Perfil clinico estruturado ainda nao disponivel para esta fonte." : null,
    },
  });
}
