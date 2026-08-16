import { normalize } from "@/lib/nutrition/normalize";
import { resolveQuantity, type HouseholdMeasureOption, type QuantityResolution } from "@/lib/nutrition/quantity-resolution";

export { normalize };

export interface MacroTotals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  recognizedItems: number;
  totalItems: number;
}

export interface MacroReferenceFood {
  numero?: number | string;
  descricao: string;
  grupo?: string;
  fonte?: "taco" | "complementar" | "custom" | "manufacturer" | "usda";
  energia_kcal: number;
  proteina_g: number;
  carboidrato_g: number;
  lipidios_g: number;
  // Nutrientes adicionais do motor da FASE 2 (lib/nutrition/nutrients.ts).
  // Opcionais e `null` quando a fonte nao tem o dado — nunca 0 por omissao,
  // para nao confundir "zero de verdade" com "sem dado" (diferente dos 4
  // macros acima, cuja semantica de coercao para 0 em "NA"/"Tr" ja sustenta
  // todo o app hoje e nao e alterada aqui).
  fibra_g?: number | null;
  sodio_mg?: number | null;
  calcio_mg?: number | null;
  ferro_mg?: number | null;
  potassio_mg?: number | null;
  vitamina_c_mg?: number | null;
  energy_kj?: number | null;
  sugars_g?: number | null;
  saturated_fat_g?: number | null;
  monounsaturated_fat_g?: number | null;
  polyunsaturated_fat_g?: number | null;
  trans_fat_g?: number | null;
  magnesium_mg?: number | null;
  phosphorus_mg?: number | null;
  zinc_mg?: number | null;
  copper_mg?: number | null;
  manganese_mg?: number | null;
  selenium_mcg?: number | null;
  vitamin_a_mcg?: number | null;
  vitamin_d_mcg?: number | null;
  vitamin_e_mg?: number | null;
  vitamin_k_mcg?: number | null;
  vitamin_b1_mg?: number | null;
  vitamin_b2_mg?: number | null;
  vitamin_b3_mg?: number | null;
  pantothenic_acid_mg?: number | null;
  vitamin_b6_mg?: number | null;
  folate_mcg?: number | null;
  vitamin_b12_mcg?: number | null;
  cholesterol_mg?: number | null;
}

export type MacroFoodReferenceSource = "TACO" | "COMPLEMENTARY" | "CUSTOM" | "MANUFACTURER" | "USDA";

export interface MacroFoodReferenceFallback {
  source: MacroFoodReferenceSource;
  sourceId: string;
  reference?: MacroReferenceFood | null;
}

const EMPTY: MacroTotals = { kcal: 0, protein: 0, carbs: 0, fat: 0, recognizedItems: 0, totalItems: 0 };

/**
 * Wrapper fino sobre o motor central de resolucao de quantidade
 * (lib/nutrition/quantity-resolution.ts) \u2014 preserva o contrato sincrono
 * numerico que todo chamador legado (recipes.ts, ProtocolBuilder.tsx,
 * estimateFoodMacros abaixo, etc.) ja espera, sem duplicar a logica de
 * conversao. Quando a quantidade nao pode ser resolvida com nenhuma
 * confianca (method="unresolved"), devolve 0 \u2014 mesmo sinal de "sem grama
 * calculavel" que o resto do app ja trata hoje (nunca inventa um numero).
 * Quem precisa saber O PORQUE (metodo/confianca/aviso) deve chamar
 * `resolveQuantity` diretamente em vez desta funcao.
 */
export function quantityInGrams(quantity?: string | number | null, unit?: string | null) {
  return resolveQuantity({ quantity, unit }).grams ?? 0;
}

/**
 * Match textual puro (ultimo recurso da cadeia de prioridade — ver
 * `resolveFoodReference` abaixo, que tenta o vinculo por id ANTES de cair
 * aqui). Ranking em 3 niveis (exato > comeca-com > contem), mesmo criterio
 * ja usado em lib/nutrition/food-search.ts — antes so tinha exato/contem, o
 * que empatava com frequencia entre varias descricoes "contem" sem
 * priorizar a mais provavel.
 *
 * So compara na direcao "a descricao do alimento contem o texto digitado"
 * (ex.: usuario digita "arroz", bate com "Arroz, tipo 1, cozido"). A
 * direcao inversa (texto digitado contem a descricao) foi removida: ela
 * causava falsos positivos reais, ex. o texto livre "arroz com feijao e
 * salsicha" batendo com a referencia curta "sal" so porque a substring
 * aparece dentro de "salsicha".
 */
