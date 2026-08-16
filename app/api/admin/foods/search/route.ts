import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { searchAllFoods, type FoodSource } from "@/lib/nutrition/food-search";
import { normalize } from "@/lib/nutrition/macros";
import { listCustomFoods, toMacroReferenceFood } from "@/lib/repositories/custom-foods";

export const dynamic = "force-dynamic";

const VALID_SOURCES: FoodSource[] = ["TACO", "CUSTOM", "MANUFACTURER"];

export async function GET(request: NextRequest) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ message: "Nao autenticado." }, { status: 401 });

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const sourceParam = request.nextUrl.searchParams.get("source");
  const source = VALID_SOURCES.find((item) => item === sourceParam);

  // searchAllFoods() ja descarta buscas com menos de 2 caracteres uteis;
  // evitar a consulta ao D1 nesse caso poupa uma leitura completa da
  // tabela custom_foods por nada.
  if (normalize(query).length < 2) {
    return NextResponse.json({ items: [] });
  }

  // FASE 2: busca unificada (TACO + TBCA complementar + alimentos
  // personalizados) — mesmo endpoint que ja alimenta o autocomplete do
  // editor e a tool searchMealPlanFoods da IA, ambos ganham alimentos
  // personalizados sem mudanca de contrato (resposta continua sendo uma
  // lista plana de alimentos no formato ja usado hoje). listCustomFoods(query)
  // filtra por nome/marca no D1 em vez de trazer a tabela inteira a cada tecla.
  const customFoods = await listCustomFoods(query).then((foods) => foods.map(toMacroReferenceFood));
  const results = searchAllFoods(query, { limit: 15, source, customFoods });
  return NextResponse.json({ items: results.map((result) => result.food) });
}
