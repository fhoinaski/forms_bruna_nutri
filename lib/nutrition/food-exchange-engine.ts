import type { MacroReferenceFood } from "@/lib/nutrition/macros";
import type { FoodReference } from "@/lib/nutrition/food-catalog";
import {
  findFoodSubstitutes,
  type EquivalenceMode,
  type SubstitutionQuality,
  type NutrientSnapshot,
} from "@/lib/nutrition/substitution-engine";
import { classifyFoodExchangeGroup, isCompatibleForExchange, type FoodClassification } from "@/lib/nutrition/food-exchange-hierarchy";
import { calculateItemNutrients } from "@/lib/nutrition/nutrients";

/**
 * FASE 7 (item 4) — motor determinístico de GRUPOS DE TROCA. Evolui o
 * Substitution Engine já existente (lib/nutrition/substitution-engine.ts,
 * intocado — reaproveitado por completo pra quantidade/score/qualidade),
 * adicionando a camada que faltava: GRUPO ALIMENTAR COMO PRIMEIRO FILTRO
 * (nunca busca candidatos globalmente só por kcal), e ELIMINAÇÃO (nunca
 * só penalização) de candidatos incompatíveis por restrição/grupo.
 *
 * Fluxo obrigatório do pedido (item 4), implementado EXATAMENTE nesta
 * ordem:
 * 1-2. classifica grupo/subgrupo do alimento principal (classifyFoodExchangeGroup)
 * 3.   papel nutricional (idem, incluso na classificação)
 * 4.   exclui candidatos de grupo/subgrupo incompatível (isCompatibleForExchange)
 * 5.   aplica restrições do paciente (isRestricted — ELIMINA, nunca penaliza)
 * 6.   preparo compatível — delegado ao chamador via `candidates` já filtrados
 * 7.   só então compara nutrientes (findFoodSubstitutes)
 * 8.   ajusta quantidade (idem, dentro de findFoodSubstitutes)
 * 9.   ranqueia (idem)
 */

export interface ExchangeGroupCandidate {
  food: MacroReferenceFood;
  ref: FoodReference;
}

export interface GenerateExchangeAlternativesOptions {
  primaryFood: MacroReferenceFood;
  primaryRef: FoodReference;
  primaryGrams: number;
  candidates: ExchangeGroupCandidate[];
  /** item 18 — false por padrão: só troca dentro do MESMO subgrupo. true permite o mesmo GRUPO (nunca grupos diferentes, mesmo assim). */
  allowCrossGroup?: boolean;
  /** item 17 — restrição do paciente (alergia/vegetarianismo/rejeitado/etc). true = ELIMINA o candidato, nunca penaliza. */
  isRestricted?: (candidate: ExchangeGroupCandidate) => boolean;
  mode?: EquivalenceMode;
  /** item 10 — até 5 por padrão. */
  limit?: number;
}

export interface ExchangeGroupAlternative {
  ref: FoodReference;
  food: MacroReferenceFood;
  quantityGrams: number;
  nutrition: NutrientSnapshot;
  score: number;
  quality: SubstitutionQuality;
  sameSubgroup: boolean;
  sameGroup: boolean;
  /** item 13 — toda alternativa nasce SUGGESTED, nunca aprovada automaticamente (nem pela IA). */
  state: "SUGGESTED";
}

export interface GenerateExchangeAlternativesResult {
  primaryClassification: FoodClassification;
  alternatives: ExchangeGroupAlternative[];
  /** Quantos candidatos foram eliminados por grupo/subgrupo incompatível (item 9: score explicável — auditável em debug, nunca mostrado ao paciente). */
  excludedByGroup: number;
  /** Quantos foram eliminados por restrição do paciente. */
  excludedByRestriction: number;
}

function sameFoodRef(a: FoodReference, b: FoodReference): boolean {
  return a.source === b.source && a.sourceId === b.sourceId;
}

