import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { searchAllFoods, type FoodSource } from "@/lib/nutrition/food-search";
import { listCustomFoods, toMacroReferenceFood } from "@/lib/repositories/custom-foods";

export const dynamic = "force-dynamic";

const VALID_SOURCES: FoodSource[] = ["TACO", "CUSTOM", "MANUFACTURER"];

export async function GET(request: NextRequest) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ message: "Nao autenticado." }, { status: 401 });

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const sourceParam = request.nextUrl.searchParams.get("source");
  const source = VALID_SOURCES.find((item) => item === sourceParam);

  // FASE 2: busca unificada (TACO + TBCA complementar + alimentos
  // personalizados) — mesmo endpoint que ja alimenta o autocomplete do
  // editor e a tool searchMealPlanFoods da IA, ambos ganham alimentos
  // personalizados sem mudanca de contrato (resposta continua sendo uma
  // lista plana de alimentos no formato ja usado hoje).
  const customFoods = await listCustomFoods().then((foods) => foods.map(toMacroReferenceFood));
  const results = searchAllFoods(query, { limit: 15, source, customFoods });
  return NextResponse.json({ items: results.map((result) => result.food) });
}
