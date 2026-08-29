import type { MacroReferenceFood } from "@/lib/nutrition/macros";
import { calculateItemNutrients, type NutrientValues } from "@/lib/nutrition/nutrients";

/**
 * Motor de Equivalência Nutricional (R3) — nunca um segundo calculador.
 *
 * Reaproveita EXATAMENTE a mesma disciplina já estabelecida em
 * `lib/nutrition/equivalence.ts`/`lib/nutrition/substitution-engine.ts`
 * (usados desde a Fase 4B/exchange-groups): álgebra simples só resolve a
 * incógnita da quantidade candidata; o valor final SEMPRE é revalidado
 * por `calculateItemNutrients` (a mesma Nutrition Engine de todo o app) —
 * nunca confia na fórmula usada só pra achar a gramatura. A diferença
 * desta R3: o CRITÉRIO (energia/proteína/carboidrato/gordura) é uma
 * escolha explícita da nutricionista por chamada, não inferido pelo papel
 * nutricional do alimento como em `classifyFoodRole`.
 *
 * Não existe "alimento equivalente" absoluto — só equivalente A UM
 * critério. Por isso `criterion` está em todo lugar do contrato, nunca
 * implícito.
 */

export type EquivalentQuantityCriterion = "ENERGY" | "PROTEIN" | "CARBOHYDRATE" | "FAT";

export type EquivalentQuantityStatus =
  | "CALCULATED"
  | "NOT_CALCULABLE"
  | "MISSING_TARGET_NUTRIENT"
  | "ZERO_TARGET_NUTRIENT"
  | "INVALID_QUANTITY";

/** Campo em MacroReferenceFood (catálogo, por 100g) usado só pra resolver a incógnita. */
const CRITERION_CATALOG_FIELD: Record<EquivalentQuantityCriterion, keyof MacroReferenceFood> = {
  ENERGY: "energia_kcal",
  PROTEIN: "proteina_g",
  CARBOHYDRATE: "carboidrato_g",
  FAT: "lipidios_g",
};

/** Campo correspondente em NutrientValues (saída real da Nutrition Engine) — usado pra tudo que é exibido/comparado. */
const CRITERION_NUTRIENT_KEY: Record<EquivalentQuantityCriterion, keyof NutrientValues> = {
  ENERGY: "energyKcal",
  PROTEIN: "proteinG",
  CARBOHYDRATE: "carbohydrateG",
  FAT: "fatG",
};

export const EQUIVALENT_QUANTITY_CRITERIA: EquivalentQuantityCriterion[] = ["ENERGY", "PROTEIN", "CARBOHYDRATE", "FAT"];

export const CRITERION_LABEL: Record<EquivalentQuantityCriterion, string> = {
  ENERGY: "Energia",
  PROTEIN: "Proteína",
  CARBOHYDRATE: "Carboidratos",
  FAT: "Gordura",
};

/**
 * Política de arredondamento (seção 18 do pedido: "auditar padrões atuais
 * do projeto e justificar, não adotar faixas cegamente"). Auditoria: os
 * dois motores de equivalência já existentes no projeto
 * (`lib/nutrition/equivalence.ts#findEquivalentFoods`,
 * `lib/nutrition/substitution-engine.ts#findFoodSubstitutes`) usam,
 * ambos, incremento uniforme de 5g — não uma tabela de faixas — com o
 * mesmo racional documentado: "uma nutricionista prescreve '30g', não
 * '27.43g'". É uma política já em produção nesta base (exchange groups,
 * seção "add_manual" quando quantidade não é explícita). Mantida aqui
 * como fonte única — os dois módulos antigos agora importam DAQUI em vez
 * de manter cada um sua própria cópia privada.
 */
export const PRACTICAL_QUANTITY_INCREMENT_GRAMS = 5;
const MIN_PRACTICAL_QUANTITY_GRAMS = 5;

export function roundToPracticalQuantity(rawGrams: number): number {
  return Math.max(MIN_PRACTICAL_QUANTITY_GRAMS, Math.round(rawGrams / PRACTICAL_QUANTITY_INCREMENT_GRAMS) * PRACTICAL_QUANTITY_INCREMENT_GRAMS);
}

export interface EquivalentQuantityRequest {
  referenceFood: MacroReferenceFood;
  referenceGrams: number;
  candidateFood: MacroReferenceFood;
  criterion: EquivalentQuantityCriterion;
}

export interface EquivalentQuantityResult {
  criterion: EquivalentQuantityCriterion;
  status: EquivalentQuantityStatus;

  referenceQuantityGrams: number;
  /** Nutrição da referência na quantidade atual — sempre via Nutrition Engine. */
  referenceNutrition: NutrientValues | null;

  /** Quantidade matemática bruta (nunca a mostrada ao paciente/nutricionista). */
  rawCandidateQuantityGrams: number | null;
  /** Quantidade prática (múltiplo de 5g) — a que entra em preview/aplicação. */
  practicalCandidateQuantityGrams: number | null;