export function findBestFoodReference(food: string, references: MacroReferenceFood[]): MacroReferenceFood | null {
  const normalizedFood = normalize(food);
  if (!normalizedFood) return null;
  const scored = references
    .map((reference) => {
      const normalizedDescription = normalize(reference.descricao);
      let score: number;
      if (normalizedDescription === normalizedFood) score = 0;
      else if (normalizedDescription.startsWith(normalizedFood)) score = 1;
      else if (normalizedDescription.includes(normalizedFood)) score = 2;
      else return null;
      return {
        reference,
        score,
        distance: Math.abs(normalizedDescription.length - normalizedFood.length),
        length: normalizedDescription.length,
      };
    })
    .filter((item): item is { reference: MacroReferenceFood; score: number; distance: number; length: number } => item !== null)
    .sort((a, b) => a.score - b.score || a.distance - b.distance || a.length - b.length);
  return scored[0]?.reference ?? null;
}

/**
 * Busca por identidade estruturada (food_source/food_ref_id) — prioridade
 * maxima na cadeia de resolucao (secao 11 do pedido: uma vez vinculado, o
 * calculo nunca mais depende do nome). `numero` guarda tanto o numero TACO
 * quanto o id de um alimento personalizado (ver custom-foods.ts#toMacroReferenceFood).
 */
export function findFoodReferenceByIdentity(
  references: MacroReferenceFood[],
  foodSource: string | null | undefined,
  foodRefId: string | null | undefined
): MacroReferenceFood | null {
  if (!foodSource || !foodRefId) return null;
  const expectedFonte = foodSource === "TACO" ? null : foodSource === "MANUFACTURER" ? "manufacturer" : foodSource === "USDA" ? "usda" : "custom";
  return references.find((reference) => {
    if (String(reference.numero ?? "") !== foodRefId) return false;
    if (expectedFonte === null) return reference.fonte === "taco" || reference.fonte === "complementar";
    return reference.fonte === expectedFonte;
  }) ?? null;
}

function foodReferenceMatchesIdentity(reference: MacroReferenceFood, identity: MacroFoodReferenceFallback): boolean {
  if (String(reference.numero ?? "") !== identity.sourceId) return false;
  if (identity.source === "TACO") return reference.fonte === "taco" || !reference.fonte;
  if (identity.source === "COMPLEMENTARY") return reference.fonte === "complementar";
  if (identity.source === "CUSTOM") return reference.fonte === "custom";
  if (identity.source === "MANUFACTURER") return reference.fonte === "manufacturer";
  if (identity.source === "USDA") return reference.fonte === "usda";
  return false;
}

function resolveFallbackReference(
  references: MacroReferenceFood[],
  fallback?: MacroFoodReferenceFallback | null
): MacroReferenceFood | null {
  if (!fallback?.sourceId) return null;
  return references.find((reference) => foodReferenceMatchesIdentity(reference, fallback))
    ?? (fallback.reference && foodReferenceMatchesIdentity(fallback.reference, fallback) ? fallback.reference : null);
}

export interface FoodIdentity {
  food: string;
  food_source?: string | null;
  food_ref_id?: string | null;
  resolved_grams_snapshot?: number | null;
  quantity_resolution_snapshot?: string | null;
}

/**
 * Resolve a referencia respeitando a prioridade correta: vinculo
 * estruturado primeiro, texto so como fallback (secao 11 do pedido). Mesmo
 * criterio ja usado no motor do resumo nutricional
 * (lib/nutrition/nutrients.ts#resolveItemReference), aqui reaproveitado
 * para o calculo client-side "ao vivo" do editor (que trabalha com um
 * array plano de referencias ja buscadas, nao com lookups async por id).
 */
