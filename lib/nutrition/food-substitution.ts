import { findEquivalentFoods, type EquivalenceNutrient } from "@/lib/nutrition/equivalence";
import { resolveQuantity, type HouseholdMeasureOption } from "@/lib/nutrition/quantity-resolution";
import type { MacroReferenceFood } from "@/lib/nutrition/macros";

/**
 * Killer Feature 4 — substituicao alimentar segura no portal (PASSO 1).
 *
 * Puro e sincrono, sem I/O — mesma filosofia de quantity-resolution.ts e
 * equivalence.ts, que este modulo reaproveita tal como estao (nenhum
 * algoritmo novo de equivalencia e inventado aqui; so a decisao de QUANDO
 * um resultado e seguro o suficiente para ser apresentado ao paciente sem
 * intervencao da nutricionista).
 *
 * Regra central (nunca violada por design): a quantidade final SEMPRE vem
 * de `findEquivalentFoods` (motor determinístico ja existente e testado em
 * tests/nutrition-equivalence.test.ts). Este modulo nunca calcula gramatura
 * por conta propria fora dele — so decide se o cenario e seguro (safe),
 * ambiguo (ambiguous), precisa de revisao humana (requires_review) ou nao e
 * suportado (not_supported). O chamador (patient-portal-agent.ts) e quem
 * busca os alimentos/medida caseira no banco e passa tudo ja resolvido —
 * mantem este modulo testavel sem mock de D1, igual ao resto de lib/nutrition/.
 */

const DEFAULT_EQUIVALENCE_NUTRIENT: EquivalenceNutrient = "energyKcal";
const DEFAULT_TOLERANCE_PERCENT = 15;

export type FoodSubstitutionResult =
  | {
      status: "safe";
      sourceFoodId: string;
      sourceFoodName: string;
      sourceQuantity: number;
      sourceUnit: string;
      targetFoodId: string;
      targetFoodName: string;
      targetQuantity: number;
      targetUnit: string;
      equivalenceBasis: EquivalenceNutrient;
      deltaPercent: number;
    }
  | {
      /**
       * Alimento de destino nao pode ser resolvido com confianca unica —
       * varios candidatos plausiveis (secao 8/9 do pedido: nunca escolher
       * silenciosamente). O chamador deve perguntar ao paciente qual delas.
       */
      status: "ambiguous";
      reason: string;
      candidates: { id: string; name: string }[];
    }
  | {
      /** Algo impede o calculo automatico com seguranca — nunca inventar um numero aqui. */
      status: "requires_review";
      reason: string;
    }
  | {
      /** Dado insuficiente/alimento nao encontrado — nem "requires_review" (nao ha o que revisar), so nao da pra calcular. */
      status: "not_supported";
      reason: string;
    };

export interface ResolveFoodSubstitutionInput {
  sourceFood: MacroReferenceFood;
  sourceQuantity?: string | number | null;
  sourceUnit?: string | null;
  sourceHouseholdMeasure?: HouseholdMeasureOption | null;
  /**
   * Candidatos de alimento-destino ja buscados pelo chamador (busca de texto
   * livre contra TACO/personalizados). A CONTAGEM decide o resultado:
   * 0 = nao encontrado, 1 = segue para o calculo, 2+ = ambiguo. Este modulo
   * nunca faz busca de texto sozinho (isso e responsabilidade de quem chama,
   * que tem acesso ao banco/indice de busca).
   */
  targetCandidates: MacroReferenceFood[];
  equivalenceBasis?: EquivalenceNutrient;
  tolerancePercent?: number;
}

function foodId(food: MacroReferenceFood): string {
  return String(food.numero ?? "");
}

export function resolveFoodSubstitution(input: ResolveFoodSubstitutionInput): FoodSubstitutionResult {
  const equivalenceBasis = input.equivalenceBasis ?? DEFAULT_EQUIVALENCE_NUTRIENT;
  const tolerancePercent = input.tolerancePercent ?? DEFAULT_TOLERANCE_PERCENT;

  // 1. Quantidade de origem precisa ser conhecida com confianca real —
  //    "estimated"/"unresolved" nunca viram base de um calculo de troca
  //    (mesmo criterio de "nunca fingir precisao alta" ja usado no editor).
  const sourceQuantity = resolveQuantity({
    quantity: input.sourceQuantity,
    unit: input.sourceUnit,
    householdMeasure: input.sourceHouseholdMeasure,
  });
  if (sourceQuantity.method === "unresolved" || sourceQuantity.grams === null) {
    return {
      status: "not_supported",
      reason: sourceQuantity.warning ?? "Não foi possível determinar a quantidade atual desse alimento no plano.",
    };
  }
  if (sourceQuantity.confidence === "low") {
    return {
      status: "requires_review",
      reason: "A quantidade atual desse alimento no plano é uma estimativa aproximada, não precisa o suficiente para calcular uma troca com segurança automaticamente.",
    };
  }

  // 2. Alimento de destino: 0 = nao encontrado, 2+ = ambiguo, 1 = segue.
  if (input.targetCandidates.length === 0) {
    return { status: "not_supported", reason: "Não encontrei esse alimento na base de dados." };
  }
  if (input.targetCandidates.length > 1) {
    return {
      status: "ambiguous",
      reason: "Encontrei mais de um alimento parecido — preciso saber exatamente qual você quer.",
      candidates: input.targetCandidates.slice(0, 5).map((food) => ({ id: foodId(food), name: food.descricao })),
    };
  }
  const targetFood = input.targetCandidates[0];

  // 3. O calculo em si — SEMPRE via o motor ja existente, nunca reimplementado aqui.
  const equivalents = findEquivalentFoods({
    baseFood: input.sourceFood,
    amountGrams: sourceQuantity.grams,
    targetNutrient: equivalenceBasis,
    candidates: [targetFood],
    tolerancePercent,
  });
  const result = equivalents[0];
  if (!result) {
    return {
      status: "requires_review",
      reason: "Não foi possível calcular uma quantidade equivalente dentro de uma margem seguramente próxima do plano atual — vale a pena a nutricionista avaliar essa troca.",
    };
  }

  return {
    status: "safe",
    sourceFoodId: foodId(input.sourceFood),
    sourceFoodName: input.sourceFood.descricao,
    sourceQuantity: sourceQuantity.grams,
    sourceUnit: "g",
    targetFoodId: foodId(targetFood),
    targetFoodName: targetFood.descricao,
    targetQuantity: result.gramsNeeded,
    targetUnit: "g",
    equivalenceBasis,
    deltaPercent: result.deltaPercent,
  };
}