  /** Nutrição do candidato NA QUANTIDADE PRÁTICA (após arredondar) — nunca na bruta. */
  candidateNutrition: NutrientValues | null;

  /** candidateNutrition − referenceNutrition, nutriente a nutriente (missing nunca vira 0). */
  nutritionDelta: Partial<Record<keyof NutrientValues, number | null>> | null;
  /** Diferença absoluta no nutriente-critério, na quantidade prática (pode não ser 0 exato por causa do arredondamento). */
  targetDelta: number | null;
  /** targetDelta em % do valor de referência. */
  percentDifference: number | null;
}

function safeCatalogValue(food: MacroReferenceFood, criterion: EquivalentQuantityCriterion): number | null {
  const raw = food[CRITERION_CATALOG_FIELD[criterion]];
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return raw;
}

function nutrientDelta(candidate: NutrientValues, reference: NutrientValues): Partial<Record<keyof NutrientValues, number | null>> {
  const keys: (keyof NutrientValues)[] = ["energyKcal", "proteinG", "carbohydrateG", "fatG", "fiberG"];
  const delta: Partial<Record<keyof NutrientValues, number | null>> = {};
  for (const key of keys) {
    const a = candidate[key];
    const b = reference[key];
    delta[key] = a === null || a === undefined || b === null || b === undefined ? null : a - b;
  }
  return delta;
}

/**
 * Calcula, pra UM candidato, a quantidade que preservaria aproximadamente
 * o valor do critério escolhido na referência. Nunca chama IA, nunca
 * inventa dado: se o candidato não tem o nutriente-alvo no catálogo
 * (MacroReferenceFood — energia/proteína/carboidrato/gordura são campos
 * obrigatórios nesse tipo; "missing" de verdade só acontece se o objeto
 * vier malformado), ou o valor é zero, retorna o status correspondente
 * SEM dividir por zero e sem fingir um número.
 */
export function computeEquivalentQuantity(request: EquivalentQuantityRequest): EquivalentQuantityResult {
  const { referenceFood, referenceGrams, candidateFood, criterion } = request;
  const nutrientKey = CRITERION_NUTRIENT_KEY[criterion];

  const base: Omit<EquivalentQuantityResult, "status"> = {
    criterion,
    referenceQuantityGrams: referenceGrams,
    referenceNutrition: null,
    rawCandidateQuantityGrams: null,
    practicalCandidateQuantityGrams: null,
    candidateNutrition: null,
    nutritionDelta: null,
    targetDelta: null,
    percentDifference: null,
  };

  if (!Number.isFinite(referenceGrams) || referenceGrams <= 0) {
    return { ...base, status: "INVALID_QUANTITY" };
  }

  const referenceNutrition = calculateItemNutrients(String(referenceGrams), "g", referenceFood).values;
  const referenceTargetAmount = referenceNutrition[nutrientKey];
  if (referenceTargetAmount === null || referenceTargetAmount === undefined) {
    return { ...base, referenceNutrition, status: "MISSING_TARGET_NUTRIENT" };
  }
  if (referenceTargetAmount === 0) {
    // Sem quantidade-alvo real pra preservar (ex.: referência sem gordura
    // nenhuma) — não há "quantidade equivalente" que faça sentido calcular.
    return { ...base, referenceNutrition, status: "ZERO_TARGET_NUTRIENT" };
  }

  const candidatePer100 = safeCatalogValue(candidateFood, criterion);
  if (candidatePer100 === null) {
    return { ...base, referenceNutrition, status: "MISSING_TARGET_NUTRIENT" };
  }
  if (candidatePer100 === 0) {
    return { ...base, referenceNutrition, status: "ZERO_TARGET_NUTRIENT" };
  }
  if (candidatePer100 < 0) {
    return { ...base, referenceNutrition, status: "NOT_CALCULABLE" };
  }

  const rawCandidateQuantityGrams = (referenceTargetAmount / candidatePer100) * 100;
  if (!Number.isFinite(rawCandidateQuantityGrams) || rawCandidateQuantityGrams <= 0) {
    return { ...base, referenceNutrition, status: "NOT_CALCULABLE" };
  }

  const practicalCandidateQuantityGrams = roundToPracticalQuantity(rawCandidateQuantityGrams);
  // Nunca confia no valor algébrico pós-arredondamento — recalcula pela
  // engine real na quantidade PRÁTICA (seção 19 do pedido).
  const candidateNutrition = calculateItemNutrients(String(practicalCandidateQuantityGrams), "g", candidateFood).values;
  const candidateTargetAmount = candidateNutrition[nutrientKey];
  const targetDelta = candidateTargetAmount === null || candidateTargetAmount === undefined ? null : candidateTargetAmount - referenceTargetAmount;
  const percentDifference = targetDelta === null ? null : (targetDelta / referenceTargetAmount) * 100;

  return {
    ...base,
    status: "CALCULATED",
    referenceNutrition,
    rawCandidateQuantityGrams,
    practicalCandidateQuantityGrams,
    candidateNutrition,
    nutritionDelta: nutrientDelta(candidateNutrition, referenceNutrition),
    targetDelta,
    percentDifference,
  };
}