/**
 * item 4/9 — ponto de entrada único. Nunca chamado pela IA diretamente
 * (item 12: a IA só INTERPRETA intenção, este motor sempre calcula) — ver
 * lib/nutrition/food-exchange-ai-assist.ts pra como a IA alimenta as
 * opções aqui (allowCrossGroup/isRestricted), nunca o resultado numérico.
 */
export function generateExchangeGroupAlternatives(options: GenerateExchangeAlternativesOptions): GenerateExchangeAlternativesResult {
  const { primaryFood, primaryRef, primaryGrams, candidates, allowCrossGroup = false, isRestricted = () => false, mode = "nutritional", limit = 5 } = options;

  const primaryClassification = classifyFoodExchangeGroup(primaryFood);

  let excludedByGroup = 0;
  let excludedByRestriction = 0;
  const classificationByCandidate = new Map<ExchangeGroupCandidate, { classification: FoodClassification; sameSubgroup: boolean; sameGroup: boolean }>();

  const survivingCandidates = candidates.filter((candidate) => {
    if (sameFoodRef(candidate.ref, primaryRef)) return false; // nunca sugere o proprio alimento principal como alternativa dele mesmo
    const classification = classifyFoodExchangeGroup(candidate.food);
    const { compatible, sameSubgroup, sameGroup } = isCompatibleForExchange(primaryClassification, classification, allowCrossGroup);
    if (!compatible) {
      excludedByGroup++;
      return false;
    }
    if (isRestricted(candidate)) {
      excludedByRestriction++;
      return false;
    }
    classificationByCandidate.set(candidate, { classification, sameSubgroup, sameGroup });
    return true;
  });

  // Reaproveita 100% o motor de quantidade/score/qualidade ja existente e
  // testado (lib/nutrition/substitution-engine.ts) — nunca uma segunda
  // logica de ajuste de gramatura ou de score.
  const foodsOnly = survivingCandidates.map((c) => c.food);
  const substituteResults = findFoodSubstitutes({
    baseFood: primaryFood,
    baseGrams: primaryGrams,
    candidates: foodsOnly,
    mode,
    limit,
  });

  const refByFood = new Map(survivingCandidates.map((c) => [c.food, c.ref]));
  const metaByFood = new Map(survivingCandidates.map((c) => [c.food, classificationByCandidate.get(c)!]));

  const alternatives: ExchangeGroupAlternative[] = substituteResults.map((result) => {
    const meta = metaByFood.get(result.food)!;
    return {
      ref: refByFood.get(result.food)!,
      food: result.food,
      quantityGrams: result.quantityGrams,
      nutrition: result.nutrition,
      score: result.score,
      quality: result.quality,
      sameSubgroup: meta.sameSubgroup,
      sameGroup: meta.sameGroup,
      state: "SUGGESTED",
    };
  });

  return { primaryClassification, alternatives, excludedByGroup, excludedByRestriction };
}

/**
 * item 20 — simulação: mostra o impacto nutricional de UMA alternativa,
 * a uma quantidade OPCIONALMENTE diferente da já ajustada (ex.: a
 * nutricionista arrasta a quantidade na UI antes de aprovar), SEM alterar
 * o total oficial do plano. Não recebe o plano inteiro de propósito — só
 * o alimento e a quantidade — pra deixar impossível, por assinatura de
 * função, que este cálculo afete o estado do plano (item 21: o total do
 * plano usa exclusivamente primaryFood, nunca alternatives).
 */
export function calculateExchangeOptionNutrition(alternative: ExchangeGroupAlternative, gramsOverride?: number): NutrientSnapshot {
  if (gramsOverride === undefined || gramsOverride === alternative.quantityGrams) return alternative.nutrition;
  const { values } = calculateItemNutrients(String(gramsOverride), "g", alternative.food);
  return { energyKcal: values.energyKcal, proteinG: values.proteinG, carbohydrateG: values.carbohydrateG, fatG: values.fatG, fiberG: values.fiberG ?? null };
}
