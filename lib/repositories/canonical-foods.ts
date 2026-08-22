import { d1Query } from "@/lib/d1/client";
import { cachedQuery } from "@/lib/d1/query-cache";
import { canonicalFoodSearch, type CanonicalDbExecutor, type CanonicalFoodSearchQuery, type CanonicalFoodSearchResult, type CanonicalPortionSummary } from "@/lib/nutrition/canonical-food-search";
import type { CanonicalFoodSource } from "@/lib/nutrition-import/types";
import type { NutrientCode } from "@/lib/nutrition/nutrient-vocabulary";

/**
 * FASE 4 (item 3) — camada de acesso de dados unica pro Canonical Food
 * Search/Resolver Bridge, no MESMO padrao ja usado pelos outros
 * repositories do projeto (funcoes async simples, sem classe — ver
 * lib/repositories/food-portions.ts). Compativel com D1 real (default,
 * via d1Query) E SQLite local (injetando `db`, mesmo contrato de
 * lib/nutrition/canonical-food-search.ts#CanonicalDbExecutor) — usado
 * pelos scripts de importacao/benchmark/shadow desta e das fases
 * anteriores, e pelos testes de integracao desta fase.
 *
 * NUNCA chamado por lib/nutrition/food-resolver.ts nem food-catalog.ts
 * (os ativos) nesta fase — so por lib/nutrition/canonical-food-shadow.ts.
 */

async function defaultExecutor(sql: string, params: unknown[]): Promise<Record<string, unknown>[]> {
  return d1Query<Record<string, unknown>>(sql, params);
}

export interface CanonicalFoodDetail {
  foodId: string;
  source: CanonicalFoodSource;
  sourceFoodId: string;
  name: string;
  normalizedName: string;
  scientificName: string | null;
  preparation: { method: string | null; code: string | null; name: string | null } | null;
  classification: { group: string | null; foodType: string | null } | null;
  sourceDetailUrl: string | null;
}

export interface CanonicalNutrientValue {
  nutrientCode: NutrientCode | null;
  value: number | null;
  unit: string;
  basis: string;
  status: "reported" | "trace" | "missing" | "not_applicable" | "unparsed";
  source: CanonicalFoodSource;
  sourceFoodId: string;
  sourceNutrientId: string;
}

/** item 4: search() — delega direto pra canonicalFoodSearch, sem duplicar a logica de ranking. */
export async function search(query: CanonicalFoodSearchQuery): Promise<CanonicalFoodSearchResult[]> {
  return canonicalFoodSearch(query);
}

// FASE 4.5 (item 9) — TTL curto: dado de referencia (nunca clinico), mas
// nao "eterno" — sobrevive a picos de uso repetido do MESMO alimento (ex.:
// varias refeicoes do mesmo plano citando "arroz branco cozido") sem
// arriscar servir dado desatualizado por muito tempo apos uma reimportacao
// que esqueceu de chamar invalidateAll(). So aplicado quando NENHUM
// executor customizado foi injetado (db === defaultExecutor) — testes que
// injetam SQLite local/temp nunca passam por aqui, entao nunca vazam cache
// entre execucoes de teste.
const REFERENCE_DATA_TTL_MS = 5 * 60 * 1000;

/** item 4: getById() — um alimento canonico por id, sem porcoes/nutrientes (chamadas separadas, item 4). */
export async function getById(foodId: string, db: CanonicalDbExecutor = defaultExecutor): Promise<CanonicalFoodDetail | null> {
  if (db === defaultExecutor) return cachedQuery(`canonical:food:${foodId}`, REFERENCE_DATA_TTL_MS, () => getByIdUncached(foodId, db));
  return getByIdUncached(foodId, db);
}