export interface HouseholdPortionOption {
  id: string;
  label: string;
  gramWeight: number;
  confidence?: string | null;
}

export interface HouseholdPortionMatch {
  portionId: string;
  label: string;
  gramWeight: number;
  approxCount: number;
  toleranceRatio: number;
}

/**
 * Tolerância pra converter gramas → medida caseira aproximada (seção 21):
 * só mostra "≈ N unidade(s)" quando o número inteiro de porções mais
 * próximo reconstrói a quantidade prática dentro de ±15% — fora disso, a
 * aproximação enganaria mais do que ajudaria, e a UI simplesmente não
 * mostra nenhuma medida (nunca inventa "colher"/"xícara"/"unidade" sem uma
 * porção canônica real por trás — seção 20).
 */
const HOUSEHOLD_PORTION_TOLERANCE_RATIO = 0.15;

/**
 * Encontra a MELHOR medida caseira real (nunca inventada) que aproxima a
 * quantidade prática calculada. Sempre usa o label já existente no dataset
 * de porções (TACO/custom/manufacturer/TBCA/IBGE_POF, via
 * `getFoodPortions` — nunca uma nomenclatura paralela). Desempate
 * determinístico: menor distância relativa vence; ao empatar, a primeira
 * porção da lista (ordem já vinda do repositório) é mantida.
 */
export function matchHouseholdPortion(practicalQuantityGrams: number, portions: HouseholdPortionOption[]): HouseholdPortionMatch | null {
  if (!Number.isFinite(practicalQuantityGrams) || practicalQuantityGrams <= 0 || !portions.length) return null;
  let best: HouseholdPortionMatch | null = null;
  let bestDistanceRatio = Number.POSITIVE_INFINITY;
  for (const portion of portions) {
    if (!Number.isFinite(portion.gramWeight) || portion.gramWeight <= 0) continue;
    const rawCount = practicalQuantityGrams / portion.gramWeight;
    const roundedCount = Math.round(rawCount);
    if (roundedCount <= 0) continue;
    const approxGrams = roundedCount * portion.gramWeight;
    const distanceRatio = Math.abs(approxGrams - practicalQuantityGrams) / practicalQuantityGrams;
    if (distanceRatio > HOUSEHOLD_PORTION_TOLERANCE_RATIO) continue;
    if (distanceRatio < bestDistanceRatio) {
      bestDistanceRatio = distanceRatio;
      best = { portionId: portion.id, label: portion.label, gramWeight: portion.gramWeight, approxCount: roundedCount, toleranceRatio: distanceRatio };
    }
  }
  return best;
}

export interface RankedEquivalentCandidate {
  candidateFood: MacroReferenceFood;
  result: EquivalentQuantityResult;
  sameCategory: boolean;
}

/**
 * Ranking 100% determinístico e explicável (nunca IA, nunca rótulo clínico
 * "bom/ruim"): só ordena candidatos já `CALCULATED` por proximidade real ao
 * critério na quantidade PRÁTICA (a mesma usada em `computeEquivalentQuantity`
 * / `findFoodSubstitutes`), priorizando sempre o mesmo grupo do TACO primeiro
 * — mesma regra já usada em `equivalence.ts`/`substitution-engine.ts`, pra
 * nunca sugerir "banana → açúcar" só porque o critério bate. Desempate por
 * nome (`descricao`) garante ordem estável entre execuções.
 */
export function rankEquivalentCandidates(
  referenceFood: MacroReferenceFood,
  candidates: Array<{ candidateFood: MacroReferenceFood; result: EquivalentQuantityResult }>
): RankedEquivalentCandidate[] {
  return candidates
    .map(({ candidateFood, result }) => ({
      candidateFood,
      result,
      sameCategory: Boolean(referenceFood.grupo) && candidateFood.grupo === referenceFood.grupo,
    }))
    .filter((entry) => entry.result.status === "CALCULATED")
    .sort((a, b) => {
      if (a.sameCategory !== b.sameCategory) return a.sameCategory ? -1 : 1;
      const aDiff = Math.abs(a.result.percentDifference ?? Number.POSITIVE_INFINITY);
      const bDiff = Math.abs(b.result.percentDifference ?? Number.POSITIVE_INFINITY);
      if (aDiff !== bDiff) return aDiff - bDiff;
      return a.candidateFood.descricao.localeCompare(b.candidateFood.descricao);
    });
}
