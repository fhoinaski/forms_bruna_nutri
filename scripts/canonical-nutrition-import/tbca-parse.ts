import { buildCanonicalFoodId, buildNutrientStatisticsId, buildNutrientValueId, buildPortionId } from "@/lib/nutrition-import/ids";
import { normalizeBasis, normalizeUnit } from "@/lib/nutrition-import/normalize-units";
import { normalizeStatus } from "@/lib/nutrition-import/normalize-status";
import { parseTbcaMainNutrientId, resolveTbcaMainNutrientCode, resolveTbcaStatsNutrientCode } from "@/lib/nutrition-import/nutrient-mapping";
import { resolvePortionWeight } from "@/lib/nutrition-import/portion-parsing";
import type { CanonicalFoodPortionRecord, CanonicalFoodRecord, FoodNutrientValueRecord, NutrientStatisticsRecord } from "@/lib/nutrition-import/types";
import { buildNormalizedName, derivePreparationMethod, disambiguateSourceNutrientId, recordUnmapped, type ImportCounters } from "./common";

const TBCA_SOURCE_VERSION = "7.3";

// -- formas cruas confirmadas por leitura direta de tbca_completa.json -----

interface TbcaMainPortion {
  portion_id: string;
  label: string;
  measure?: { quantity: number | null; unit: string | null; raw: string | null } | null;
  value: number | null;
  status: string;
  raw: string | null;
}

interface TbcaMainNutrient {
  nutrient_id: string;
  name?: string | null;
  unit: string;
  basis?: string | null;
  value: number | null;
  status: string;
  raw: string | null;
  portions?: TbcaMainPortion[];
  references?: string | null;
}

export interface TbcaMainFood {
  id: string;
  source_food_id: string;
  name: string;
  scientific_name?: string | null;
  basis: string;
  classification?: { group?: string | null; food_type?: string | null } | null;
  source_detail_url?: string | null;
  nutrients: TbcaMainNutrient[];
}

interface TbcaStatsNutrient {
  nutrient_id: string;
  name?: string | null;
  tagname?: string | null;
  unit: string;
  basis?: string | null;
  value_per_100g: number | null;
  value_per_100g_status: string;
  value_per_100g_raw: string | null;
  standard_deviation: number | null;
  minimum: number | null;
  maximum: number | null;
  number_of_data: number | null;
  data_type?: string | null;
  references?: string | null;
}

export interface TbcaStatsFood {
  id: string;
  source_food_id: string;
  name: string;
  scientific_name?: string | null;
  basis: string;
  classification?: { group?: string | null; food_type?: string | null } | null;
  source_detail_url?: string | null;
  nutrients: TbcaStatsNutrient[];
}

export interface TbcaParsedFood {
  food: CanonicalFoodRecord;
  nutrientValues: FoodNutrientValueRecord[];
  portions: CanonicalFoodPortionRecord[];
}

/**
 * Colecao principal (composicao_alimentos_medidas_caseiras) e biodiversidade
 * (biodiversidade_e_alimentos_regionais) compartilham exatamente a mesma
 * forma de `nutrients[]` (nutrient_id/unit/value/status/raw), so a principal
 * tem `portions[]` dentro de cada nutriente — biodiversidade nunca tem, e o
 * loop trata isso como lista vazia sem caso especial.
 */