async function getByIdUncached(foodId: string, db: CanonicalDbExecutor): Promise<CanonicalFoodDetail | null> {
  const rows = await db(
    `SELECT id, source, source_food_id, name, normalized_name, scientific_name,
            preparation_method, preparation_code, preparation_name,
            classification_group, classification_food_type, source_detail_url
       FROM canonical_foods WHERE id = ?`,
    [foodId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    foodId: String(row.id),
    source: row.source as CanonicalFoodSource,
    sourceFoodId: String(row.source_food_id),
    name: String(row.name),
    normalizedName: String(row.normalized_name),
    scientificName: (row.scientific_name as string | null) ?? null,
    preparation: row.preparation_method || row.preparation_code || row.preparation_name
      ? { method: (row.preparation_method as string | null) ?? null, code: (row.preparation_code as string | null) ?? null, name: (row.preparation_name as string | null) ?? null }
      : null,
    classification: row.classification_group || row.classification_food_type
      ? { group: (row.classification_group as string | null) ?? null, foodType: (row.classification_food_type as string | null) ?? null }
      : null,
    sourceDetailUrl: (row.source_detail_url as string | null) ?? null,
  };
}

/**
 * item 4/10: medidas caseiras cruas do alimento — nunca converte mL em g
 * (gramWeight so vem preenchido quando a propria fonte ja media em g;
 * ver lib/nutrition-import/portion-parsing.ts na importacao). Disponivel
 * pra integracao futura, NAO usado pelo calculo de porcao atual nesta fase.
 */
export async function getPortions(foodId: string, db: CanonicalDbExecutor = defaultExecutor): Promise<CanonicalPortionSummary[]> {
  if (db === defaultExecutor) return cachedQuery(`canonical:portions:${foodId}`, REFERENCE_DATA_TTL_MS, () => getPortionsUncached(foodId, db));
  return getPortionsUncached(foodId, db);
}

async function getPortionsUncached(foodId: string, db: CanonicalDbExecutor): Promise<CanonicalPortionSummary[]> {
  const rows = await db(
    `SELECT id, label, gram_weight, ml_weight, parsed_label_grams, weight_source, confidence
       FROM canonical_food_portions WHERE canonical_food_id = ? ORDER BY label`,
    [foodId]
  );
  return rows.map((row) => ({
    id: String(row.id),
    label: String(row.label),
    gramWeight: row.gram_weight === null ? null : Number(row.gram_weight),
    mlWeight: row.ml_weight === null ? null : Number(row.ml_weight),
    parsedLabelGrams: row.parsed_label_grams === null ? null : Number(row.parsed_label_grams),
    weightSource: row.weight_source as CanonicalPortionSummary["weightSource"],
    confidence: row.confidence as CanonicalPortionSummary["confidence"],
  }));
}

/**
 * item 4/11: getNutrients()/getCanonicalFoodNutrition() — valores
 * nutricionais base (per_100g, sem escala por porcao) de UM alimento
 * canonico. Preserva trace/missing/not_applicable exatamente como
 * importado (nunca reescreve status/value) e nunca combina com outra
 * fonte — o foodId ja e escopado a uma fonte so.
 */
export async function getNutrients(foodId: string, db: CanonicalDbExecutor = defaultExecutor): Promise<CanonicalNutrientValue[]> {
  if (db === defaultExecutor) return cachedQuery(`canonical:nutrients:${foodId}`, REFERENCE_DATA_TTL_MS, () => getNutrientsUncached(foodId, db));
  return getNutrientsUncached(foodId, db);
}

async function getNutrientsUncached(foodId: string, db: CanonicalDbExecutor): Promise<CanonicalNutrientValue[]> {
  const rows = await db(
    `SELECT nutrient_code, value, unit, basis, status, source, source_food_id, source_nutrient_id
       FROM food_nutrient_values WHERE canonical_food_id = ? AND portion_id IS NULL`,
    [foodId]
  );
  return rows.map((row) => ({
    nutrientCode: (row.nutrient_code as NutrientCode | null) ?? null,
    value: row.value === null ? null : Number(row.value),
    unit: String(row.unit),
    basis: String(row.basis),
    status: row.status as CanonicalNutrientValue["status"],
    source: row.source as CanonicalFoodSource,
    sourceFoodId: String(row.source_food_id),
    sourceNutrientId: String(row.source_nutrient_id),
  }));
}

/** Alias documentado pelo nome exato pedido no item 11 do pedido da Fase 4. */
export const getCanonicalFoodNutrition = getNutrients;

export const CanonicalFoodRepository = { search, getById, getPortions, getNutrients, getCanonicalFoodNutrition };