export function resolveFoodReference(
  item: FoodIdentity,
  references: MacroReferenceFood[],
  fallback?: MacroFoodReferenceFallback | null
): MacroReferenceFood | null {
  return (
    findFoodReferenceByIdentity(references, item.food_source, item.food_ref_id) ??
    findBestFoodReference(item.food, references) ??
    resolveFallbackReference(references, fallback)
  );
}

export interface FoodMacroResolution {
  macros: MacroTotals;
  reference: MacroReferenceFood | null;
  quantity: QuantityResolution;
}

/**
 * Versao "rica" de estimateFoodMacros: usa a prioridade correta de
 * resolucao de alimento (vinculo estruturado > texto) E devolve o
 * QuantityResolution completo (metodo/confianca/aviso), para a UI poder
 * mostrar quando um valor e estimado. Usada pelo editor (rodape de macros
 * "ao vivo" por item) — `estimateFoodMacros` abaixo continua existindo tal
 * como esta para os chamadores que so precisam do numero (recipes.ts,
 * ProtocolBuilder.tsx), sem duplicar a logica de calculo em si.
 */
export function resolveFoodItemMacros(
  item: FoodIdentity & { quantity?: string | number | null; unit?: string | null },
  references: MacroReferenceFood[],
  householdMeasure?: HouseholdMeasureOption | null,
  fallback?: MacroFoodReferenceFallback | null
): FoodMacroResolution {
  const quantity = resolveQuantity({
    quantity: item.quantity,
    unit: item.unit,
    householdMeasure,
    resolvedGramsSnapshot: item.resolved_grams_snapshot,
    quantityResolutionSnapshot: item.quantity_resolution_snapshot,
  });
  if (!item.food.trim()) return { macros: EMPTY, reference: null, quantity };
  const reference = resolveFoodReference(item, references, fallback);
  if (!reference) return { macros: { ...EMPTY, totalItems: 1 }, reference: null, quantity };
  if (!quantity.grams) return { macros: { ...EMPTY, recognizedItems: 1, totalItems: 1 }, reference, quantity };
  const factor = quantity.grams / 100;
  return {
    reference,
    quantity,
    macros: {
      kcal: reference.energia_kcal * factor,
      protein: reference.proteina_g * factor,
      carbs: reference.carboidrato_g * factor,
      fat: reference.lipidios_g * factor,
      recognizedItems: 1,
      totalItems: 1,
    },
  };
}

export function estimateFoodMacros(
  food: string,
  quantity?: string | number | null,
  unit?: string | null,
  references: MacroReferenceFood[] = []
): MacroTotals {
  if (!food.trim()) return EMPTY;
  const reference = findBestFoodReference(food, references);
  if (!reference) return { ...EMPTY, totalItems: 1 };
  const grams = quantityInGrams(quantity, unit);
  if (!grams) return { ...EMPTY, recognizedItems: 1, totalItems: 1 };
  const factor = grams / 100;
  return {
    kcal: reference.energia_kcal * factor,
    protein: reference.proteina_g * factor,
    carbs: reference.carboidrato_g * factor,
    fat: reference.lipidios_g * factor,
    recognizedItems: 1,
    totalItems: 1,
  };
}

export function sumMacros(values: MacroTotals[]): MacroTotals {
  return values.reduce((total, item) => ({
    kcal: total.kcal + item.kcal,
    protein: total.protein + item.protein,
    carbs: total.carbs + item.carbs,
    fat: total.fat + item.fat,
    recognizedItems: total.recognizedItems + item.recognizedItems,
    totalItems: total.totalItems + item.totalItems,
  }), { ...EMPTY });
}

export function estimateMacrosFromLine(line: string, references: MacroReferenceFood[] | number = []): MacroTotals {
  const [food = "", detail = ""] = line.split(/\s+-\s+/, 2);
  const match = detail.match(/([\d.,]+)\s*([\p{L}]+)/u);
  return estimateFoodMacros(food, match?.[1], match?.[2], Array.isArray(references) ? references : []);
}

export function roundedMacros(value: MacroTotals): MacroTotals {
  return {
    ...value,
    kcal: Math.round(value.kcal),
    protein: Math.round(value.protein * 10) / 10,
    carbs: Math.round(value.carbs * 10) / 10,
    fat: Math.round(value.fat * 10) / 10,
  };
}