export function parseTbcaMainLikeFood(raw: TbcaMainFood, sourceCollection: string, counters: ImportCounters): TbcaParsedFood {
  const canonicalFoodId = buildCanonicalFoodId("TBCA", raw.source_food_id, sourceCollection);
  const basisResult = normalizeBasis(raw.basis);
  const basis = basisResult.basis ?? "per_100g_edible_portion"; // fallback documentado: TBCA declara default_basis global; so usado quando o registro nao especifica um valor reconhecido

  const food: CanonicalFoodRecord = {
    id: canonicalFoodId,
    source: "TBCA",
    sourceVersion: TBCA_SOURCE_VERSION,
    sourceFoodId: raw.source_food_id,
    sourceCollection,
    name: raw.name,
    scientificName: raw.scientific_name || null,
    normalizedName: buildNormalizedName(raw.name),
    basis,
    classificationGroup: raw.classification?.group ?? null,
    classificationFoodType: raw.classification?.food_type ?? null,
    preparationMethod: derivePreparationMethod(raw.name),
    preparationCode: null,
    preparationName: null,
    sourceDetailUrl: raw.source_detail_url ?? null,
  };

  const nutrientValues: FoodNutrientValueRecord[] = [];
  const portions: CanonicalFoodPortionRecord[] = [];
  const seenPortionIds = new Set<string>();
  const usedNutrientIds = new Set<string>();

  for (const nutrient of raw.nutrients) {
    const parsedId = parseTbcaMainNutrientId(nutrient.nutrient_id);
    const slug = parsedId?.slug ?? nutrient.nutrient_id;
    const nutrientCode = resolveTbcaMainNutrientCode(slug, nutrient.unit);
    if (!nutrientCode) {
      recordUnmapped(counters, {
        source: "TBCA",
        sourceNutrientId: nutrient.nutrient_id,
        sourceName: nutrient.name ?? null,
        unit: nutrient.unit,
        reason: "slug sem NutrientCode equivalente no vocabulario atual",
      });
    }
    // Chave de armazenamento (pode diferir do nutrient_id cru quando a
    // fonte reusa o mesmo id degenerado para nutrientes diferentes no mesmo
    // alimento — ver disambiguateSourceNutrientId). O MAPEAMENTO acima usa
    // sempre o nutrient_id/slug cru, nunca o desambiguado.
    const sourceNutrientId = disambiguateSourceNutrientId(usedNutrientIds, nutrient.nutrient_id, nutrient.name);
    const unitResult = normalizeUnit(nutrient.unit);
    const status = normalizeStatus(nutrient.status);
    const nutrientBasis = normalizeBasis(nutrient.basis ?? raw.basis).basis ?? basis;

    nutrientValues.push({
      id: buildNutrientValueId(canonicalFoodId, sourceNutrientId, null),
      canonicalFoodId,
      nutrientCode,
      sourceNutrientId,
      source: "TBCA",
      sourceFoodId: raw.source_food_id,
      sourceRecordId: null,
      value: nutrient.value,
      unit: unitResult.unit ?? nutrient.unit,
      rawUnit: nutrient.unit,
      basis: nutrientBasis,
      status,
      rawValue: nutrient.raw !== null && nutrient.raw !== undefined ? String(nutrient.raw) : null,
      portionId: null,
    });

    for (const portion of nutrient.portions ?? []) {
      const portionId = buildPortionId(canonicalFoodId, portion.portion_id, portion.label);
      if (!seenPortionIds.has(portionId)) {
        seenPortionIds.add(portionId);
        const resolved = resolvePortionWeight(portion.label, portion.measure ?? null);
        portions.push({
          id: portionId,
          canonicalFoodId,
          source: "TBCA",
          sourceFoodId: raw.source_food_id,
          sourcePortionId: portion.portion_id,
          label: portion.label,
          sourceMeasureQuantity: portion.measure?.quantity ?? null,
          sourceMeasureUnit: portion.measure?.unit ?? null,
          sourceMeasureRaw: portion.measure?.raw ?? null,
          parsedLabelGrams: resolved.parsedLabelGrams,
          gramWeight: resolved.gramWeight,
          mlWeight: resolved.mlWeight,
          weightSource: resolved.weightSource,
          confidence: resolved.confidence,
        });
      }

      const portionStatus = normalizeStatus(portion.status);
      nutrientValues.push({
        id: buildNutrientValueId(canonicalFoodId, sourceNutrientId, portionId),
        canonicalFoodId,
        nutrientCode,
        sourceNutrientId,
        source: "TBCA",
        sourceFoodId: raw.source_food_id,
        sourceRecordId: portion.portion_id,
        value: portion.value,
        unit: unitResult.unit ?? nutrient.unit,
        rawUnit: nutrient.unit,
        basis: nutrientBasis,
        status: portionStatus,
        rawValue: portion.raw !== null && portion.raw !== undefined ? String(portion.raw) : null,
        portionId,
      });
    }
  }

  return { food, nutrientValues, portions };
}

export interface TbcaStatsParsed {
  statistics: NutrientStatisticsRecord[];
  /** Presente so quando a colecao NAO tem correspondente na principal (ex.: produtos) — vira tambem um valor "reported" normal. */
  standaloneNutrientValues: FoodNutrientValueRecord[];
  food: CanonicalFoodRecord | null; // preenchido so quando standalone (produtos); null quando so enriquece um food ja existente (estatistica)
}

/**
 * composicao_informacao_estatistica (enriquece um food ja existente na
 * principal, casado por source_food_id IDENTICO — confirmado por leitura
 * direta do arquivo real, nao e um match assistido) e
 * composicao_informacao_estatistica_produtos (colecao disjunta — vira
 * CanonicalFood proprio, com value_per_100g tambem servindo de valor
 * "reported" normal em food_nutrient_values).
 */
export function parseTbcaStatsFood(
  raw: TbcaStatsFood,
  sourceCollection: string,
  targetCanonicalFoodId: string | null,
  counters: ImportCounters
): TbcaStatsParsed {
  const standalone = targetCanonicalFoodId === null;
  const canonicalFoodId = targetCanonicalFoodId ?? buildCanonicalFoodId("TBCA", raw.source_food_id, sourceCollection);
  const basis = normalizeBasis(raw.basis).basis ?? "per_100g_edible_portion";

  const food: CanonicalFoodRecord | null = standalone
    ? {
        id: canonicalFoodId,
        source: "TBCA",
        sourceVersion: TBCA_SOURCE_VERSION,
        sourceFoodId: raw.source_food_id,
        sourceCollection,
        name: raw.name,
        scientificName: raw.scientific_name || null,
        normalizedName: buildNormalizedName(raw.name),
        basis,
        classificationGroup: raw.classification?.group ?? null,
        classificationFoodType: raw.classification?.food_type ?? null,
        preparationMethod: derivePreparationMethod(raw.name),
        preparationCode: null,
        preparationName: null,
        sourceDetailUrl: raw.source_detail_url ?? null,
      }
    : null;

  const statistics: NutrientStatisticsRecord[] = [];
  const standaloneNutrientValues: FoodNutrientValueRecord[] = [];
  const usedNutrientIds = new Set<string>();

  for (const nutrient of raw.nutrients) {
    const tagname = nutrient.tagname ?? null;
    const nutrientCode = tagname ? resolveTbcaStatsNutrientCode(tagname, nutrient.unit) : null;
    if (!nutrientCode) {
      recordUnmapped(counters, {
        source: "TBCA",
        sourceNutrientId: nutrient.nutrient_id,
        sourceName: nutrient.name ?? tagname,
        unit: nutrient.unit,
        reason: tagname ? "tagname sem NutrientCode equivalente" : "estatistica sem tagname — nutrient_id fora do padrao esperado",
      });
    }
    // Achado real (importacao completa): varios nutrientes sem tagname
    // (tagname "—") compartilham o MESMO nutrient_id degenerado
    // "tbca:unknown:<unidade>" no mesmo alimento (ex.: "Sal de adição",
    // "Açúcar de adição", "Proteína vegetal"...). Sem desambiguar, cada um
    // depois do primeiro seria descartado silenciosamente pela UNIQUE
    // constraint — ver disambiguateSourceNutrientId em common.ts.
    const sourceNutrientId = disambiguateSourceNutrientId(usedNutrientIds, nutrient.nutrient_id, nutrient.name);
    const unitResult = normalizeUnit(nutrient.unit);
    const meanStatus = normalizeStatus(nutrient.value_per_100g_status);

    statistics.push({
      id: buildNutrientStatisticsId(canonicalFoodId, sourceNutrientId),
      canonicalFoodId,
      nutrientCode,
      sourceNutrientId,
      sourceTagname: tagname,
      source: "TBCA",
      sourceFoodId: raw.source_food_id,
      meanValue: nutrient.value_per_100g,
      meanStatus,
      standardDeviation: nutrient.standard_deviation,
      minimum: nutrient.minimum,
      maximum: nutrient.maximum,
      numberOfObservations: nutrient.number_of_data,
      dataType: nutrient.data_type ?? null,
      referencesText: nutrient.references ?? null,
    });

    if (standalone) {
      standaloneNutrientValues.push({
        id: buildNutrientValueId(canonicalFoodId, sourceNutrientId, null),
        canonicalFoodId,
        nutrientCode,
        sourceNutrientId,
        source: "TBCA",
        sourceFoodId: raw.source_food_id,
        sourceRecordId: null,
        value: nutrient.value_per_100g,
        unit: unitResult.unit ?? nutrient.unit,
        rawUnit: nutrient.unit,
        basis: normalizeBasis(nutrient.basis ?? raw.basis).basis ?? basis,
        status: meanStatus,
        rawValue: nutrient.value_per_100g_raw !== null && nutrient.value_per_100g_raw !== undefined ? String(nutrient.value_per_100g_raw) : null,
        portionId: null,
      });
    }
  }

  return { statistics, standaloneNutrientValues, food };
}
